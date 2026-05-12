/**
 * Document Slice — document state, layer CRUD, group actions, canvas operations.
 */

import type { StateCreator } from "zustand";
import type { SketchStore } from "../useSketchStore";
import type {
  SketchDocument,
  Layer,
  BlendMode,
  LayerTransform
} from "../../types";
import {
  createDefaultDocument,
  normalizeSketchDocument,
  createDefaultLayer,
  createDefaultGroupLayer,
  generateLayerId,
  getDescendantIds,
  isLayerCompositeVisible,
  ensureTransformMatrix,
  isQuadTransformMode
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
      layer.id === layerId ? { ...layer, transform: ensureTransformMatrix(transform) } : layer
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
): { insertAt: number; parentId: string | undefined } {
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
      const newTransform: LayerTransform = {
        ...layer.transform,
        x: layer.transform.x + dx,
        y: layer.transform.y + dy
      };
      if (layer.transform.quad) {
        newTransform.quad = layer.transform.quad.map((point) => ({
          x: point.x + dx,
          y: point.y + dy
        })) as NonNullable<LayerTransform["quad"]>;
      }
      // Recompute matrix with updated translation
      if (layer.transform.matrix && !isQuadTransformMode(layer.transform.mode)) {
        const m = layer.transform.matrix;
        newTransform.matrix = [m[0], m[1], m[2], m[3], newTransform.x, newTransform.y];
      }
      return { ...layer, transform: ensureTransformMatrix(newTransform) };
    })
  });
}

// ─── Slice interface ────────────────────────────────────────────────────────

export interface DocumentSlice {
  document: SketchDocument;

  // Document actions
  setDocument: (doc: SketchDocument) => void;
  resetDocument: (width?: number, height?: number) => void;

  // Layer actions
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
      history: [],
      historyIndex: -1,
      selectedLayerIds: [],
      layerShiftRangeAnchorId: null,
      transientMoveModifierHeld: false
    });
  },

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
      history: [],
      historyIndex: -1,
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
        locked: false,
        exposedAsInput: true,
        exposedAsOutput: true,
        imageReference: undefined
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
          l.id === layerId ? { ...l, data } : l
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
                transform: { x: 0, y: 0 },
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
      const activeIdx = layers.findIndex(
        (l) => l.id === state.document.activeLayerId
      );
      const insertAt = activeIdx >= 0 ? activeIdx + 1 : layers.length;
      const newLayers = [
        ...layers.slice(0, insertAt),
        group,
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
      const unique = [...new Set(layerIds)];
      if (unique.length < 2) {
        return state;
      }
      const { layers } = state.document;
      const selected = unique
        .map((id) => layers.find((l) => l.id === id))
        .filter((l): l is Layer => !!l && l.type !== "group");
      if (selected.length < 2) {
        return state;
      }
      const parentKey = selected[0].parentId ?? null;
      if (!selected.every((l) => (l.parentId ?? null) === parentKey)) {
        return state;
      }
      const indices = selected
        .map((l) => layers.indexOf(l))
        .sort((a, b) => a - b);
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
      const middle = layers.slice(minI, maxI + 1).map((l) =>
        selected.some((s) => s.id === l.id)
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
          layer.type === "raster" || layer.type === "mask"
            ? {
                ...layer,
                transform: {
                  ...layer.transform,
                  x: layer.transform.x + dx,
                  y: layer.transform.y + dy
                }
              }
            : layer
        )
      })
    }));
  }
});
