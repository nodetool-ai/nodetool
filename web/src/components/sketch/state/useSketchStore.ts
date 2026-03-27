/**
 * Sketch Editor State Management
 *
 * Zustand store for managing sketch editor state including document,
 * tools, layers, and undo/redo history.
 */

import { create } from "zustand";
import {
  SketchDocument,
  SketchTool,
  Layer,
  HistoryEntry,
  LayerStructureSnapshot,
  Point,
  Selection,
  ColorMode,
  SymmetryMode,
  SYMMETRY_DEFAULT_RAYS,
  BrushSettings,
  PencilSettings,
  EraserSettings,
  ShapeSettings,
  FillSettings,
  BlurSettings,
  GradientSettings,
  CloneStampSettings,
  BlendMode,
  LayerTransform,
  PushHistoryOptions,
  createDefaultDocument,
  normalizeSketchDocument,
  createDefaultLayer,
  createDefaultGroupLayer,
  generateLayerId,
  getDescendantIds,
  MAX_HISTORY_SIZE
} from "../types";

function withUpdatedDocumentTimestamp(document: SketchDocument): SketchDocument {
  return {
    ...document,
    metadata: {
      ...document.metadata,
      updatedAt: new Date().toISOString()
    }
  };
}

/** Tool colors tied to the foreground swatch follow the new FG after swap. */
function mapForegroundLinkedToolColor(
  color: string,
  oldFg: string,
  oldBg: string
): string {
  return color === oldFg ? oldBg : color;
}

/** Colors that may match either swatch (fill side, gradient end) swap both ways. */
function mapDualWellToolColor(
  color: string,
  oldFg: string,
  oldBg: string
): string {
  if (color === oldFg) {
    return oldBg;
  }
  if (color === oldBg) {
    return oldFg;
  }
  return color;
}

function setLayerTransformInDocument(
  document: SketchDocument,
  layerId: string,
  transform: LayerTransform
): SketchDocument {
  return withUpdatedDocumentTimestamp({
    ...document,
    layers: document.layers.map((layer) =>
      layer.id === layerId ? { ...layer, transform } : layer
    )
  });
}

function offsetLayerTransformInDocument(
  document: SketchDocument,
  layerId: string,
  dx: number,
  dy: number
): SketchDocument {
  return withUpdatedDocumentTimestamp({
    ...document,
    layers: document.layers.map((layer) =>
      layer.id === layerId
        ? {
            ...layer,
            transform: {
              x: layer.transform.x + dx,
              y: layer.transform.y + dy
            }
          }
        : layer
    )
  });
}

export interface SketchStore {
  // ─── Document State ───────────────────────────────────────────────────────
  document: SketchDocument;
  activeTool: SketchTool;
  zoom: number;
  pan: Point;
  isDrawing: boolean;

  // ─── History ──────────────────────────────────────────────────────────────
  history: HistoryEntry[];
  historyIndex: number;

  // ─── Document Actions ─────────────────────────────────────────────────────
  setDocument: (doc: SketchDocument) => void;
  resetDocument: (width?: number, height?: number) => void;

