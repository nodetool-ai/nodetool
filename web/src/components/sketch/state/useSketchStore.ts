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
  Point,
  BrushSettings,
  EraserSettings,
  createDefaultDocument,
  createDefaultLayer,
  generateLayerId,
  MAX_HISTORY_SIZE
} from "../types";

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
  setEraserSettings: (settings: Partial<EraserSettings>) => void;
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
  renameLayer: (layerId: string, name: string) => void;
  updateLayerData: (layerId: string, data: string | null) => void;
  setMaskLayer: (layerId: string | null) => void;

  // ─── History Actions ──────────────────────────────────────────────────────
  pushHistory: (action: string) => void;
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

  // ─── Document Actions ─────────────────────────────────────────────────
  setDocument: (doc: SketchDocument) => {
    set({
      document: doc,
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

  setZoom: (zoom: number) => set({ zoom: Math.max(0.1, Math.min(10, zoom)) }),
  setPan: (pan: Point) => set({ pan }),
  setIsDrawing: (isDrawing: boolean) => set({ isDrawing }),

  // ─── Layer Actions ────────────────────────────────────────────────────
  setActiveLayer: (layerId: string) =>
    set((state) => ({
      document: { ...state.document, activeLayerId: layerId }
    })),

  addLayer: (name?: string, type: "raster" | "mask" = "raster") => {
    const layer = createDefaultLayer(
      name || `Layer ${get().document.layers.length + 1}`,
      type
    );
    set((state) => ({
      document: {
        ...state.document,
        layers: [...state.document.layers, layer],
        activeLayerId: layer.id,
        metadata: {
          ...state.document.metadata,
          updatedAt: new Date().toISOString()
        }
      }
    }));
    return layer.id;
  },

  removeLayer: (layerId: string) =>
    set((state) => {
      const { layers, activeLayerId, maskLayerId } = state.document;
      if (layers.length <= 1) {
        return state; // Don't remove last layer
      }
      const newLayers = layers.filter((l) => l.id !== layerId);
      const newActiveId =
        activeLayerId === layerId ? newLayers[newLayers.length - 1].id : activeLayerId;
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

  duplicateLayer: (layerId: string) =>
    set((state) => {
      const layer = state.document.layers.find((l) => l.id === layerId);
      if (!layer) {
        return state;
      }
      const newLayer: Layer = {
        ...layer,
        id: generateLayerId(),
        name: `${layer.name} Copy`
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

  // ─── History Actions ──────────────────────────────────────────────────
  pushHistory: (action: string) => {
    const state = get();
    const snapshot: Record<string, string | null> = {};
    for (const layer of state.document.layers) {
      snapshot[layer.id] = layer.data;
    }
    const entry: HistoryEntry = {
      layerSnapshots: snapshot,
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
    const newIndex = state.historyIndex - 1;
    const entry = state.history[newIndex];
    if (!entry) {
      return null;
    }

    // Restore layer data from snapshot
    const layers = state.document.layers.map((l) => ({
      ...l,
      data: entry.layerSnapshots[l.id] ?? l.data
    }));

    set({
      document: { ...state.document, layers },
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

    // Restore layer data from snapshot
    const layers = state.document.layers.map((l) => ({
      ...l,
      data: entry.layerSnapshots[l.id] ?? l.data
    }));

    set({
      document: { ...state.document, layers },
      historyIndex: newIndex
    });
    return entry;
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1
}));
