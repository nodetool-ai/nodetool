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
  PushHistoryOptions,
  SketchDocument
} from "../../types";
import { MAX_HISTORY_SIZE } from "../../types";
import { selectionHasAnyPixels } from "../../selection";

function cloneHistoryValue<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

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
    transform: cloneHistoryValue(l.transform),
    contentBounds: cloneHistoryValue(l.contentBounds),
    exposedAsInput: l.exposedAsInput,
    exposedAsOutput: l.exposedAsOutput,
    imageReference: cloneHistoryValue(l.imageReference),
    parentId: l.parentId,
    collapsed: l.collapsed,
    segmentationMeta: cloneHistoryValue(l.segmentationMeta),
    effects: cloneHistoryValue(l.effects)
  }));
}

function captureDocumentCanvas(
  canvas: SketchDocument["canvas"]
): SketchDocument["canvas"] {
  return { ...canvas };
}

export interface HistorySlice {
  history: HistoryEntry[];
  historyIndex: number;
  pushHistory: (
    action: string,
    layerCanvasSnapshots?: Record<string, HTMLCanvasElement | null>,
    options?: PushHistoryOptions
  ) => void;
  undo: (
    layerCanvasSnapshots?: Record<string, HTMLCanvasElement | null>
  ) => HistoryEntry | null;
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

    // Fast path: selection-only changes don't need layer data or structure.
    // Undo/redo of these entries restores the selection without touching layers.
    const entry: HistoryEntry = options?.selectionOnly
      ? {
          changedLayerIds: [],
          layerSnapshots: {},
          layerStructure: [],
          documentCanvas: captureDocumentCanvas(state.document.canvas),
          activeLayerId: state.document.activeLayerId,
          maskLayerId: state.document.maskLayerId,
          selection: state.selection,
          restoreMode: "structure-only",
          action,
          timestamp: Date.now()
        }
      : (() => {
          const prevEntry = newHistory.length > 0 ? newHistory[newHistory.length - 1] : null;

          // Build delta snapshot: only include layers whose data changed
          const snapshot: Record<string, string | null> = {};
          const changedLayerIds: string[] = [];

          for (const layer of state.document.layers) {
            if (!prevEntry) {
              snapshot[layer.id] = layer.data;
              changedLayerIds.push(layer.id);
            } else {
              const prevData = resolveLayerData(newHistory, newHistory.length - 1, layer.id);
              if (prevData !== layer.data) {
                snapshot[layer.id] = layer.data;
                changedLayerIds.push(layer.id);
              }
            }
          }

          return {
            changedLayerIds,
            layerSnapshots: snapshot,
            layerCanvasSnapshots,
            layerStructure: captureLayerStructure(state.document.layers),
            documentCanvas: captureDocumentCanvas(state.document.canvas),
            activeLayerId: state.document.activeLayerId,
            maskLayerId: state.document.maskLayerId,
            selection: state.selection,
            restoreMode,
            action,
            timestamp: Date.now()
          };
        })();

    newHistory.push(entry);

    // Trim to max size — merge dropped entry's data into the new oldest
    if (newHistory.length > MAX_HISTORY_SIZE) {
      const dropped = newHistory.shift()!;
      const newOldest = newHistory[0];
      // Always merge dropped data forward to maintain the baseline invariant.
      // The dropped entry (former baseline) may have data for layers not in
      // the new oldest — e.g. layers that were removed between the two entries.
      for (const [layerId, data] of Object.entries(dropped.layerSnapshots)) {
        if (!(layerId in newOldest.layerSnapshots)) {
          newOldest.layerSnapshots[layerId] = data;
        }
      }
      // Mark as full snapshot since it's now the baseline
      newOldest.changedLayerIds = undefined;
    }

    set({
      history: newHistory,
      historyIndex: newHistory.length - 1
    });
  },

  undo: (layerCanvasSnapshots?: Record<string, HTMLCanvasElement | null>) => {
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
        layerCanvasSnapshots,
        layerStructure: captureLayerStructure(state.document.layers),
        documentCanvas: captureDocumentCanvas(state.document.canvas),
        activeLayerId: state.document.activeLayerId,
        maskLayerId: state.document.maskLayerId,
        selection: state.selection,
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

    const restoredSelection = entry.selection !== undefined ? entry.selection : null;
    set({
      document: {
        ...state.document,
        canvas: entry.documentCanvas ?? state.document.canvas,
        layers,
        activeLayerId:
          entry.activeLayerId ?? state.document.activeLayerId,
        maskLayerId:
          entry.maskLayerId !== undefined
            ? entry.maskLayerId
            : state.document.maskLayerId
      },
      selection: restoredSelection,
      hasActiveSelection: selectionHasAnyPixels(restoredSelection),
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

    const restoredSelection = entry.selection !== undefined ? entry.selection : null;
    set({
      document: {
        ...state.document,
        canvas: entry.documentCanvas ?? state.document.canvas,
        layers,
        activeLayerId:
          entry.activeLayerId ?? state.document.activeLayerId,
        maskLayerId:
          entry.maskLayerId !== undefined
            ? entry.maskLayerId
            : state.document.maskLayerId
      },
      selection: restoredSelection,
      hasActiveSelection: selectionHasAnyPixels(restoredSelection),
      historyIndex: newIndex
    });
    return resolvedEntry;
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1
});
