/**
 * History Slice — undo/redo history management with delta snapshots.
 *
 * Delta history: each entry stores raster data only for layers that changed
 * since the previous entry, rather than full snapshots of every layer.
 * The first entry (index 0) always holds all layers as a baseline.
 *
 * Reconstruction: to get a layer's data at a given history index, walk
 * backward from that index until an entry with a snapshot for that layer
 * is found. This is O(history_length) per layer but bounded by
 * MAX_HISTORY_SIZE (30).
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

/**
 * Resolve a layer's raster data at a given history index by walking
 * backward through delta entries to find the most recent snapshot.
 * Returns `null` if no snapshot is found (new/empty layer).
 */
export function resolveLayerData(
  history: HistoryEntry[],
  upToIndex: number,
  layerId: string
): string | null {
  for (let i = upToIndex; i >= 0; i--) {
    const entry = history[i];
    if (layerId in entry.layerSnapshots) {
      return entry.layerSnapshots[layerId] ?? null;
    }
  }
  return null;
}

/**
 * Build a LayerStructureSnapshot array from current document layers.
 */
function captureLayerStructure(layers: readonly Layer[]): LayerStructureSnapshot[] {
  return layers.map((l) => ({
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
}

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

    // Truncate future history first so prevEntry is accurate
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    const prevEntry = newHistory.length > 0 ? newHistory[newHistory.length - 1] : null;

    // Build delta snapshot: only include layers whose data changed
    const snapshot: Record<string, string | null> = {};
    const changedLayerIds: string[] = [];

    for (const layer of state.document.layers) {
      if (!prevEntry) {
        // First entry — full snapshot (baseline)
        snapshot[layer.id] = layer.data;
        changedLayerIds.push(layer.id);
      } else {
        // Delta: compare with the resolved data at the previous entry
        const prevData = resolveLayerData(newHistory, newHistory.length - 1, layer.id);
        if (prevData !== layer.data) {
          snapshot[layer.id] = layer.data;
          changedLayerIds.push(layer.id);
        }
      }
    }

    const layerStructure = captureLayerStructure(state.document.layers);

    const entry: HistoryEntry = {
      changedLayerIds,
      layerSnapshots: snapshot,
      layerCanvasSnapshots,
      layerStructure,
      activeLayerId: state.document.activeLayerId,
      maskLayerId: state.document.maskLayerId,
      restoreMode,
      action,
      timestamp: Date.now()
    };

    newHistory.push(entry);

    // Trim to max size — merge dropped entry's data into the new oldest
    if (newHistory.length > MAX_HISTORY_SIZE) {
      const dropped = newHistory.shift()!;
      const newOldest = newHistory[0];
      if (newOldest.changedLayerIds) {
        // Copy forward any layer data from the dropped entry that
        // the new oldest entry doesn't already have
        for (const [layerId, data] of Object.entries(dropped.layerSnapshots)) {
          if (!(layerId in newOldest.layerSnapshots)) {
            newOldest.layerSnapshots[layerId] = data;
          }
        }
        // Mark as full snapshot since it's now the baseline
        newOldest.changedLayerIds = undefined;
      }
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

    // When undoing from the tip of history, append a full snapshot of
    // the current state so that redo can restore it later.
    let history = state.history;
    if (state.historyIndex === state.history.length - 1) {
      const tipSnapshot: Record<string, string | null> = {};
      for (const layer of state.document.layers) {
        tipSnapshot[layer.id] = layer.data;
      }
      const tipEntry: HistoryEntry = {
        layerSnapshots: tipSnapshot,
        layerStructure: captureLayerStructure(state.document.layers),
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
    // Build resolved snapshots for all layers so that the returned entry
    // can be used to restore runtime canvases (useHistoryActions).
    const resolvedSnapshots: Record<string, string | null> = {};
    if (entry.layerStructure && entry.layerStructure.length > 0) {
      layers = entry.layerStructure.map((ls) => {
        const data = resolveLayerData(history, newIndex, ls.id);
        resolvedSnapshots[ls.id] = data;
        return { ...ls, data };
      });
    } else {
      layers = state.document.layers.map((l) => {
        const data = entry.layerSnapshots[l.id] ?? l.data;
        resolvedSnapshots[l.id] = data;
        return { ...l, data };
      });
    }

    // Return a resolved copy so restoreEntry can restore all layer canvases
    const resolvedEntry: HistoryEntry = {
      ...entry,
      layerSnapshots: resolvedSnapshots
    };

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
    return resolvedEntry;
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
    const resolvedSnapshots: Record<string, string | null> = {};
    if (entry.layerStructure && entry.layerStructure.length > 0) {
      layers = entry.layerStructure.map((ls) => {
        const data = resolveLayerData(state.history, newIndex, ls.id);
        resolvedSnapshots[ls.id] = data;
        return { ...ls, data };
      });
    } else {
      layers = state.document.layers.map((l) => {
        const data = entry.layerSnapshots[l.id] ?? l.data;
        resolvedSnapshots[l.id] = data;
        return { ...l, data };
      });
    }

    const resolvedEntry: HistoryEntry = {
      ...entry,
      layerSnapshots: resolvedSnapshots
    };

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
    return resolvedEntry;
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1
});
