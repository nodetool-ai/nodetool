/**
 * Document Slice — document state, layer CRUD, group actions, canvas operations.
 */

import { createVectorLayer } from "../../vectorLayer";
import { initialHistory } from "./historySlice";

import type { StateCreator } from "zustand";
import type { SketchStore } from "../useSketchStore";
import type { SketchSetup } from "@nodetool-ai/protocol/api-schemas/sketch.js";
import type {
  SketchDocument,
  Layer,
  BlendMode,
  LayerTransform,
  SketchGuideOrientation
} from "../../types";
import {
  createDefaultDocument,
  normalizeSketchDocument,
  createDefaultLayer,
  createDefaultGroupLayer,
  generateGuideId,
  generateLayerId,
  getDescendantIds,
  isLayerCompositeVisible,
  cloneTransform,
  IDENTITY_AFFINE,
  makeAffineTransform,
  makeSingleQuadTransform
} from "../../types";

// ─── Private helpers ────────────────────────────────────────────────────────

function withUpdatedDocumentTimestamp(
  document: SketchDocument
): SketchDocument {
  return {
    ...document,
    metadata: {
      ...document.metadata,
      updatedAt: new Date().toISOString()
    }
  };
}

function setLayerTransformInDocument(
  document: SketchDocument,
  layerId: string,
  transform: LayerTransform
): SketchDocument {
  return withUpdatedDocumentTimestamp({
    ...document,
    layers: document.layers.map((layer) =>
      layer.id === layerId ? { ...layer, transform: cloneTransform(transform) } : layer
    )
  });
}

/** True if `layerId` is nested under `folderId` (direct or indirect child). */
function isDescendantOfGroupFolder(
  layers: Layer[],
  layerId: string,
  folderId: string
): boolean {
  let current: Layer | undefined = layers.find((l) => l.id === layerId);
  let depth = 0;
  while (current && depth++ < 20) {
    const parentId = current.parentId;
    if (!parentId) {
      break;
    }
    if (parentId === folderId) {
      return true;
    }
    current = layers.find((l) => l.id === parentId);
  }
  return false;
}

/**
 * Where to splice a new layer: above the active layer in panel/stack order, with
 * correct group membership. Higher flat-array index = visually higher.
 */
function computeNewLayerInsertion(
  layers: Layer[],
  activeLayerId: string | undefined
) {
  if (!activeLayerId) {
    return { insertAt: layers.length, parentId: undefined };
  }
  const activeIdx = layers.findIndex((l) => l.id === activeLayerId);
  const activeLayer = activeIdx >= 0 ? layers[activeIdx] : undefined;
  if (!activeLayer) {
    return { insertAt: layers.length, parentId: undefined };
  }

  if (activeLayer.type === "group") {
    let subtreeEnd = activeIdx;
    for (let i = activeIdx + 1; i < layers.length; i++) {
      if (!isDescendantOfGroupFolder(layers, layers[i].id, activeLayer.id)) {
        break;
      }
      subtreeEnd = i;
    }
    return {
      insertAt: subtreeEnd + 1,
      parentId: activeLayer.id
    };
  }

  return {
    insertAt: activeIdx + 1,
    parentId: activeLayer.parentId ?? undefined
  };
}

function offsetTransform(t: LayerTransform, dx: number, dy: number): LayerTransform {
  switch (t.kind) {
    case "affine":
      return makeAffineTransform({ ...t, x: t.x + dx, y: t.y + dy });
    case "quad":
      return makeSingleQuadTransform(t.mode, [
        { x: t.quad[0].x + dx, y: t.quad[0].y + dy },
        { x: t.quad[1].x + dx, y: t.quad[1].y + dy },
        { x: t.quad[2].x + dx, y: t.quad[2].y + dy },
        { x: t.quad[3].x + dx, y: t.quad[3].y + dy }
      ]);
  }
}

