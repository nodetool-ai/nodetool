/**
 * SketchSessionStore
 *
 * One store that owns everything tied to the lifetime of the currently open
 * standalone sketch document:
 *
 *   1. Document metadata (`documentId`, `name`, `baseUpdatedAt`, save state).
 *   2. The per-layer `LayerWorkflowBinding` side-table plus the in-memory
 *      `extras` (input asset hashes + workflow drift token) that feed the
 *      dependency hash.
 *
 * Previously this state lived in two stores (`SketchDocumentStore` +
 * `SketchLayerBindingsStore`). They shared the same per-document lifecycle
 * and the same autosave path, so splitting them just bought us cross-store
 * race conditions — most visibly the LIFO unmount cleanup that nuked the
 * bindings before the autosave flush could read them.
 *
 * Hooks that survive a route change (in-flight WS jobs) live in
 * `SketchGenerationStore`; DOM refs live in `SketchCanvasRefStore`. The
 * editor state itself (layers, canvas, viewport, tool) stays in
 * `useSketchStore` because the in-node sketch modal shares it.
 */

import { useEffect, useMemo, useRef } from "react";
import { create, type StoreApi, type UseBoundStore } from "zustand";
import type {
  LayerStatus,
  LayerVersion,
  LayerWorkflowBinding
} from "@nodetool-ai/image-editor";

import { type SketchTool } from "../../components/sketch/types";
import type { SketchStore } from "../../components/sketch/state";
import {
  useSketchInstance,
  type SketchInstance
} from "./SketchInstance";
import { trpc, trpcClient } from "../../trpc/client";
import { useNotificationStore } from "../NotificationStore";
import { useAssetStore } from "../AssetStore";
import {
  computeLayerDependencyHash,
  type LayerDependencyHashInput
} from "../../lib/sketch/dependencyHash";
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

export type { LayerWorkflowBinding };

type SketchDocumentResponse = Awaited<ReturnType<typeof trpcClient.sketch.get.query>>;

interface ExternalizationResult {
  sketch: PersistedSketchEditorState;
  externalizedLayerIds: string[];
}

export interface RecordGeneratedVersionInput {
  /** Newly appended version (already persisted server-side). */
  version: LayerVersion;
  /** Hash recorded against the version — becomes the new `lastGeneratedHash`. */
  dependencyHash: string;
  /** Asset id resolved from the job output. */
  assetId: string;
}

/**
 * Per-layer values that affect the dependency hash but are not part of the
 * persisted `LayerWorkflowBinding` shape on the server.
 */
interface LayerHashExtras {
  /** Sorted-but-otherwise-opaque hashes of input assets fed into the layer. */
  inputAssetHashes: string[];
  /**
   * Monotonically increasing token bumped by `markStaleForWorkflow` to
   * invalidate every binding referencing a workflow whose graph has drifted.
   */
  workflowDriftToken: number;
}

const EMPTY_EXTRAS: LayerHashExtras = {
  inputAssetHashes: [],
  workflowDriftToken: 0
};

export interface SketchSessionState {
  // ── Document metadata ────────────────────────────────────────────────
  documentId: string | null;
  /**
   * Id of the document whose content the editor has actually hydrated into
   * the global sketch store. Distinct from `documentId` (set the moment a
   * document's *metadata* loads, before the editor mounts): the lifecycle
   * hook uses this to decide whether a freshly-mounted editor still needs to
   * seed the global store, vs. a revisit where the in-memory edits should win.
   */
  hydratedDocumentId: string | null;
  name: string;
  baseUpdatedAt: string | null;
  lastServerHash: string | null;
  saveState: "idle" | "saving" | "error";
  hasConflict: boolean;

  // ── Bindings + hash extras ──────────────────────────────────────────
  bindings: Record<string, LayerWorkflowBinding>;
  extras: Record<string, LayerHashExtras>;

  // ── Document lifecycle ──────────────────────────────────────────────
  setLoadedDocument: (
    response: Pick<SketchDocumentResponse, "id" | "name" | "updatedAt">,
    serverHash: string
  ) => void;
  /** Update the in-memory document name (kept in sync with the workspace tab). */
  setName: (name: string) => void;
  /** Record that the editor has seeded the global store from this document. */
  markHydrated: (documentId: string) => void;
  markSaving: () => void;
  markSaved: (updatedAt: string, serverHash: string) => void;
  markSaveFailed: (conflict: boolean) => void;
  reset: () => void;

