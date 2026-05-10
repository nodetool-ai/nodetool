import { useEffect, useMemo, useRef } from "react";
import { create } from "zustand";
import type { LayerWorkflowBinding } from "@nodetool-ai/image-editor";

import { type SketchTool } from "../../components/sketch/types";
import { useSketchStore } from "../../components/sketch/state";
import { trpcClient } from "../../trpc/client";
import { useNotificationStore } from "../NotificationStore";
import { useAssetStore } from "../AssetStore";
import { useSketchLayerBindingsStore } from "./SketchLayerBindingsStore";
import {
  computeImageDocumentHash,
  DEFAULT_SKETCH_ACTIVE_TOOL,
  fromPersistedSketchEditorState,
  getDataUrlByteLength,
  getImageDocumentByteLength,
  MAX_INLINE_LAYER_BYTES,
  MAX_PERSISTED_IMAGE_DOCUMENT_BYTES,
  SKETCH_DOCUMENT_AUTOSAVE_DEBOUNCE_MS,
  stripHistoryCanvasSnapshots,
  toPersistedSketchEditorState,
  type PersistedSketchEditorState,
  type SketchPersistenceSnapshot
} from "./persistence";

import type { sketch } from "@nodetool-ai/protocol/api-schemas";
type ImageDocumentData = sketch.ImageDocumentData;

type SketchDocumentResponse = Awaited<ReturnType<typeof trpcClient.sketch.get.query>>;

interface ExternalizationResult {
  sketch: PersistedSketchEditorState;
  externalizedLayerIds: string[];
}

interface SketchDocumentStoreState {
  documentId: string | null;
  name: string;
  baseUpdatedAt: string | null;
  lastServerHash: string | null;
  saveState: "idle" | "saving" | "error";
  hasConflict: boolean;
  setLoadedDocument: (
    response: Pick<SketchDocumentResponse, "id" | "name" | "updatedAt">,
    serverHash: string
  ) => void;
  markSaving: () => void;
  markSaved: (updatedAt: string, serverHash: string) => void;
  markSaveFailed: (conflict: boolean) => void;
  reset: () => void;
}

export const useSketchDocumentStore = create<SketchDocumentStoreState>((set) => ({
  documentId: null,
  name: "",
  baseUpdatedAt: null,
  lastServerHash: null,
  saveState: "idle",
  hasConflict: false,
  setLoadedDocument: (response, serverHash) =>
    set({
      documentId: response.id,
      name: response.name,
      baseUpdatedAt: response.updatedAt,
      lastServerHash: serverHash,
      saveState: "idle",
      hasConflict: false
    }),
  markSaving: () =>
    set({ saveState: "saving", hasConflict: false }),
  markSaved: (updatedAt, serverHash) =>
    set({
      baseUpdatedAt: updatedAt,
      lastServerHash: serverHash,
      saveState: "idle",
      hasConflict: false
    }),
  markSaveFailed: (conflict) =>
    set({ saveState: "error", hasConflict: conflict }),
  reset: () =>
    set({
      documentId: null,
      name: "",
      baseUpdatedAt: null,
      lastServerHash: null,
      saveState: "idle",
      hasConflict: false
    })
}));

function sanitizeLayerFileName(name: string, index: number): string {
  const base = name.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "");
  return `${base || "layer"}-${index + 1}.png`;
}

async function dataUrlToFile(dataUrl: string, fileName: string): Promise<File> {
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  const mimeType = match?.[1] ?? "image/png";
  const blob = await fetch(dataUrl).then((response) => {
    if (!response.ok) {
      throw new Error("Failed to convert layer data into an uploadable blob");
    }
    return response.blob();
  });
  return new File([blob], fileName, { type: mimeType });
}