function offsetLayerTransformInDocument(
  document: SketchDocument,
  layerId: string,
  dx: number,
  dy: number
): SketchDocument {
  return withUpdatedDocumentTimestamp({
    ...document,
    layers: document.layers.map((layer) => {
      if (layer.id !== layerId) {
        return layer;
      }
      return { ...layer, transform: offsetTransform(layer.transform, dx, dy) };
    })
  });
}

// ─── Slice interface ────────────────────────────────────────────────────────

export interface DocumentSlice {
  document: SketchDocument;

  // Document actions
  /** Load a document: resets undo history to a single "Open" checkpoint. */
  setDocument: (doc: SketchDocument) => void;
  /**
   * Swap in an edited copy of the open document. Unlike `setDocument`, undo
   * history is kept, so the caller records the edit with `pushHistory`.
   */
  replaceDocument: (doc: SketchDocument) => void;
  resetDocument: (width?: number, height?: number) => void;
  /**
   * Patch the guided-setup block (PRD § 10.5). The image flow is a function of
   * this and nothing else, so every step writes through here — including the
   * stage, which is what a reload resumes from (D3).
   */
  setSetup: (patch: Partial<SketchSetup>) => void;
  /** Add a ruler guide and return its id. Guides are not part of undo history. */
  addGuide: (orientation: SketchGuideOrientation, position: number) => string;
  moveGuide: (guideId: string, position: number) => void;
  removeGuide: (guideId: string) => void;
  clearGuides: () => void;

  // Layer actions
  addVectorLayer: (name: string, source: string) => string;
  setVectorLayerSource: (layerId: string, source: string) => void;
  rasterizeVectorLayer: (layerId: string, data: string, expectedSource: string | null) => void;
  setActiveLayer: (layerId: string) => void;
  addLayer: (name?: string, type?: "raster" | "mask") => string;
  removeLayer: (layerId: string) => void;
  duplicateLayer: (layerId: string) => void;
  reorderLayers: (fromIndex: number, toIndex: number) => void;
  toggleLayerVisibility: (layerId: string) => void;
  setLayerOpacity: (layerId: string, opacity: number) => void;
  setLayerBlendMode: (layerId: string, blendMode: BlendMode) => void;
  renameLayer: (layerId: string, name: string) => void;
  updateLayerData: (layerId: string, data: string | null) => void;
  setLayerTransform: (layerId: string, transform: LayerTransform) => void;
  commitLayerTransform: (layerId: string, transform: LayerTransform) => void;
  setLayerContentBounds: (
    layerId: string,
    contentBounds: Layer["contentBounds"]
  ) => void;
  /**
   * Place a generated result on a layer. A result is not an edit the creator
   * made, so undo history, selection and tool settings stay as they are, and
   * every history entry carries the new reference so no undo step removes it.
   */
  setLayerImageReference: (
    layerId: string,
    imageReference: Layer["imageReference"]
  ) => void;
  translateLayer: (layerId: string, dx: number, dy: number) => void;
  offsetLayerTransform: (layerId: string, dx: number, dy: number) => void;
  setMaskLayer: (layerId: string | null) => void;
  toggleAlphaLock: (layerId: string) => void;
  toggleLayerExposedInput: (layerId: string) => void;
  toggleLayerExposedOutput: (layerId: string) => void;
  mergeLayerDown: (layerId: string) => void;
  flattenVisible: () => void;

  // Group layer actions
  addGroup: (name?: string) => string;
  toggleGroupCollapsed: (groupId: string) => void;
  moveLayerToGroup: (layerId: string, groupId: string | null) => void;
  ungroupLayer: (groupId: string) => void;
  groupLayers: (layerIds: string[]) => void;

  // Canvas actions
  setCanvasBackgroundColor: (color: string) => void;
  resizeCanvas: (width: number, height: number) => void;
  offsetAllPaintLayersTransform: (dx: number, dy: number) => void;
  /** Shift every guide with the content when the canvas origin moves. Records no history. */
  offsetGuides: (dx: number, dy: number) => void;
}