  // ── Binding actions ─────────────────────────────────────────────────
  setBindings: (bindings: LayerWorkflowBinding[]) => void;
  upsertBinding: (binding: LayerWorkflowBinding) => void;
  removeBinding: (layerId: string) => void;
  getBinding: (layerId: string) => LayerWorkflowBinding | undefined;
  setParamOverride: (
    layerId: string,
    inputName: string,
    value: unknown
  ) => void;
  patchBinding: (
    layerId: string,
    patch: Partial<LayerWorkflowBinding>
  ) => void;
  setSelectedOutputNodeId: (
    layerId: string,
    selectedOutputNodeId: string
  ) => void;
  setInputAssetHashes: (layerId: string, hashes: string[]) => void;
  markStale: (layerId: string) => void;
  setStatus: (layerId: string, status: LayerStatus) => void;
  recordGeneratedVersion: (
    layerId: string,
    input: RecordGeneratedVersionInput
  ) => void;
  applyInputDrift: (
    workflowId: string,
    added: Array<{ name: string; defaultValue: unknown }>,
    removed: string[]
  ) => void;
  markStaleForWorkflow: (workflowId: string) => void;
  restoreVersion: (layerId: string, versionId: string) => void;
  setLocked: (layerId: string, locked: boolean) => void;
  revert: (layerId: string) => void;
  setParamOverrides: (
    layerId: string,
    paramOverrides: Record<string, unknown>
  ) => void;
  setBindingsOutputNode: (
    workflowId: string,
    selectedOutputNodeId: string
  ) => void;
}

function isWorkflowBound(binding: LayerWorkflowBinding): boolean {
  // Legacy data with no `kind` defaults to workflow.
  return !binding.kind || binding.kind === "workflow";
}

function recomputeBinding(
  binding: LayerWorkflowBinding,
  extras: LayerHashExtras
): LayerWorkflowBinding {
  // Direct-gen bindings don't track workflow drift — their status is set
  // explicitly by the job hook and shouldn't be touched by the hash machinery.
  if (!isWorkflowBound(binding)) {
    return binding;
  }
  const hashInput: LayerDependencyHashInput = {
    workflowId: `${binding.workflowId}:${binding.selectedOutputNodeId ?? ""}:${extras.workflowDriftToken}`,
    workflowUpdatedAt: "",
    paramOverrides: binding.paramOverrides ?? {},
    inputAssetHashes: extras.inputAssetHashes
  };
  const dependencyHash = computeLayerDependencyHash(hashInput);
  const status = deriveStatus({ ...binding, dependencyHash });
  return { ...binding, dependencyHash, status };
}

function deriveStatus(binding: LayerWorkflowBinding): LayerStatus {
  if (binding.status === "queued" || binding.status === "generating") {
    return binding.status;
  }
  if (binding.status === "failed") return "failed";
  if (binding.status === "locked") return "locked";
  if (binding.status === "missing") return "missing";
  if (!binding.lastGeneratedHash) return "draft";
  if (
    binding.dependencyHash &&
    binding.dependencyHash !== binding.lastGeneratedHash
  ) {
    return "stale";
  }
  return "generated";
}

const getExtras = (
  extras: Record<string, LayerHashExtras>,
  layerId: string
): LayerHashExtras => extras[layerId] ?? EMPTY_EXTRAS;

export type SketchSessionStoreApi = UseBoundStore<
  StoreApi<SketchSessionState>
>;

