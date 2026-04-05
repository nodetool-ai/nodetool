/**
 * Selection Slice — selection mask state and operations.
 */

import type { StateCreator } from "zustand";
import type { SketchStore } from "../useSketchStore";
import type { Selection } from "../../types";
import {
  buildSelectionBorderStrokeMask,
  cloneSelectionMask,
  createEmptyMask,
  featherMaskAlpha,
  invertMaskInPlace,
  selectionHasAnyPixels,
  selectionToDocumentAligned,
  smoothSelectionBorders
} from "../../selection";

export interface SelectionSlice {
  selection: Selection | null;
  lastSelection: Selection | null;
  setSelection: (sel: Selection | null) => void;
  selectAll: () => void;
  invertSelection: () => void;
  reselectLastSelection: () => void;
  featherCurrentSelection: () => void;
  smoothCurrentSelectionBorders: () => void;
  /** Replace the filled selection with a border ring of width from tool settings. */
  convertSelectionToBorderOutline: () => void;
}

export const createSelectionSlice: StateCreator<
  SketchStore,
  [],
  [],
  SelectionSlice
> = (set, get) => ({
  selection: null,
  lastSelection: null,

  setSelection: (sel: Selection | null) => {
    const current = get().selection;
    if (current && !sel) {
      set({ selection: sel, lastSelection: cloneSelectionMask(current) });
    } else {
      set({ selection: sel });
    }
  },

  selectAll: () => {
    const state = get();
    const { width: cw, height: ch } = state.document.canvas;
    const m = createEmptyMask(cw, ch);
    m.data.fill(255);
    set({ selection: m });
  },

  invertSelection: () => {
    const state = get();
    const { width: cw, height: ch } = state.document.canvas;
    const cur = state.selection;
    if (!cur) {
      const m = createEmptyMask(cw, ch);
      m.data.fill(255);
      set({ selection: m });
      return;
    }
    const ox = cur.originX ?? 0;
    const oy = cur.originY ?? 0;
    const aligned =
      ox === 0 && oy === 0 && cur.width === cw && cur.height === ch
        ? cloneSelectionMask(cur)
        : selectionToDocumentAligned(cur, cw, ch);
    invertMaskInPlace(aligned);
    set({ selection: aligned });
  },

  reselectLastSelection: () => {
    const last = get().lastSelection;
    if (last) {
      set({ selection: cloneSelectionMask(last) });
    }
  },

  featherCurrentSelection: () => {
    const state = get();
    const sel = state.selection;
    if (!selectionHasAnyPixels(sel)) {
      return;
    }
    const copy = cloneSelectionMask(sel!);
    featherMaskAlpha(copy, state.toolSettings.select.featherRadius);
    get().setSelection(copy);
  },

  smoothCurrentSelectionBorders: () => {
    const sel = get().selection;
    if (!selectionHasAnyPixels(sel)) {
      return;
    }
    const copy = cloneSelectionMask(sel!);
    smoothSelectionBorders(copy, 3);
    get().setSelection(copy);
  },

  convertSelectionToBorderOutline: () => {
    const state = get();
    const sel = state.selection;
    if (!selectionHasAnyPixels(sel)) {
      return;
    }
    const widthPx = state.toolSettings.select.borderWidth;
    const ring = buildSelectionBorderStrokeMask(sel!, widthPx);
    if (!ring || !selectionHasAnyPixels(ring)) {
      return;
    }
    get().setSelection(ring);
  }
});