// ─── Slice creator ──────────────────────────────────────────────────────────

export const createDocumentSlice: StateCreator<
  SketchStore,
  [],
  [],
  DocumentSlice
> = (set, get) => ({
  document: createDefaultDocument(),

  setDocument: (doc: SketchDocument) => {
    const normalized = normalizeSketchDocument(doc);
    set({
      document: normalized,
      // Hydrate the separate toolSettings slice from the loaded document so
      // the runtime source of truth (store.toolSettings) matches what was saved.
      toolSettings: normalized.toolSettings,
      ...initialHistory(normalized, get().selection),
      selectedLayerIds: [],
      layerShiftRangeAnchorId: null,
      transientMoveModifierHeld: false
    });
  },

  replaceDocument: (doc: SketchDocument) => {
    set({ document: doc });
  },

  addVectorLayer: (name, source) => {
    const layer = createVectorLayer(name, source);
    get().pushHistory("import SVG", undefined, { timing: "before" });
    set((state) => ({
      document: withUpdatedDocumentTimestamp({
        ...state.document,
        layers: [...state.document.layers, layer],
        activeLayerId: layer.id
      }),
      selectedLayerIds: [],
      activeTool: "move"
    }));
    return layer.id;
  },

  setVectorLayerSource: (layerId, source) => {
    const current = get().document.layers.find((layer) => layer.id === layerId);
    if (current?.type !== "vector") {
      return;
    }
    const replacement = createVectorLayer(current.name, source);
    get().pushHistory("edit SVG", undefined, { timing: "before" });
    set((state) => ({
      document: withUpdatedDocumentTimestamp({
        ...state.document,
        layers: state.document.layers.map((layer) => layer.id === layerId
          ? { ...layer, data: replacement.data, contentBounds: replacement.contentBounds }
          : layer)
      })
    }));
  },

  rasterizeVectorLayer: (layerId, data, expectedSource) => {
    const current = get().document.layers.find((layer) => layer.id === layerId);
    if (current?.type !== "vector" || current.data !== expectedSource) {
      throw new Error("The vector layer changed. Try rasterizing it again.");
    }
    get().pushHistory("rasterize SVG", undefined, { timing: "before" });
    set((state) => ({
      document: withUpdatedDocumentTimestamp({
        ...state.document,
        layers: state.document.layers.map((layer) => layer.id === layerId
          ? { ...layer, type: "raster" as const, locked: false, data }
          : layer)
      })
    }));
  },

  addGuide: (orientation, position) => {
    const id = generateGuideId();
    set((state) => ({
      document: {
        ...state.document,
        guides: [
          ...(state.document.guides ?? []),
          { id, orientation, position: Math.round(position) }
        ]
      }
    }));
    get().pushHistory("new guide", undefined, { selectionOnly: true });
    return id;
  },

  moveGuide: (guideId, position) => {
    const guides = get().document.guides ?? [];
    const rounded = Math.round(position);
    const target = guides.find((g) => g.id === guideId);
    if (!target || target.position === rounded) {
      return;
    }
    set((state) => ({
      document: {
        ...state.document,
        guides: guides.map((g) =>
          g.id === guideId ? { ...g, position: rounded } : g
        )
      }
    }));
    get().pushHistory("move guide", undefined, { selectionOnly: true });
  },

  removeGuide: (guideId) => {
    const guides = get().document.guides ?? [];
    if (!guides.some((g) => g.id === guideId)) {
      return;
    }
    set((state) => ({
      document: {
        ...state.document,
        guides: guides.filter((g) => g.id !== guideId)
      }
    }));
    get().pushHistory("delete guide", undefined, { selectionOnly: true });
  },

  clearGuides: () => {
    if ((get().document.guides?.length ?? 0) === 0) {
      return;
    }
    set((state) => ({ document: { ...state.document, guides: [] } }));
    get().pushHistory("clear guides", undefined, { selectionOnly: true });
  },

  setSetup: (patch: Partial<SketchSetup>) =>
    set((state) => ({
      document: {
        ...state.document,
        setup: { stage: "done", brief: "", ...state.document.setup, ...patch }
      }
    })),

  resetDocument: (width = 512, height = 512) => {
    const defaultDoc = createDefaultDocument(width, height);
    set({
      document: defaultDoc,
      toolSettings: defaultDoc.toolSettings,
      activeTool: "select",
      transientMoveModifierHeld: false,
      zoom: 1,
      pan: { x: 0, y: 0 },
      isDrawing: false,
      ...initialHistory(defaultDoc, get().selection),
      selectedLayerIds: [],
      layerShiftRangeAnchorId: null
    });
  },

  setActiveLayer: (layerId: string) =>
    set((state) => ({
      document: { ...state.document, activeLayerId: layerId },
      selectedLayerIds: [],
      layerShiftRangeAnchorId: layerId
    })),

  addLayer: (name?: string, type: "raster" | "mask" = "raster") => {
    const { width, height } = get().document.canvas;
    const beforeLayerCount = get().document.layers.length;
    const baseName = name || `Layer ${beforeLayerCount + 1}`;
    const layerBase = createDefaultLayer(baseName, type, width, height);
    const newLayerId = layerBase.id;
    set((state) => {
      const layers = state.document.layers;
      const { insertAt, parentId } = computeNewLayerInsertion(
        layers,
        state.document.activeLayerId
      );
      const layer: Layer = parentId
        ? { ...layerBase, parentId }
        : layerBase;
      const newLayers = [
        ...layers.slice(0, insertAt),
        layer,
        ...layers.slice(insertAt)
      ];
      return {
        document: {
          ...state.document,
          layers: newLayers,
          activeLayerId: newLayerId,
          metadata: {
            ...state.document.metadata,
            updatedAt: new Date().toISOString()
          }
        },
        selectedLayerIds: [],
        layerShiftRangeAnchorId: newLayerId
      };
    });
    return newLayerId;
  },

  removeLayer: (layerId: string) =>
    set((state) => {
      const { layers, activeLayerId, maskLayerId } = state.document;
      if (layers.length <= 1) {
        return state;
      }
      const removed = layers.find((l) => l.id === layerId);
      const parentId = removed?.parentId ?? undefined;
      const idsToRemove = new Set([layerId]);
      if (removed?.type === "group") {
        for (const id of getDescendantIds(layers, layerId)) {
          idsToRemove.add(id);
        }
      }
      let newLayers = layers
        .filter((l) => !idsToRemove.has(l.id))
        .map((l) => (l.parentId === layerId ? { ...l, parentId } : l));
      if (newLayers.length === 0) {
        const { width, height } = state.document.canvas;
        newLayers = [
          createDefaultLayer("Background", "raster", width, height)
        ];
      }
      const newActiveId = idsToRemove.has(activeLayerId)
        ? newLayers[newLayers.length - 1].id
        : activeLayerId;
      const newMaskId =
        maskLayerId && idsToRemove.has(maskLayerId) ? null : maskLayerId;
      const nextSelection = state.selectedLayerIds.filter(
        (id) => !idsToRemove.has(id)
      );
      const anchor = state.layerShiftRangeAnchorId;
      const nextAnchor = anchor && idsToRemove.has(anchor) ? null : anchor;
      return {
        document: {
          ...state.document,
          layers: newLayers,
          activeLayerId: newActiveId,
          maskLayerId: newMaskId,
          metadata: {
            ...state.document.metadata,
            updatedAt: new Date().toISOString()
          }
        },
        selectedLayerIds: nextSelection.length >= 2 ? nextSelection : [],
        layerShiftRangeAnchorId: nextAnchor
      };
    }),

  duplicateLayer: (layerId: string) =>
    set((state) => {
      const layer = state.document.layers.find((l) => l.id === layerId);
      if (!layer) {
        return state;
      }
      // Generate a unique copy name with numeric suffix: "name copy 1", "name copy 2", ...
      const baseName = layer.name.replace(/ copy \d+$/, "").replace(/ Copy$/, "");
      const existingNames = new Set(state.document.layers.map((l) => l.name));
      let copyName = `${baseName} copy 1`;
      let counter = 1;
      while (existingNames.has(copyName)) {
        counter++;
        copyName = `${baseName} copy ${counter}`;
      }
      const newLayer: Layer = {
        ...layer,
        id: generateLayerId(),
        name: copyName,
        locked: layer.type === "vector",
        exposedAsInput: true,
        exposedAsOutput: true,
        // A generated or placed image keeps its pixels only in the reference
        // until it is edited, so a copy without data needs it to load.
        imageReference: layer.data ? undefined : layer.imageReference
      };
      const idx = state.document.layers.findIndex((l) => l.id === layerId);
      const newLayers = [...state.document.layers];
      newLayers.splice(idx + 1, 0, newLayer);
      return {
        document: {
          ...state.document,
          layers: newLayers,
          activeLayerId: newLayer.id,
          metadata: {
            ...state.document.metadata,
            updatedAt: new Date().toISOString()
          }
        },
        selectedLayerIds: [],
        layerShiftRangeAnchorId: newLayer.id
      };
    }),

  reorderLayers: (fromIndex: number, toIndex: number) =>
    set((state) => {
      const newLayers = [...state.document.layers];
      const [moved] = newLayers.splice(fromIndex, 1);
      newLayers.splice(toIndex, 0, moved);
      return {
        document: {
          ...state.document,
          layers: newLayers,
          metadata: {
            ...state.document.metadata,
            updatedAt: new Date().toISOString()
          }
        },
        selectedLayerIds: [],
        layerShiftRangeAnchorId: null
      };
    }),

  toggleLayerVisibility: (layerId: string) =>
    set((state) => ({
      document: {
        ...state.document,
        layers: state.document.layers.map((l) =>
          l.id === layerId ? { ...l, visible: !l.visible } : l
        ),
        metadata: {
          ...state.document.metadata,
          updatedAt: new Date().toISOString()
        }
      }
    })),

  setLayerOpacity: (layerId: string, opacity: number) =>
    set((state) => ({
      document: {
        ...state.document,
        layers: state.document.layers.map((l) =>
          l.id === layerId
            ? { ...l, opacity: Math.max(0, Math.min(1, opacity)) }
            : l
        )
      }
    })),

  setLayerBlendMode: (layerId: string, blendMode: BlendMode) =>
    set((state) => ({
      document: {
        ...state.document,
        layers: state.document.layers.map((l) =>
          l.id === layerId ? { ...l, blendMode } : l
        )
      }
    })),

  renameLayer: (layerId: string, name: string) =>
    set((state) => ({
      document: {
        ...state.document,
        layers: state.document.layers.map((l) =>
          l.id === layerId ? { ...l, name } : l
        )
      }
    })),

  updateLayerData: (layerId: string, data: string | null) =>
    set((state) => ({
      document: {
        ...state.document,
        layers: state.document.layers.map((l) =>
          l.id === layerId && l.type !== "vector" ? { ...l, data } : l
        ),
        metadata: {
          ...state.document.metadata,
          updatedAt: new Date().toISOString()
        }
      }
    })),

  setLayerTransform: (layerId: string, transform: LayerTransform) =>
    set((state) => ({
      document: setLayerTransformInDocument(state.document, layerId, transform)
    })),

  commitLayerTransform: (layerId: string, transform: LayerTransform) =>
    set((state) => ({
      document: setLayerTransformInDocument(state.document, layerId, transform)
    })),

  setLayerImageReference: (layerId, imageReference) =>
    set((state) => ({
      document: withUpdatedDocumentTimestamp({
        ...state.document,
        layers: state.document.layers.map((layer) =>
          layer.id === layerId ? { ...layer, imageReference } : layer
        )
      }),
      history: state.history.map((entry) =>
        entry.layerStructure.some((snapshot) => snapshot.id === layerId)
          ? {
              ...entry,
              layerStructure: entry.layerStructure.map((snapshot) =>
                snapshot.id === layerId
                  ? { ...snapshot, imageReference }
                  : snapshot
              )
            }
          : entry
      )
    })),

  setLayerContentBounds: (
    layerId: string,
    contentBounds: Layer["contentBounds"]
  ) =>
    set((state) => ({
      document: {
        ...state.document,
        layers: state.document.layers.map((l) =>
          l.id === layerId ? { ...l, contentBounds } : l
        ),
        metadata: {
          ...state.document.metadata,
          updatedAt: new Date().toISOString()
        }
      }
    })),

  translateLayer: (layerId: string, dx: number, dy: number) =>
    set((state) => ({
      document: offsetLayerTransformInDocument(state.document, layerId, dx, dy)
    })),

  offsetLayerTransform: (layerId: string, dx: number, dy: number) =>
    set((state) => ({
      document: offsetLayerTransformInDocument(state.document, layerId, dx, dy)
    })),

  setMaskLayer: (layerId: string | null) =>
    set((state) => {
      if (state.document.layers.some((layer) => layer.id === layerId && layer.type === "vector")) {
        return state;
      }
      const layers = state.document.layers.map((l) => {
        if (l.id === layerId) {
          return { ...l, type: "mask" as const };
        }
        if (l.id === state.document.maskLayerId && l.type === "mask") {
          return { ...l, type: "raster" as const };
        }
        return l;
      });
      return {
        document: {
          ...state.document,
          layers,
          maskLayerId: layerId,
          metadata: {
            ...state.document.metadata,
            updatedAt: new Date().toISOString()
          }
        }
      };
    }),

  toggleAlphaLock: (layerId: string) =>
    set((state) => ({
      document: {
        ...state.document,
        layers: state.document.layers.map((l) =>
          l.id === layerId ? { ...l, alphaLock: !l.alphaLock } : l
        )
      }
    })),

  toggleLayerExposedInput: (layerId: string) =>
    set((state) => ({
      document: {
        ...state.document,
        layers: state.document.layers.map((l) =>
          l.id === layerId ? { ...l, exposedAsInput: !l.exposedAsInput } : l
        )
      }
    })),

  toggleLayerExposedOutput: (layerId: string) =>
    set((state) => ({
      document: {
        ...state.document,
        layers: state.document.layers.map((l) =>
          l.id === layerId ? { ...l, exposedAsOutput: !l.exposedAsOutput } : l
        )
      }
    })),

  mergeLayerDown: (layerId: string) =>
    set((state) => {
      const { layers, activeLayerId, maskLayerId } = state.document;
      const idx = layers.findIndex((l) => l.id === layerId);
      if (idx <= 0) {
        return state;
      }
      const lower = layers[idx - 1];
      if (lower.locked) {
        return state;
      }
      const newLayers = layers
        .filter((l) => l.id !== layerId)
        .map((l) =>
          l.id === lower.id
            ? {
                ...l,
                // The runtime has baked both layers into a doc-sized raster
                // on the lower canvas. Always reveal the surviving layer:
                // hiding the only remaining record of merged pixels (because
                // the lower layer happened to be invisible going in) makes
                // the operation look destructive even though the data is fine.
                visible: true,
                // Enabled effects are baked into the merged pixels.
                effects: l.effects.filter((effect) => !effect.enabled),
                transform: { ...IDENTITY_AFFINE },
                contentBounds: {
                  x: 0,
                  y: 0,
                  width: state.document.canvas.width,
                  height: state.document.canvas.height
                }
              }
            : l
        );
      const newActiveId =
        activeLayerId === layerId ? lower.id : activeLayerId;
      const newMaskId = maskLayerId === layerId ? null : maskLayerId;
      return {
        document: {
          ...state.document,
          layers: newLayers,
          activeLayerId: newActiveId,
          maskLayerId: newMaskId,
          metadata: {
            ...state.document.metadata,
            updatedAt: new Date().toISOString()
          }
        },
        selectedLayerIds: [],
        layerShiftRangeAnchorId: newActiveId
      };
    }),

  flattenVisible: () =>
    set((state) => {
      const contributing = state.document.layers.filter(
        (l) =>
          l.type !== "mask" &&
          l.type !== "group" &&
          isLayerCompositeVisible(state.document.layers, l, null)
      );
      if (contributing.length === 0) {
        return state;
      }
      const flatLayer = createDefaultLayer(
        "Flattened",
        "raster",
        state.document.canvas.width,
        state.document.canvas.height
      );
      return {
        document: {
          ...state.document,
          layers: [flatLayer],
          activeLayerId: flatLayer.id,
          maskLayerId: null,
          metadata: {
            ...state.document.metadata,
            updatedAt: new Date().toISOString()
          }
        },
        selectedLayerIds: [],
        layerShiftRangeAnchorId: flatLayer.id
      };
    }),

  // ─── Group Layer Actions ───────────────────────────────────────────────
  addGroup: (name?: string) => {
    const group = createDefaultGroupLayer(
      name ||
        `Group ${get().document.layers.filter((l) => l.type === "group").length + 1}`
    );
    set((state) => {
      const layers = state.document.layers;
      // Same placement as a new layer: above the active layer in its parent,
      // so the new group never splits another group's children apart.
      const { insertAt, parentId } = computeNewLayerInsertion(
        layers,
        state.document.activeLayerId
      );
      const placed: Layer = parentId ? { ...group, parentId } : group;
      const newLayers = [
        ...layers.slice(0, insertAt),
        placed,
        ...layers.slice(insertAt)
      ];
      return {
        document: {
          ...state.document,
          layers: newLayers,
          activeLayerId: group.id,
          metadata: {
            ...state.document.metadata,
            updatedAt: new Date().toISOString()
          }
        },
        selectedLayerIds: [],
        layerShiftRangeAnchorId: group.id
      };
    });
    return group.id;
  },

  toggleGroupCollapsed: (groupId: string) =>
    set((state) => ({
      document: {
        ...state.document,
        layers: state.document.layers.map((l) =>
          l.id === groupId && l.type === "group"
            ? { ...l, collapsed: !l.collapsed }
            : l
        )
      }
    })),

  moveLayerToGroup: (layerId: string, groupId: string | null) =>
    set((state) => {
      const layer = state.document.layers.find((l) => l.id === layerId);
      if (!layer) {
        return state;
      }
      if (groupId && layerId === groupId) {
        return state;
      }
      if (groupId && layer.type === "group") {
        const descendantIds = getDescendantIds(
          state.document.layers,
          layerId
        );
        if (descendantIds.includes(groupId)) {
          return state;
        }
      }
      return {
        document: withUpdatedDocumentTimestamp({
          ...state.document,
          layers: state.document.layers.map((l) =>
            l.id === layerId
              ? { ...l, parentId: groupId ?? undefined }
              : l
          )
        }),
        selectedLayerIds: [],
        layerShiftRangeAnchorId: null
      };
    }),

  ungroupLayer: (groupId: string) =>
    set((state) => {
      const group = state.document.layers.find((l) => l.id === groupId);
      if (!group || group.type !== "group") {
        return state;
      }
      const parentId = group.parentId ?? undefined;
      const newLayers = state.document.layers
        .map((l) => (l.parentId === groupId ? { ...l, parentId } : l))
        .filter((l) => l.id !== groupId);
      const newActiveId =
        state.document.activeLayerId === groupId
          ? newLayers.length > 0
            ? newLayers[newLayers.length - 1].id
            : state.document.activeLayerId
          : state.document.activeLayerId;
      return {
        document: withUpdatedDocumentTimestamp({
          ...state.document,
          layers: newLayers,
          activeLayerId: newActiveId
        }),
        selectedLayerIds: [],
        layerShiftRangeAnchorId: newActiveId
      };
    }),

  groupLayers: (layerIds: string[]) =>
    set((state) => {
      const uniqueSet = new Set(layerIds);
      if (uniqueSet.size < 2) {
        return state;
      }
      const { layers } = state.document;

      const selected: Layer[] = [];
      const indices: number[] = [];
      for (let i = 0; i < layers.length; i++) {
        const l = layers[i];
        if (uniqueSet.has(l.id)) {
          if (l.type !== "group") {
            selected.push(l);
            indices.push(i);
          }
        }
      }

      if (selected.length < 2) {
        return state;
      }
      const parentKey = selected[0].parentId ?? null;
      if (!selected.every((l) => (l.parentId ?? null) === parentKey)) {
        return state;
      }

      for (let i = 1; i < indices.length; i++) {
        if (indices[i] !== indices[i - 1] + 1) {
          return state;
        }
      }
      const minI = indices[0];
      const maxI = indices[indices.length - 1];
      const groupName = `Group ${layers.filter((l) => l.type === "group").length + 1}`;
      const group: Layer = {
        ...createDefaultGroupLayer(groupName),
        parentId: parentKey ?? undefined
      };
      const before = layers.slice(0, minI);
      const selectedSet = new Set(selected.map((l) => l.id));
      const middle = layers.slice(minI, maxI + 1).map((l) =>
        selectedSet.has(l.id)
          ? { ...l, parentId: group.id }
          : l
      );
      const after = layers.slice(maxI + 1);
      const newLayers = [...before, group, ...middle, ...after];
      return {
        document: withUpdatedDocumentTimestamp({
          ...state.document,
          layers: newLayers,
          activeLayerId: group.id,
          metadata: {
            ...state.document.metadata,
            updatedAt: new Date().toISOString()
          }
        }),
        selectedLayerIds: [],
        layerShiftRangeAnchorId: group.id
      };
    }),

  // ─── Canvas Actions ─────────────────────────────────────────────────────
  setCanvasBackgroundColor: (color: string) =>
    set((state) => ({
      document: {
        ...state.document,
        canvas: { ...state.document.canvas, backgroundColor: color },
        metadata: {
          ...state.document.metadata,
          updatedAt: new Date().toISOString()
        }
      }
    })),

  resizeCanvas: (width: number, height: number) =>
    set((state) => ({
      selection: null,
      lastSelection: null,
      document: {
        ...state.document,
        canvas: { ...state.document.canvas, width, height },
        metadata: {
          ...state.document.metadata,
          updatedAt: new Date().toISOString()
        }
      }
    })),

  offsetAllPaintLayersTransform: (dx: number, dy: number) => {
    if (!dx && !dy) {
      return;
    }
    set((state) => ({
      document: withUpdatedDocumentTimestamp({
        ...state.document,
        layers: state.document.layers.map((layer) =>
          layer.type === "raster" || layer.type === "mask" || layer.type === "vector"
            ? { ...layer, transform: offsetTransform(layer.transform, dx, dy) }
            : layer
        )
      })
    }));
  },

  offsetGuides: (dx: number, dy: number) => {
    const guides = get().document.guides;
    if ((!dx && !dy) || !guides || guides.length === 0) {
      return;
    }
    set((state) => ({
      document: {
        ...state.document,
        guides: guides.map((guide) => ({
          ...guide,
          position: guide.position + (guide.orientation === "horizontal" ? dy : dx)
        }))
      }
    }));
  }
});
