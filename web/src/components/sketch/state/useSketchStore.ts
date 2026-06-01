/**
 * Sketch Editor State Management
 *
 * Zustand store for managing sketch editor state including document,
 * tools, layers, and undo/redo history.
 *
 * The store is composed from domain-scoped slices (see ./slices/):
 *   - DocumentSlice  — document state, layer CRUD, group actions, canvas ops
 *   - ViewportSlice  — zoom, pan
 *   - ToolSlice      — active tool, per-tool settings, colors, symmetry
 *   - HistorySlice   — undo/redo history management
 *   - SelectionSlice — selection mask state and operations
 *   - UiSlice        — ephemeral UI flags, layer multi-select, isolation
 */

import { create, type StoreApi, type UseBoundStore } from "zustand";
import {
  createDocumentSlice,
  createViewportSlice,
  createToolSlice,
  createHistorySlice,
  createSelectionSlice,
  createUiSlice,
  createRuntimeSlice,
  SKETCH_ZOOM_MIN,
  SKETCH_ZOOM_MAX
} from "./slices";
import type {
  DocumentSlice,
  ViewportSlice,
  ToolSlice,
  HistorySlice,
  SelectionSlice,
  UiSlice,
  RuntimeSlice
} from "./slices";
import { normalizeSketchDocument, type HistoryEntry, type Point, type SketchDocument, type SketchTool } from "../types";

export { SKETCH_ZOOM_MIN, SKETCH_ZOOM_MAX };

export type SketchStore = DocumentSlice &
  ViewportSlice &
  ToolSlice &
  HistorySlice &
  SelectionSlice &
  UiSlice &
  RuntimeSlice;

/** Vanilla store handle for a single sketch-editor instance. */
export type SketchStoreApi = UseBoundStore<StoreApi<SketchStore>>;

/**
 * Create a fresh, isolated sketch-editor store. One instance per editor
 * surface (workspace tab, standalone page, in-node modal) so multiple
 * documents can be edited in parallel without sharing layers, history,
 * viewport, or tool state. See {@link SketchProvider}.
 */
export const createSketchStore = (): SketchStoreApi =>
  create<SketchStore>((...a) => ({
    ...createDocumentSlice(...a),
    ...createViewportSlice(...a),
    ...createToolSlice(...a),
    ...createHistorySlice(...a),
    ...createSelectionSlice(...a),
    ...createUiSlice(...a),
    ...createRuntimeSlice(...a)
  }));

// The reactive `useSketchStore` hook (context-bound) is re-exported from the
// instance module below so call sites keep importing it from "../state".
export {
  useSketchStore,
  useSketchStoreApi
} from "../../../stores/sketch/SketchInstance";

export interface PersistedSketchStoreState {
  document: SketchDocument;
  activeTool?: SketchTool;
  zoom?: number;
  pan?: Point;
  history?: HistoryEntry[];
  historyIndex?: number;
}

export function hydrateSketchStore(
  store: StoreApi<SketchStore>,
  state: PersistedSketchStoreState
): void {
  const normalized = normalizeSketchDocument(state.document);
  store.setState({
    document: normalized,
    toolSettings: normalized.toolSettings,
    activeTool: state.activeTool ?? "select",
    transientMoveModifierHeld: false,
    zoom:
      typeof state.zoom === "number"
        ? Math.max(SKETCH_ZOOM_MIN, Math.min(SKETCH_ZOOM_MAX, state.zoom))
        : 1,
    pan: state.pan ?? { x: 0, y: 0 },
    history: state.history ?? [],
    historyIndex: typeof state.historyIndex === "number" ? state.historyIndex : -1,
    isDrawing: false,
    selectedLayerIds: [],
    layerShiftRangeAnchorId: null
  });
}