/** Create an isolated session/bindings store for one sketch-editor instance. */
export const createSketchSessionStore = (): SketchSessionStoreApi =>
  create<SketchSessionState>((set, get) => ({
  // Document metadata ----------------------------------------------------
  documentId: null,
  hydratedDocumentId: null,
  name: "",
  baseUpdatedAt: null,
  lastServerHash: null,
  saveState: "idle",
  hasConflict: false,

  // Bindings -------------------------------------------------------------
  bindings: {},
  extras: {},

  setLoadedDocument: (response, serverHash) =>
    set({
      documentId: response.id,
      name: response.name,
      baseUpdatedAt: response.updatedAt,
      lastServerHash: serverHash,
      saveState: "idle",
      hasConflict: false
    }),
  setName: (name) => set((state) => (state.name === name ? state : { name })),
  markHydrated: (documentId) => set({ hydratedDocumentId: documentId }),
  markSaving: () => set({ saveState: "saving", hasConflict: false }),
  markSaved: (updatedAt, serverHash) =>
    set({
      baseUpdatedAt: updatedAt,
      lastServerHash: serverHash,
      saveState: "idle",
      hasConflict: false
    }),
  markSaveFailed: (conflict) => set({ saveState: "error", hasConflict: conflict }),
  reset: () =>
    set({
      documentId: null,
      hydratedDocumentId: null,
      name: "",
      baseUpdatedAt: null,
      lastServerHash: null,
      saveState: "idle",
      hasConflict: false,
      bindings: {},
      extras: {}
    }),

  setBindings: (incoming) =>
    set(() => {
      // Loading bindings from the persisted document resets per-layer
      // hash extras: any in-memory drift token / asset hashes belonged to
      // the previous document.
      const nextBindings: Record<string, LayerWorkflowBinding> = {};
      const nextExtras: Record<string, LayerHashExtras> = {};
      for (const b of incoming) {
        nextExtras[b.layerId] = { ...EMPTY_EXTRAS };
        nextBindings[b.layerId] = recomputeBinding(b, nextExtras[b.layerId]);
      }
      return { bindings: nextBindings, extras: nextExtras };
    }),

  upsertBinding: (binding) =>
    set((state) => {
      const extras = getExtras(state.extras, binding.layerId);
      const nextBinding = recomputeBinding(binding, extras);
      const nextBindings = {
        ...state.bindings,
        [binding.layerId]: nextBinding
      };
      return {
        bindings: nextBindings,
        extras: state.extras[binding.layerId]
          ? state.extras
          : { ...state.extras, [binding.layerId]: { ...EMPTY_EXTRAS } }
      };
    }),

  removeBinding: (layerId) =>
    set((state) => {
      if (!(layerId in state.bindings)) {
        return state;
      }
      const nextBindings = { ...state.bindings };
      delete nextBindings[layerId];
      const nextExtras = { ...state.extras };
      delete nextExtras[layerId];
      return { bindings: nextBindings, extras: nextExtras };
    }),

  getBinding: (layerId) => get().bindings[layerId],

  setParamOverride: (layerId, inputName, value) =>
    set((state) => {
      const binding = state.bindings[layerId];
      if (!binding) return state;
      const nextOverrides = {
        ...(binding.paramOverrides ?? {}),
        [inputName]: value
      };
      const updated = recomputeBinding(
        { ...binding, paramOverrides: nextOverrides },
        getExtras(state.extras, layerId)
      );
      return { bindings: { ...state.bindings, [layerId]: updated } };
    }),

  patchBinding: (layerId, patch) =>
    set((state) => {
      const binding = state.bindings[layerId];
      if (!binding) return state;
      const merged = { ...binding, ...patch };
      const updated = recomputeBinding(
        merged,
        getExtras(state.extras, layerId)
      );
      return { bindings: { ...state.bindings, [layerId]: updated } };
    }),

  setSelectedOutputNodeId: (layerId, selectedOutputNodeId) =>
    set((state) => {
      const binding = state.bindings[layerId];
      if (!binding || binding.selectedOutputNodeId === selectedOutputNodeId) {
        return state;
      }
      const updated = recomputeBinding(
        { ...binding, selectedOutputNodeId },
        getExtras(state.extras, layerId)
      );
      return { bindings: { ...state.bindings, [layerId]: updated } };
    }),

  setInputAssetHashes: (layerId, hashes) =>
    set((state) => {
      const binding = state.bindings[layerId];
      if (!binding) return state;
      const prev = getExtras(state.extras, layerId);
      const nextExtras: LayerHashExtras = {
        ...prev,
        inputAssetHashes: [...hashes]
      };
      const updated = recomputeBinding(binding, nextExtras);
      return {
        bindings: { ...state.bindings, [layerId]: updated },
        extras: { ...state.extras, [layerId]: nextExtras }
      };
    }),

  markStale: (layerId) =>
    set((state) => {
      const binding = state.bindings[layerId];
      if (!binding) return state;
      return {
        bindings: {
          ...state.bindings,
          [layerId]: { ...binding, status: "stale" }
        }
      };
    }),

  setStatus: (layerId, status) =>
    set((state) => {
      const binding = state.bindings[layerId];
      if (!binding || binding.status === status) return state;
      return {
        bindings: { ...state.bindings, [layerId]: { ...binding, status } }
      };
    }),

  recordGeneratedVersion: (layerId, input) =>
    set((state) => {
      const binding = state.bindings[layerId];
      if (!binding) return state;
      const versions = [...binding.versions, input.version];
      const updated: LayerWorkflowBinding = {
        ...binding,
        versions,
        currentAssetId: input.assetId,
        lastGeneratedHash: input.dependencyHash,
        dependencyHash: input.dependencyHash,
        status: "generated"
      };
      return { bindings: { ...state.bindings, [layerId]: updated } };
    }),

  applyInputDrift: (workflowId, added, removed) =>
    set((state) => {
      let mutated = false;
      const removedSet = new Set(removed);
      const nextBindings: Record<string, LayerWorkflowBinding> = {};
      for (const [layerId, binding] of Object.entries(state.bindings)) {
        if (binding.workflowId !== workflowId) {
          nextBindings[layerId] = binding;
          continue;
        }
        const overrides = { ...(binding.paramOverrides ?? {}) };
        let touched = false;
        for (const key of Object.keys(overrides)) {
          if (removedSet.has(key)) {
            delete overrides[key];
            touched = true;
          }
        }
        for (const { name, defaultValue } of added) {
          if (!(name in overrides)) {
            overrides[name] = defaultValue;
            touched = true;
          }
        }
        if (!touched) {
          nextBindings[layerId] = binding;
          continue;
        }
        mutated = true;
        nextBindings[layerId] = recomputeBinding(
          { ...binding, paramOverrides: overrides },
          getExtras(state.extras, layerId)
        );
      }
      return mutated ? { bindings: nextBindings } : state;
    }),

  markStaleForWorkflow: (workflowId) =>
    set((state) => {
      let mutated = false;
      const nextBindings: Record<string, LayerWorkflowBinding> = {};
      const nextExtras: Record<string, LayerHashExtras> = { ...state.extras };
      for (const [layerId, binding] of Object.entries(state.bindings)) {
        if (binding.workflowId !== workflowId) {
          nextBindings[layerId] = binding;
          continue;
        }
        const prev = getExtras(state.extras, layerId);
        const bumped: LayerHashExtras = {
          ...prev,
          workflowDriftToken: prev.workflowDriftToken + 1
        };
        nextExtras[layerId] = bumped;
        nextBindings[layerId] = recomputeBinding(binding, bumped);
        mutated = true;
      }
      return mutated
        ? { bindings: nextBindings, extras: nextExtras }
        : state;
    }),

  restoreVersion: (layerId, versionId) =>
    set((state) => {
      const binding = state.bindings[layerId];
      if (!binding) return state;
      const version = binding.versions.find((v) => v.id === versionId);
      if (!version || version.status !== "success") return state;
      const restored: LayerWorkflowBinding = {
        ...binding,
        currentAssetId: version.assetId,
        paramOverrides: { ...version.paramOverridesSnapshot },
        lastGeneratedHash: version.dependencyHash
      };
      const updated = recomputeBinding(
        restored,
        getExtras(state.extras, layerId)
      );
      return { bindings: { ...state.bindings, [layerId]: updated } };
    }),

  setLocked: (layerId, locked) =>
    set((state) => {
      const binding = state.bindings[layerId];
      if (!binding) return state;
      if (locked) {
        if (binding.status === "locked") return state;
        return {
          bindings: {
            ...state.bindings,
            [layerId]: { ...binding, status: "locked" }
          }
        };
      }
      const cleared: LayerWorkflowBinding = { ...binding, status: "draft" };
      const updated = recomputeBinding(
        cleared,
        getExtras(state.extras, layerId)
      );
      return { bindings: { ...state.bindings, [layerId]: updated } };
    }),

  revert: (layerId) =>
    set((state) => {
      const binding = state.bindings[layerId];
      if (!binding) return state;
      const reverted: LayerWorkflowBinding = {
        ...binding,
        currentAssetId: undefined,
        lastGeneratedHash: undefined,
        status: "draft"
      };
      const updated = recomputeBinding(
        reverted,
        getExtras(state.extras, layerId)
      );
      return { bindings: { ...state.bindings, [layerId]: updated } };
    }),

  setParamOverrides: (layerId, paramOverrides) =>
    set((state) => {
      const binding = state.bindings[layerId];
      if (!binding) return state;
      const updated = recomputeBinding(
        { ...binding, paramOverrides: { ...paramOverrides } },
        getExtras(state.extras, layerId)
      );
      return { bindings: { ...state.bindings, [layerId]: updated } };
    }),

  setBindingsOutputNode: (workflowId, selectedOutputNodeId) =>
    set((state) => {
      let mutated = false;
      const nextBindings: Record<string, LayerWorkflowBinding> = {};
      for (const [layerId, binding] of Object.entries(state.bindings)) {
        if (
          binding.workflowId !== workflowId ||
          binding.selectedOutputNodeId === selectedOutputNodeId
        ) {
          nextBindings[layerId] = binding;
          continue;
        }
        mutated = true;
        nextBindings[layerId] = recomputeBinding(
          { ...binding, selectedOutputNodeId },
          getExtras(state.extras, layerId)
        );
      }
      return mutated ? { bindings: nextBindings } : state;
    })
}));