  // ─── Tool Actions ─────────────────────────────────────────────────────────
  setActiveTool: (tool: SketchTool) => void;
  setBrushSettings: (settings: Partial<BrushSettings>) => void;
  setPencilSettings: (settings: Partial<PencilSettings>) => void;
  setEraserSettings: (settings: Partial<EraserSettings>) => void;
  setShapeSettings: (settings: Partial<ShapeSettings>) => void;
  setFillSettings: (settings: Partial<FillSettings>) => void;
  setBlurSettings: (settings: Partial<BlurSettings>) => void;
  setGradientSettings: (settings: Partial<GradientSettings>) => void;
  setCloneStampSettings: (settings: Partial<CloneStampSettings>) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: Point) => void;
  setIsDrawing: (isDrawing: boolean) => void;

  // ─── Layer Actions ────────────────────────────────────────────────────────
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

  // ─── Group Layer Actions ──────────────────────────────────────────────────
  addGroup: (name?: string) => string;
  toggleGroupCollapsed: (groupId: string) => void;
  moveLayerToGroup: (layerId: string, groupId: string | null) => void;
  ungroupLayer: (groupId: string) => void;

  // ─── Foreground / Background Colors ───────────────────────────────────────
  foregroundColor: string;
  backgroundColor: string;
  setForegroundColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  swapColors: () => void;
  resetColors: () => void;

  // ─── Color Mode ───────────────────────────────────────────────────────────
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;

  // ─── Selection ────────────────────────────────────────────────────────────
  selection: Selection | null;
  lastSelection: Selection | null;
  setSelection: (sel: Selection | null) => void;
  selectAll: () => void;
  invertSelection: () => void;
  reselectLastSelection: () => void;

  // ─── Layer Isolation ──────────────────────────────────────────────────────
  isolatedLayerId: string | null;
  toggleIsolateLayer: (layerId: string) => void;

  // ─── Mirror / Symmetry State ────────────────────────────────────────────
  mirrorX: boolean;
  mirrorY: boolean;
  setMirrorX: (v: boolean) => void;
  setMirrorY: (v: boolean) => void;
  symmetryMode: SymmetryMode;
  symmetryRays: number;
  setSymmetryMode: (mode: SymmetryMode) => void;
  setSymmetryRays: (rays: number) => void;

  // ─── UI State ─────────────────────────────────────────────────────────────
  panelsHidden: boolean;
  togglePanelsHidden: () => void;

  // ─── Canvas Background ────────────────────────────────────────────────────
  setCanvasBackgroundColor: (color: string) => void;

  // ─── Canvas Resize ─────────────────────────────────────────────────────────
  resizeCanvas: (width: number, height: number) => void;

  // ─── History Actions ──────────────────────────────────────────────────────
  pushHistory: (
    action: string,
    layerCanvasSnapshots?: Record<string, HTMLCanvasElement | null>,
    options?: PushHistoryOptions
  ) => void;
  undo: () => HistoryEntry | null;
  redo: () => HistoryEntry | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export const useSketchStore = create<SketchStore>((set, get) => ({
  // ─── Initial State ──────────────────────────────────────────────────────
  document: createDefaultDocument(),
  activeTool: "brush",
  zoom: 1,
  pan: { x: 0, y: 0 },
  isDrawing: false,
  history: [],
  historyIndex: -1,
  foregroundColor: "#ffffff",
  backgroundColor: "#000000",
  colorMode: "hex" as ColorMode,
  selection: null,
  lastSelection: null,
  isolatedLayerId: null,
  mirrorX: false,
  mirrorY: false,
  symmetryMode: "off" as SymmetryMode,
  symmetryRays: SYMMETRY_DEFAULT_RAYS,
  panelsHidden: false,

  // ─── Document Actions ─────────────────────────────────────────────────
  setDocument: (doc: SketchDocument) => {
    set({
      document: normalizeSketchDocument(doc),
      history: [],
      historyIndex: -1
    });
  },

  resetDocument: (width = 512, height = 512) => {
    set({
      document: createDefaultDocument(width, height),
      activeTool: "brush",
      zoom: 1,
      pan: { x: 0, y: 0 },
      isDrawing: false,
      history: [],
      historyIndex: -1
    });
  },

  // ─── Tool Actions ────────────────────────────────────────────────────
  setActiveTool: (tool: SketchTool) => set({ activeTool: tool }),

  setBrushSettings: (settings: Partial<BrushSettings>) =>
    set((state) => ({
      document: {
        ...state.document,
        toolSettings: {
          ...state.document.toolSettings,
          brush: { ...state.document.toolSettings.brush, ...settings }
        },
        metadata: {
          ...state.document.metadata,
          updatedAt: new Date().toISOString()
        }
      }
    })),

  setPencilSettings: (settings: Partial<PencilSettings>) =>
    set((state) => ({
      document: {
        ...state.document,
        toolSettings: {
          ...state.document.toolSettings,
          pencil: { ...state.document.toolSettings.pencil, ...settings }
        },
        metadata: {
          ...state.document.metadata,
          updatedAt: new Date().toISOString()
        }
      }
    })),

  setEraserSettings: (settings: Partial<EraserSettings>) =>
    set((state) => ({
      document: {
        ...state.document,
        toolSettings: {
          ...state.document.toolSettings,
          eraser: { ...state.document.toolSettings.eraser, ...settings }
        },
        metadata: {
          ...state.document.metadata,
          updatedAt: new Date().toISOString()
        }
      }
    })),

  setShapeSettings: (settings: Partial<ShapeSettings>) =>
    set((state) => ({
      document: {
        ...state.document,
        toolSettings: {
          ...state.document.toolSettings,
          shape: { ...state.document.toolSettings.shape, ...settings }
        },
        metadata: {
          ...state.document.metadata,
          updatedAt: new Date().toISOString()
        }
      }
    })),

  setFillSettings: (settings: Partial<FillSettings>) =>
    set((state) => ({
      document: {
        ...state.document,
        toolSettings: {
          ...state.document.toolSettings,
          fill: { ...state.document.toolSettings.fill, ...settings }
        },
        metadata: {
          ...state.document.metadata,
          updatedAt: new Date().toISOString()
        }
      }
    })),

  setBlurSettings: (settings: Partial<BlurSettings>) =>
    set((state) => ({
      document: {
        ...state.document,
        toolSettings: {
          ...state.document.toolSettings,
          blur: { ...state.document.toolSettings.blur, ...settings }
        },
        metadata: {
          ...state.document.metadata,
          updatedAt: new Date().toISOString()
        }
      }
    })),

  setGradientSettings: (settings: Partial<GradientSettings>) =>
    set((state) => ({
      document: {
        ...state.document,
        toolSettings: {
          ...state.document.toolSettings,
          gradient: { ...state.document.toolSettings.gradient, ...settings }
        },
        metadata: {
          ...state.document.metadata,
          updatedAt: new Date().toISOString()
        }
      }
    })),

  setCloneStampSettings: (settings: Partial<CloneStampSettings>) =>
    set((state) => ({
      document: {
        ...state.document,
        toolSettings: {
          ...state.document.toolSettings,
          cloneStamp: { ...state.document.toolSettings.cloneStamp, ...settings }
        },
        metadata: {
          ...state.document.metadata,
          updatedAt: new Date().toISOString()
        }
      }
    })),

  setZoom: (zoom: number) => set({ zoom: Math.max(0.1, Math.min(10, zoom)) }),
  setPan: (pan: Point) => set({ pan }),
  setIsDrawing: (isDrawing: boolean) => set({ isDrawing }),
  setMirrorX: (v: boolean) => set({ mirrorX: v }),
  setMirrorY: (v: boolean) => set({ mirrorY: v }),
  setSymmetryMode: (mode: SymmetryMode) => {
    // Keep mirrorX/mirrorY in sync for backward compatibility
    set({
      symmetryMode: mode,
      mirrorX: mode === "horizontal" || mode === "dual",
      mirrorY: mode === "vertical" || mode === "dual"
    });
  },
  setSymmetryRays: (rays: number) => set({ symmetryRays: Math.max(2, Math.min(12, rays)) }),

  // ─── Layer Actions ────────────────────────────────────────────────────
  setActiveLayer: (layerId: string) =>
    set((state) => ({
      document: { ...state.document, activeLayerId: layerId }
    })),

  addLayer: (name?: string, type: "raster" | "mask" = "raster") => {
    const { width, height } = get().document.canvas;
    const layer = createDefaultLayer(
      name || `Layer ${get().document.layers.length + 1}`,
      type,
      width,
      height
    );
    set((state) => {
      const layers = state.document.layers;
      const activeIdx = layers.findIndex((l) => l.id === state.document.activeLayerId);
      const insertAt = activeIdx >= 0 ? activeIdx + 1 : layers.length;
      const newLayers = [...layers.slice(0, insertAt), layer, ...layers.slice(insertAt)];
      return {
        document: {
          ...state.document,
          layers: newLayers,
          activeLayerId: layer.id,
          metadata: {
            ...state.document.metadata,
            updatedAt: new Date().toISOString()
          }
        }
      };
    });
    return layer.id;
  },

  removeLayer: (layerId: string) =>
    set((state) => {
      const { layers, activeLayerId, maskLayerId } = state.document;
      if (layers.length <= 1) {
        return state; // Don't remove last layer
      }
      const removed = layers.find((l) => l.id === layerId);
      const parentId = removed?.parentId ?? undefined;
      // When removing a group, also remove its descendants
      const idsToRemove = new Set([layerId]);
      if (removed?.type === "group") {
        for (const id of getDescendantIds(layers, layerId)) {
          idsToRemove.add(id);
        }
      }
      let newLayers = layers
        .filter((l) => !idsToRemove.has(l.id))
        // Re-parent direct children of a non-group removed layer (edge case)
        .map((l) => l.parentId === layerId ? { ...l, parentId } : l);
      if (newLayers.length === 0) {
        // Don't remove all layers — keep at least the first non-removed or restore one
        newLayers = layers.slice(0, 1);
      }
      const newActiveId =
        idsToRemove.has(activeLayerId) ? newLayers[newLayers.length - 1].id : activeLayerId;
      const newMaskId = maskLayerId && idsToRemove.has(maskLayerId) ? null : maskLayerId;
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
        }
      };
    }),

  duplicateLayer: (layerId: string) =>
    set((state) => {
      const layer = state.document.layers.find((l) => l.id === layerId);
      if (!layer) {
        return state;
      }
      const newLayer: Layer = {
        ...layer,
        id: generateLayerId(),
        name: `${layer.name} Copy`,
        locked: false,
        exposedAsInput: false,
        exposedAsOutput: false,
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
        }
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
        }
      };
    }),

  toggleLayerVisibility: (layerId: string) =>
    set((state) => ({
      document: {
        ...state.document,
        layers: state.document.layers.map((l) =>
          l.id === layerId ? { ...l, visible: !l.visible } : l
        )
      }
    })),

  setLayerOpacity: (layerId: string, opacity: number) =>
    set((state) => ({
      document: {
        ...state.document,
        layers: state.document.layers.map((l) =>
          l.id === layerId ? { ...l, opacity: Math.max(0, Math.min(1, opacity)) } : l
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

  setLayerContentBounds: (layerId: string, contentBounds: Layer["contentBounds"]) =>
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
      // If setting a mask layer, update its type; if unsetting, revert type
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
        return state; // Can't merge first layer or not found
      }
      const lower = layers[idx - 1];
      if (lower.locked) {
        return state; // Don't merge into locked layer
      }
      // Canvas-side compositing rebases the merged pixels into document space,
      // so the surviving lower layer resets back to identity transform.
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
      const newActiveId = activeLayerId === layerId ? lower.id : activeLayerId;
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
        }
      };
    }),

  flattenVisible: () =>
    set((state) => {
      const visibleLayers = state.document.layers.filter((l) => l.visible);
      if (visibleLayers.length === 0) {
        return state;
      }
      // Keep only one layer — actual pixel compositing is done on the
      // canvas side before calling this action
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
        }
      };
    }),

  // ─── Group Layer Actions ───────────────────────────────────────────────
  addGroup: (name?: string) => {
    const group = createDefaultGroupLayer(
      name || `Group ${get().document.layers.filter((l) => l.type === "group").length + 1}`
    );
    set((state) => {
      const layers = state.document.layers;
      const activeIdx = layers.findIndex((l) => l.id === state.document.activeLayerId);
      const insertAt = activeIdx >= 0 ? activeIdx + 1 : layers.length;
      const newLayers = [...layers.slice(0, insertAt), group, ...layers.slice(insertAt)];
      return {
        document: {
          ...state.document,
          layers: newLayers,
          activeLayerId: group.id,
          metadata: {
            ...state.document.metadata,
            updatedAt: new Date().toISOString()
          }
        }
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
      if (!layer) { return state; }
      // Prevent moving a group into itself or its own descendants
      if (groupId && layerId === groupId) { return state; }
      if (groupId && layer.type === "group") {
        const descendantIds = getDescendantIds(state.document.layers, layerId);
        if (descendantIds.includes(groupId)) { return state; }
      }
      return {
        document: withUpdatedDocumentTimestamp({
          ...state.document,
          layers: state.document.layers.map((l) =>
            l.id === layerId
              ? { ...l, parentId: groupId ?? undefined }
              : l
          )
        })
      };
    }),

  ungroupLayer: (groupId: string) =>
    set((state) => {
      const group = state.document.layers.find((l) => l.id === groupId);
      if (!group || group.type !== "group") { return state; }
      const parentId = group.parentId ?? undefined;
      // Move all children to the parent level
      const newLayers = state.document.layers
        .map((l) => l.parentId === groupId ? { ...l, parentId } : l)
        .filter((l) => l.id !== groupId);
      const newActiveId = state.document.activeLayerId === groupId
        ? (newLayers.length > 0 ? newLayers[newLayers.length - 1].id : state.document.activeLayerId)
        : state.document.activeLayerId;
      return {
        document: withUpdatedDocumentTimestamp({
          ...state.document,
          layers: newLayers,
          activeLayerId: newActiveId
        })
      };
    }),

  // ─── Foreground / Background Colors ─────────────────────────────────────
  setForegroundColor: (color: string) => set({ foregroundColor: color }),
  setBackgroundColor: (color: string) => set({ backgroundColor: color }),
  swapColors: () =>
    set((state) => {
      const oldFg = state.foregroundColor;
      const oldBg = state.backgroundColor;
      const ts = state.document.toolSettings;
      const document = withUpdatedDocumentTimestamp({
        ...state.document,
        toolSettings: {
          ...ts,
          brush: {
            ...ts.brush,
            color: mapForegroundLinkedToolColor(ts.brush.color, oldFg, oldBg)
          },
          pencil: {
            ...ts.pencil,
            color: mapForegroundLinkedToolColor(ts.pencil.color, oldFg, oldBg)
          },
          fill: {
            ...ts.fill,
            color: mapForegroundLinkedToolColor(ts.fill.color, oldFg, oldBg)
          },
          shape: {
            ...ts.shape,
            strokeColor: mapForegroundLinkedToolColor(
              ts.shape.strokeColor,
              oldFg,
              oldBg
            ),
            fillColor: mapDualWellToolColor(ts.shape.fillColor, oldFg, oldBg)
          },
          gradient: {
            ...ts.gradient,
            startColor: mapForegroundLinkedToolColor(
              ts.gradient.startColor,
              oldFg,
              oldBg
            ),
            endColor: mapDualWellToolColor(
              ts.gradient.endColor,
              oldFg,
              oldBg
            )
          }
        }
      });
      return {
        foregroundColor: oldBg,
        backgroundColor: oldFg,
        document
      };
    }),
  resetColors: () =>
    set({ foregroundColor: "#000000", backgroundColor: "#ffffff" }),

  // ─── Color Mode ─────────────────────────────────────────────────────────
  setColorMode: (mode: ColorMode) => set({ colorMode: mode }),

  // ─── Selection ──────────────────────────────────────────────────────────
  setSelection: (sel: Selection | null) => {
    const current = get().selection;
    // Store the last non-null selection for Ctrl+Shift+D reselect
    if (current && !sel) {
      set({ selection: sel, lastSelection: current });
    } else {
      set({ selection: sel });
    }
  },
  selectAll: () => {
    const state = get();
    set({
      selection: {
        x: 0,
        y: 0,
        width: state.document.canvas.width,
        height: state.document.canvas.height
      }
    });
  },
  invertSelection: () => {
    // With only rectangular selections, true inversion is not possible.
    // Both cases (no selection, existing selection) select the full canvas
    // as an approximation until non-rectangular selection support is added.
    const { width: cw, height: ch } = get().document.canvas;
    set({ selection: { x: 0, y: 0, width: cw, height: ch } });
  },
  reselectLastSelection: () => {
    const last = get().lastSelection;
    if (last) {
      set({ selection: last });
    }
  },

  // ─── Layer Isolation ────────────────────────────────────────────────────
  toggleIsolateLayer: (layerId: string) =>
    set((state) => ({
      isolatedLayerId: state.isolatedLayerId === layerId ? null : layerId
    })),

  // ─── UI State ───────────────────────────────────────────────────────────
  togglePanelsHidden: () =>
    set((state) => ({ panelsHidden: !state.panelsHidden })),

  // ─── Canvas Background ─────────────────────────────────────────────────
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

  // ─── Canvas Resize ───────────────────────────────────────────────────────
  resizeCanvas: (width: number, height: number) =>
    set((state) => ({
      document: {
        ...state.document,
        canvas: { ...state.document.canvas, width, height },
        metadata: {
          ...state.document.metadata,
          updatedAt: new Date().toISOString()
        }
      }
    })),

  // ─── History Actions ──────────────────────────────────────────────────
  pushHistory: (
    action: string,
    layerCanvasSnapshots?: Record<string, HTMLCanvasElement | null>,
    options?: PushHistoryOptions
  ) => {
    const state = get();
    const restoreMode = options?.restoreMode ?? "full";
    const snapshot: Record<string, string | null> = {};
    for (const layer of state.document.layers) {
      snapshot[layer.id] = layer.data;
    }
    const layerStructure: LayerStructureSnapshot[] = state.document.layers.map(
      (l) => ({
        id: l.id,
        name: l.name,
        type: l.type,
        visible: l.visible,
        opacity: l.opacity,
        locked: l.locked,
        alphaLock: l.alphaLock,
        blendMode: l.blendMode,
        transform: l.transform,
        contentBounds: l.contentBounds,
        exposedAsInput: l.exposedAsInput,
        exposedAsOutput: l.exposedAsOutput,
        imageReference: l.imageReference
      })
    );
    const entry: HistoryEntry = {
      layerSnapshots: snapshot,
      layerCanvasSnapshots,
      layerStructure,
      activeLayerId: state.document.activeLayerId,
      maskLayerId: state.document.maskLayerId,
      restoreMode,
      action,
      timestamp: Date.now()
    };

    // Truncate future history if we're not at the end
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(entry);

    // Trim to max size
    if (newHistory.length > MAX_HISTORY_SIZE) {
      newHistory.shift();
    }

    set({
      history: newHistory,
      historyIndex: newHistory.length - 1
    });
  },

  undo: () => {
    const state = get();
    if (state.historyIndex <= 0) {
      return null;
    }

    // When undoing from the tip of history, the live canvas holds the
    // post-action state that isn't captured in any entry (pushHistory only
    // records BEFORE-action snapshots). Append a snapshot of the current
    // state so that redo can restore it later.
    // NOTE: Consecutive undos don't re-trigger this because once we append
    // the tip entry and decrement, historyIndex < history.length - 1.
    let history = state.history;
    if (state.historyIndex === state.history.length - 1) {
      const tipSnapshot: Record<string, string | null> = {};
      for (const layer of state.document.layers) {
        tipSnapshot[layer.id] = layer.data;
      }
      const tipStructure: LayerStructureSnapshot[] = state.document.layers.map(
        (l) => ({
          id: l.id,
          name: l.name,
          type: l.type,
          visible: l.visible,
          opacity: l.opacity,
          locked: l.locked,
          alphaLock: l.alphaLock,
          blendMode: l.blendMode,
          transform: l.transform,
          contentBounds: l.contentBounds,
          exposedAsInput: l.exposedAsInput,
          exposedAsOutput: l.exposedAsOutput,
          imageReference: l.imageReference
        })
      );
      const tipEntry: HistoryEntry = {
        layerSnapshots: tipSnapshot,
        layerStructure: tipStructure,
        activeLayerId: state.document.activeLayerId,
        maskLayerId: state.document.maskLayerId,
        restoreMode: "full",
        action: "current state",
        timestamp: Date.now()
      };
      history = [...state.history, tipEntry];
    }

    const newIndex = state.historyIndex - 1;
    const entry = history[newIndex];
    if (!entry) {
      return null;
    }

    let layers: Layer[];
    if (entry.layerStructure && entry.layerStructure.length > 0) {
      layers = entry.layerStructure.map((ls) => ({
        ...ls,
        data: entry.layerSnapshots[ls.id] ?? null
      }));
    } else {
      layers = state.document.layers.map((l) => ({
        ...l,
        data: entry.layerSnapshots[l.id] ?? l.data
      }));
    }

    set({
      document: {
        ...state.document,
        layers,
        activeLayerId: entry.activeLayerId ?? state.document.activeLayerId,
        maskLayerId:
          entry.maskLayerId !== undefined
            ? entry.maskLayerId
            : state.document.maskLayerId
      },
      history,
      historyIndex: newIndex
    });
    return entry;
  },

  redo: () => {
    const state = get();
    if (state.historyIndex >= state.history.length - 1) {
      return null;
    }
    const newIndex = state.historyIndex + 1;
    const entry = state.history[newIndex];
    if (!entry) {
      return null;
    }

    // Restore full layer structure if available, otherwise fall back to data-only restore
    let layers: Layer[];
    if (entry.layerStructure && entry.layerStructure.length > 0) {
      layers = entry.layerStructure.map((ls) => ({
        ...ls,
        data: entry.layerSnapshots[ls.id] ?? null
      }));
    } else {
      layers = state.document.layers.map((l) => ({
        ...l,
        data: entry.layerSnapshots[l.id] ?? l.data
      }));
    }

    set({
      document: {
        ...state.document,
        layers,
        activeLayerId: entry.activeLayerId ?? state.document.activeLayerId,
        maskLayerId:
          entry.maskLayerId !== undefined
            ? entry.maskLayerId
            : state.document.maskLayerId
      },
      historyIndex: newIndex
    });
    return entry;
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1
}));