async function externalizeOversizedBitmaps(
  sketch: PersistedSketchEditorState,
  layerBindings: LayerWorkflowBinding[]
): Promise<ExternalizationResult> {
  const nextSketch = structuredClone(sketch);
  const uploadedRefs = new Map<string, string>();
  const externalizedLayerIds = new Set<string>();

  type Candidate = {
    key: string;
    bytes: number;
    getValue: () => string | null;
    replace: (uri: string) => void;
    fileName: string;
    layerId?: string;
  };

  const buildCandidates = (): Candidate[] => {
    const candidates: Candidate[] = [];

    nextSketch.layers.forEach((layer, index) => {
      if (!layer.data || !layer.data.startsWith("data:")) {
        return;
      }
      const data = layer.data;
      candidates.push({
        key: `layer:${layer.id}`,
        bytes: getDataUrlByteLength(data),
        fileName: sanitizeLayerFileName(layer.name, index),
        layerId: layer.id,
        getValue: () => layer.data,
        replace: (uri) => {
          layer.data = null;
          layer.imageReference = {
            uri,
            naturalWidth: Math.max(1, layer.contentBounds?.width ?? nextSketch.canvas.width),
            naturalHeight: Math.max(1, layer.contentBounds?.height ?? nextSketch.canvas.height),
            objectFit: "fill"
          };
        }
      });
    });

    nextSketch.history?.forEach((entry, entryIndex) => {
      Object.entries(entry.layerSnapshots).forEach(([layerId, snapshot]) => {
        if (!snapshot || !snapshot.startsWith("data:")) {
          return;
        }
        candidates.push({
          key: `history:${entryIndex}:${layerId}`,
          bytes: getDataUrlByteLength(snapshot),
          fileName: sanitizeLayerFileName(layerId, entryIndex),
          getValue: () => entry.layerSnapshots[layerId],
          replace: (uri) => {
            entry.layerSnapshots[layerId] = uri;
          }
        });
      });
    });

    return candidates.sort((a, b) => b.bytes - a.bytes);
  };

  const candidates = buildCandidates();

  for (const candidate of candidates) {
    const totalBytes = getImageDocumentByteLength(nextSketch, layerBindings);
    if (candidate.bytes <= MAX_INLINE_LAYER_BYTES && totalBytes <= MAX_PERSISTED_IMAGE_DOCUMENT_BYTES) {
      break;
    }

    const sourceData = candidate.getValue();
    if (typeof sourceData !== "string" || !sourceData.startsWith("data:")) {
      continue;
    }

    let uri = uploadedRefs.get(sourceData);
    if (!uri) {
      const asset = await useAssetStore.getState().createAsset(
        await dataUrlToFile(sourceData, candidate.fileName)
      );
      uri = `asset://${asset.id}`;
      uploadedRefs.set(sourceData, uri);
    }

    candidate.replace(uri);
    if (candidate.layerId) {
      externalizedLayerIds.add(candidate.layerId);
    }
  }

  return {
    sketch: nextSketch,
    externalizedLayerIds: [...externalizedLayerIds]
  };
}

function buildSnapshot(): SketchPersistenceSnapshot {
  const sketchState = useSketchStore.getState();
  return {
    document: sketchState.document,
    activeTool: sketchState.activeTool ?? DEFAULT_SKETCH_ACTIVE_TOOL,
    zoom: sketchState.zoom,
    pan: sketchState.pan,
    history: stripHistoryCanvasSnapshots(sketchState.history),
    historyIndex: sketchState.historyIndex
  };
}

async function saveSnapshot(documentId: string, name: string): Promise<void> {
  const layerBindings = Object.values(useSketchLayerBindingsStore.getState().bindings);
  const snapshot = buildSnapshot();
  const sketch = toPersistedSketchEditorState(snapshot);
  const prepared = await externalizeOversizedBitmaps(sketch, layerBindings);
  const nextHash = computeImageDocumentHash(prepared.sketch, layerBindings);
  const store = useSketchDocumentStore.getState();
  const preparedBytes = getImageDocumentByteLength(prepared.sketch, layerBindings);

  if (nextHash === store.lastServerHash) {
    return;
  }

  if (preparedBytes > MAX_PERSISTED_IMAGE_DOCUMENT_BYTES) {
    useSketchDocumentStore.getState().markSaveFailed(false);
    useNotificationStore.getState().addNotification({
      content:
        "Sketch autosave was skipped because the document is still too large even after externalizing big layers.",
      type: "warning",
      alert: false,
      dedupeKey: `sketch-autosave-too-large:${documentId}`,
      replaceExisting: true
    });
    return;
  }

  if (prepared.externalizedLayerIds.length > 0) {
    useNotificationStore.getState().addNotification({
      content:
        "Large sketch layer data was externalized to assets so the document can be saved safely.",
      type: "warning",
      alert: false,
      dedupeKey: `sketch-externalized:${documentId}`,
      replaceExisting: true
    });
  }

  useSketchDocumentStore.getState().markSaving();

  try {
    const response = await trpcClient.sketch.update.mutate({
      id: documentId,
      name,
      width: prepared.sketch.canvas.width,
      height: prepared.sketch.canvas.height,
      backgroundColor: prepared.sketch.canvas.backgroundColor,
      baseUpdatedAt: store.baseUpdatedAt ?? undefined,
      document: {
        sketch: prepared.sketch as unknown as ImageDocumentData["sketch"],
        layerBindings
      }
    });
    useSketchDocumentStore
      .getState()
      .markSaved(response.updatedAt, nextHash);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Sketch document autosave failed.";
    const conflict = message.toLowerCase().includes("concurrent");
    useSketchDocumentStore.getState().markSaveFailed(conflict);
    useNotificationStore.getState().addNotification({
      content: conflict
        ? "Sketch autosave hit a document conflict — refresh before continuing."
        : "Sketch autosave failed — your latest change may not be saved yet.",
      type: "warning",
      alert: false,
      dedupeKey: conflict
        ? `sketch-autosave-conflict:${documentId}`
        : `sketch-autosave-failed:${documentId}`,
      replaceExisting: true
    });
  }
}

