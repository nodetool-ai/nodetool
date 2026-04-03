/**
 * History Slice — undo/redo history management.
 */

import type { StateCreator } from "zustand";
import type { SketchStore } from "../useSketchStore";
import type {
  HistoryEntry,
  LayerStructureSnapshot,
  Layer,
  PushHistoryOptions
} from "../../types";
import { MAX_HISTORY_SIZE } from "../../types";

export interface HistorySlice {
  history: HistoryEntry[];
  historyIndex: number;
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

export const createHistorySlice: StateCreator<
  SketchStore,
  [],
  [],
  HistorySlice
> = (set, get) => ({
  history: [],
  historyIndex: -1,

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
    const layerStructure: LayerStructureSnapshot[] =
      state.document.layers.map((l) => ({
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
      }));
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

    // When undoing from the tip of history, append a snapshot of the current
    // state so that redo can restore it later.
    let history = state.history;
    if (state.historyIndex === state.history.length - 1) {
      const tipSnapshot: Record<string, string | null> = {};
      for (const layer of state.document.layers) {
        tipSnapshot[layer.id] = layer.data;
      }
      const tipStructure: LayerStructureSnapshot[] =
        state.document.layers.map((l) => ({
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
        }));
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
        activeLayerId:
          entry.activeLayerId ?? state.document.activeLayerId,
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
        activeLayerId:
          entry.activeLayerId ?? state.document.activeLayerId,
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
});
