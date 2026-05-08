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

import { create } from "zustand";
import {
  createDocumentSlice,
  createViewportSlice,
  createToolSlice,
  createHistorySlice,
  createSelectionSlice,
  createUiSlice,
  SKETCH_ZOOM_MIN,
  SKETCH_ZOOM_MAX
} from "./slices";
import type {
  DocumentSlice,
  ViewportSlice,
  ToolSlice,
  HistorySlice,
  SelectionSlice,
  UiSlice
} from "./slices";

export { SKETCH_ZOOM_MIN, SKETCH_ZOOM_MAX };

export type SketchStore = DocumentSlice &
  ViewportSlice &
  ToolSlice &
  HistorySlice &
  SelectionSlice &
  UiSlice;

export const useSketchStore = create<SketchStore>((...a) => ({
  ...createDocumentSlice(...a),
  ...createViewportSlice(...a),
  ...createToolSlice(...a),
  ...createHistorySlice(...a),
  ...createSelectionSlice(...a),
  ...createUiSlice(...a)
}));