// Context-bound hooks (the reactive `useSketchSessionStore` + `useLayerBinding`)
// are defined against the active instance in the instance module and
// re-exported here so existing imports keep resolving from this path.
export {
  useSketchSessionStore,
  useSketchSessionStoreApi,
  useLayerBinding
} from "./SketchInstance";

// ── Autosave helpers ────────────────────────────────────────────────────

function sanitizeLayerFileName(name: string, index: number): string {
  const base = name
    .trim()
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "");
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
            naturalWidth: Math.max(
              1,
              layer.contentBounds?.width ?? nextSketch.canvas.width
            ),
            naturalHeight: Math.max(
              1,
              layer.contentBounds?.height ?? nextSketch.canvas.height
            ),
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
    if (
      candidate.bytes <= MAX_INLINE_LAYER_BYTES &&
      totalBytes <= MAX_PERSISTED_IMAGE_DOCUMENT_BYTES
    ) {
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

function buildSnapshot(
  editorStore: StoreApi<SketchStore>
): SketchPersistenceSnapshot {
  const sketchState = editorStore.getState();
  return {
    document: sketchState.document,
    activeTool: sketchState.activeTool ?? DEFAULT_SKETCH_ACTIVE_TOOL,
    zoom: sketchState.zoom,
    pan: sketchState.pan,
    history: stripHistoryCanvasSnapshots(sketchState.history),
    historyIndex: sketchState.historyIndex
  };
}

async function saveSnapshot(
  instance: SketchInstance,
  documentId: string,
  name: string,
  onSaved?: (response: SketchDocumentResponse) => void
): Promise<void> {
  const session = instance.session;
  const layerBindings = Object.values(session.getState().bindings);
  const snapshot = buildSnapshot(instance.editor);
  const sketch = toPersistedSketchEditorState(snapshot);
  const prepared = await externalizeOversizedBitmaps(sketch, layerBindings);
  const nextHash = computeImageDocumentHash(prepared.sketch, layerBindings);
  const store = session.getState();
  const preparedBytes = getImageDocumentByteLength(
    prepared.sketch,
    layerBindings
  );

  if (nextHash === store.lastServerHash) {
    return;
  }

  if (preparedBytes > MAX_PERSISTED_IMAGE_DOCUMENT_BYTES) {
    session.getState().markSaveFailed(false);
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

  session.getState().markSaving();

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
    session.getState().markSaved(response.updatedAt, nextHash);
    // Mirror the freshly-saved document into the trpc query cache so a
    // remount of `SketchEditorPage` doesn't hydrate from a pre-edit cached
    // payload. Without this the page query (`staleTime: Infinity`,
    // `refetchOnMount: false`) returns the snapshot fetched on first load,
    // so any edits saved during the session vanish on revisit until gcTime
    // expires.
    onSaved?.(response);
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const conflict = rawMessage.toLowerCase().includes("concurrent");
    // Always log the underlying error so DevTools shows the full cause (zod
    // path, stack, etc.) — autosave runs in the background and otherwise has
    // no other channel to surface what went wrong.
    console.error("[sketch autosave]", error);
    session.getState().markSaveFailed(conflict);
    useNotificationStore.getState().addNotification({
      content: conflict
        ? "Sketch autosave hit a document conflict — refresh before continuing."
        : `Sketch autosave failed: ${rawMessage}`,
      type: "error",
      alert: true,
      dedupeKey: conflict
        ? `sketch-autosave-conflict:${documentId}`
        : `sketch-autosave-failed:${documentId}`,
      replaceExisting: true
    });
  }
}

export async function saveSketchDocument(
  instance: SketchInstance,
  onSaved?: (response: SketchDocumentResponse) => void
): Promise<void> {
  const store = instance.session.getState();
  if (!store.documentId || instance.saveInFlight.current) {
    return;
  }
  instance.saveInFlight.current = true;
  try {
    await saveSnapshot(instance, store.documentId, store.name, onSaved);
  } finally {
    instance.saveInFlight.current = false;
  }
}

export function useStandaloneSketchDocument(
  response: SketchDocumentResponse | undefined,
  enabled = true
): SketchPersistenceSnapshot | null {
  const instance = useSketchInstance();
  const editorStore = instance.editor;
  const sessionStore = instance.session;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingHashRef = useRef<string | null>(null);
  // Keep the latest trpc utils available to the autosave callback. Reassign
  // on every render so the closure inside `saveSnapshot` sees the current
  // utils object even though it lives outside any React effect.
  const utils = trpc.useUtils();
  const utilsRef = useRef(utils);
  utilsRef.current = utils;

  const initialState = useMemo(() => {
    if (!response) {
      return null;
    }
    return fromPersistedSketchEditorState(response.document.sketch);
  }, [response]);

  useEffect(() => {
    if (!enabled || !response || !initialState) {
      sessionStore.getState().reset();
      return;
    }
    const serverHash = computeImageDocumentHash(
      toPersistedSketchEditorState(initialState),
      response.document.layerBindings ?? []
    );
    pendingHashRef.current = serverHash;
    const session = sessionStore.getState();
    session.setLoadedDocument(
      {
        id: response.id,
        name: response.name,
        updatedAt: response.updatedAt
      },
      serverHash
    );
    session.setBindings(response.document.layerBindings ?? []);
  }, [enabled, initialState, response, sessionStore]);

  useEffect(() => {
    if (!enabled || !response || !initialState) {
      return;
    }

    let alive = true;
    // Use the instance-level flag so manual saves (saveSketchDocument) share the same guard.
    const inFlightRef = instance.saveInFlight;

    const flush = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      const store = sessionStore.getState();
      if (inFlightRef.current || !store.documentId) {
        // A manual save may be in flight (shared guard). Re-arm the debounce
        // so a pending hash isn't dropped if that save fails — but never
        // after unmount (cleanup also calls flush()).
        if (
          alive &&
          inFlightRef.current &&
          pendingHashRef.current &&
          pendingHashRef.current !== store.lastServerHash
        ) {
          schedule();
        }
        return;
      }
      const nextHash = pendingHashRef.current;
      if (!nextHash || nextHash === store.lastServerHash) {
        return;
      }
      pendingHashRef.current = null;
      inFlightRef.current = true;
      const documentId = store.documentId;
      void saveSnapshot(instance, documentId, store.name, (saved) => {
        utilsRef.current.sketch.get.setData({ id: documentId }, saved);
      }).finally(() => {
        inFlightRef.current = false;
        if (!alive) {
          return;
        }
        const currentStore = sessionStore.getState();
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
      timeoutRef.current = setTimeout(
        flush,
        SKETCH_DOCUMENT_AUTOSAVE_DEBOUNCE_MS
      );
    };

    type SelectedFields = {
      document: SketchStore["document"];
      activeTool: SketchTool;
      historyIndex: number;
      historyLength: number;
    };
    const selectPersistenceFields = (state: SketchStore): SelectedFields => ({
      document: state.document,
      activeTool: state.activeTool,
      historyIndex: state.historyIndex,
      historyLength: state.history.length
    });
    let prevSelected = selectPersistenceFields(editorStore.getState());

    const unsubscribeSketch = editorStore.subscribe((state) => {
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
        Object.values(sessionStore.getState().bindings)
      );
      pendingHashRef.current = nextHash;
      if (nextHash !== sessionStore.getState().lastServerHash) {
        schedule();
      }
    });

    // Subscribe to the merged session store too — bindings live here now,
    // and a binding change still needs to bump the pending hash.
    let prevBindings = sessionStore.getState().bindings;
    const unsubscribeSession = sessionStore.subscribe((state) => {
      if (state.bindings === prevBindings) return;
      prevBindings = state.bindings;
      const nextHash = computeImageDocumentHash(
        toPersistedSketchEditorState(buildSnapshot(editorStore)),
        Object.values(state.bindings)
      );
      pendingHashRef.current = nextHash;
      if (nextHash !== sessionStore.getState().lastServerHash) {
        schedule();
      }
    });

    return () => {
      alive = false;
      unsubscribeSketch();
      unsubscribeSession();
      flush();
    };
  }, [enabled, initialState, response, editorStore, sessionStore, instance]);

  return initialState;
}