export function useStandaloneSketchDocument(
  response: SketchDocumentResponse | undefined,
  enabled = true
): SketchPersistenceSnapshot | null {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingHashRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  const initialState = useMemo(() => {
    if (!response) {
      return null;
    }
    return fromPersistedSketchEditorState(response.document.sketch);
  }, [response]);

  useEffect(() => {
    if (!enabled || !response || !initialState) {
      useSketchDocumentStore.getState().reset();
      return;
    }
    const serverHash = computeImageDocumentHash(
      toPersistedSketchEditorState(initialState),
      response.document.layerBindings ?? []
    );
    pendingHashRef.current = serverHash;
    useSketchDocumentStore.getState().setLoadedDocument(
      {
        id: response.id,
        name: response.name,
        updatedAt: response.updatedAt
      },
      serverHash
    );
    useSketchLayerBindingsStore
      .getState()
      .setBindings(response.document.layerBindings ?? []);
  }, [enabled, initialState, response]);

  useEffect(() => {
    if (!enabled || !response || !initialState) {
      return;
    }

    const flush = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      const store = useSketchDocumentStore.getState();
      if (inFlightRef.current || !store.documentId) {
        return;
      }
      const nextHash = pendingHashRef.current;
      if (!nextHash || nextHash === store.lastServerHash) {
        return;
      }
      pendingHashRef.current = null;
      inFlightRef.current = true;
      void saveSnapshot(store.documentId, store.name).finally(() => {
        inFlightRef.current = false;
        const currentStore = useSketchDocumentStore.getState();
        if (
          pendingHashRef.current &&
          pendingHashRef.current !== currentStore.lastServerHash
        ) {
          schedule();
        }
      });
    };

    const schedule = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(flush, SKETCH_DOCUMENT_AUTOSAVE_DEBOUNCE_MS);
    };

    const selectPersistenceFields = (state: ReturnType<typeof useSketchStore.getState>) => ({
      document: state.document,
      activeTool: state.activeTool,
      historyIndex: state.historyIndex,
      historyLength: state.history.length
    });
    let prevSelected = selectPersistenceFields(useSketchStore.getState());

    const unsubscribeSketch = useSketchStore.subscribe((state) => {
      const nextSelected = selectPersistenceFields(state);
      if (
        nextSelected.document === prevSelected.document &&
        nextSelected.activeTool === prevSelected.activeTool &&
        nextSelected.historyIndex === prevSelected.historyIndex &&
        nextSelected.historyLength === prevSelected.historyLength
      ) {
        return;
      }
      prevSelected = nextSelected;

      const nextHash = computeImageDocumentHash(
        toPersistedSketchEditorState({
          document: state.document,
          activeTool: state.activeTool ?? DEFAULT_SKETCH_ACTIVE_TOOL,
          zoom: state.zoom,
          pan: state.pan,
          history: stripHistoryCanvasSnapshots(state.history),
          historyIndex: state.historyIndex
        }),
        Object.values(useSketchLayerBindingsStore.getState().bindings)
      );
      pendingHashRef.current = nextHash;
      if (nextHash !== useSketchDocumentStore.getState().lastServerHash) {
        schedule();
      }
    });

    const unsubscribeBindings = useSketchLayerBindingsStore.subscribe((state) => {
      const nextHash = computeImageDocumentHash(
        toPersistedSketchEditorState(buildSnapshot()),
        Object.values(state.bindings)
      );
      pendingHashRef.current = nextHash;
      if (nextHash !== useSketchDocumentStore.getState().lastServerHash) {
        schedule();
      }
    });

    return () => {
      unsubscribeSketch();
      unsubscribeBindings();
      flush();
    };
  }, [enabled, initialState, response]);

  return initialState;
}
