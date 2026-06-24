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
 * Resolve the layer structure at a given history index. Selection-only
 * entries don't capture structure (`layerStructure: []`) and never change
 * it, so walk backward to the nearest entry that did capture one.
 */
function resolveLayerStructure(
  history: HistoryEntry[],
  upToIndex: number
): LayerStructureSnapshot[] {
  for (let i = upToIndex; i >= 0; i--) {
    if (history[i].layerStructure.length > 0) {
      return history[i].layerStructure;
    }
  }
  return [];
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

/**
 * Whether the live document is *ahead* of the snapshot stored at `index` —
 * i.e. there are uncommitted edits since that checkpoint.
 *
 * `pushHistory` is called with two conventions across the editor:
 *  - push-after-mutate (layer ops): the entry already reflects the live state.
 *  - push-before-mutate (strokes, transforms): the entry holds the *pre*-edit
 *    state and the live document is one edit ahead.
 *
 * `undo` uses this to decide whether it must first append a "current state"
 * tip entry (so redo can return to the uncommitted edit) and step back from
 * that tip, versus simply stepping back one checkpoint. Comparing the actual
 * state — not a convention flag — keeps undo correct regardless of how the
 * caller pushed. Short-circuits on the first difference; the common stroke
 * case is caught immediately by the layer-data check.
 */
function isLiveStateAhead(
  document: SketchDocument,
  history: HistoryEntry[],
  index: number
): boolean {
  const entry = history[index];
  const canvas = document.canvas;
  const ec = entry.documentCanvas;
  if (
    ec &&
    (canvas.width !== ec.width ||
      canvas.height !== ec.height ||
      canvas.backgroundColor !== ec.backgroundColor)
  ) {
    return true;
  }
  if (document.activeLayerId !== entry.activeLayerId) {
    return true;
  }
  if ((document.maskLayerId ?? null) !== (entry.maskLayerId ?? null)) {
    return true;
  }

  // Raster data — the common case for strokes/fills/paste.
  for (const layer of document.layers) {
    const stored = resolveLayerData(history, index, layer.id);
    if ((layer.data ?? null) !== (stored ?? null)) {
      return true;
    }
  }

  // Layer structure (order + metadata) — the case for transforms, opacity,
  // visibility, etc. Selection isn't compared: selection edits always commit
  // via a push, so they never leave an uncommitted tip.
  const storedStructure = resolveLayerStructure(history, index);
  const liveStructure = captureLayerStructure(document.layers);
  if (storedStructure.length !== liveStructure.length) {
    return true;
  }
  return JSON.stringify(liveStructure) !== JSON.stringify(storedStructure);
}

/**
 * Trim `history` (mutated in place) to `MAX_HISTORY_SIZE`, merging the dropped
 * baseline's layer data forward so reconstruction stays correct. Returns the
 * number of entries dropped from the front (0 or 1) so callers can adjust the
 * active index.
 */
function trimHistoryInPlace(history: HistoryEntry[]): number {
  if (history.length <= MAX_HISTORY_SIZE) {
    return 0;
  }
  const dropped = history.shift()!;
  const oldest = history[0];
  // The dropped entry (former baseline) may hold data for layers absent from
  // the new oldest — e.g. layers removed between the two. Spread to avoid
  // mutating the existing entry (Zustand state must be immutable).
  history[0] = {
    ...oldest,
    layerSnapshots: { ...dropped.layerSnapshots, ...oldest.layerSnapshots },
    changedLayerIds: undefined
  };
  return 1;
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
    trimHistoryInPlace(newHistory);

    set({
      history: newHistory,
      historyIndex: newHistory.length - 1
    });
  },

  undo: (layerCanvasSnapshots?: Record<string, HTMLCanvasElement | null>) => {
    const state = get();
    if (state.historyIndex < 0) {
      return null;
    }

    // Detect an uncommitted edit ahead of the current checkpoint. This happens
    // with push-before-mutate callers (strokes, transforms): `historyIndex`
    // points at the pre-edit snapshot while the live document is one edit
    // ahead. Only the tip can be dirty — undo/redo and push-after callers
    // always leave the live state equal to the entry at `historyIndex`.
    const dirtyTip =
      state.historyIndex === state.history.length - 1 &&
      isLiveStateAhead(state.document, state.history, state.historyIndex);

    let history = state.history;
    let newIndex: number;
    if (dirtyTip) {
      // Append a full snapshot of the live state so redo can return to it,
      // then step back from that tip to the current checkpoint (a single
      // step back from the live edit — not two).
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
      const dropped = trimHistoryInPlace(history);
      newIndex = state.historyIndex - dropped;
    } else {
      // Live state already matches the tip — step back one checkpoint.
      if (state.historyIndex <= 0) {
        return null;
      }
      newIndex = state.historyIndex - 1;
    }

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

  canUndo: () => {
    const state = get();
    if (state.historyIndex > 0) {
      return true;
    }
    // A single checkpoint with an uncommitted edit ahead of it (e.g. the first
    // stroke on a fresh document) is still undoable — back to that checkpoint.
    return (
      state.historyIndex === 0 &&
      state.historyIndex === state.history.length - 1 &&
      isLiveStateAhead(state.document, state.history, 0)
    );
  },
  canRedo: () => get().historyIndex < get().history.length - 1
});
