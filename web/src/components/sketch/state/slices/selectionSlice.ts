/**
 * Selection Slice — selection mask state and operations.
 */

import type { StateCreator } from "zustand";
import type { SketchStore } from "../useSketchStore";
import type { Selection } from "../../types";
import {
  buildSelectionBorderStrokeMask,
  cloneSelectionMask,
  contractSelectionMask,
  createEmptyMask,
  expandSelectionMask,
  featherMaskAlpha,
  invertMaskInPlace,
  selectionHasAnyPixels,
  selectionToDocumentAligned,
  smoothSelectionBorders
} from "../../selection";

export interface SelectionSlice {
  selection: Selection | null;
  lastSelection: Selection | null;
  /** Cached boolean — `true` when `selection` contains at least one pixel ≥ threshold. */
  hasActiveSelection: boolean;
  setSelection: (sel: Selection | null) => void;
  selectAll: () => void;
  invertSelection: () => void;
  reselectLastSelection: () => void;
  featherCurrentSelection: () => void;
  smoothCurrentSelectionBorders: () => void;
  /** Replace the filled selection with a border ring of width from tool settings. */
  convertSelectionToBorderOutline: () => void;
  expandCurrentSelection: (px: number) => void;
  contractCurrentSelection: (px: number) => void;
}

export const createSelectionSlice: StateCreator<
  SketchStore,
  [],
  [],
  SelectionSlice
> = (set, get) => ({
  selection: null,
  lastSelection: null,
  hasActiveSelection: false,

  setSelection: (sel: Selection | null) => {
    const current = get().selection;
    const active = selectionHasAnyPixels(sel);
    if (current && !sel) {
      set({ selection: sel, lastSelection: current, hasActiveSelection: false });
    } else {
      set({ selection: sel, hasActiveSelection: active });
    }
  },

  selectAll: () => {
    const state = get();
    const { width: cw, height: ch } = state.document.canvas;
    const m = createEmptyMask(cw, ch);
    m.data.fill(255);
    set({ selection: m, hasActiveSelection: true });
    get().pushHistory("select all", undefined, { selectionOnly: true });
  },

  invertSelection: () => {
    const state = get();
    const { width: cw, height: ch } = state.document.canvas;
    const cur = state.selection;
    if (!cur) {
      const m = createEmptyMask(cw, ch);
      m.data.fill(255);
      set({ selection: m, hasActiveSelection: true });
    } else {
      const ox = cur.originX ?? 0;
      const oy = cur.originY ?? 0;
      const aligned =
        ox === 0 && oy === 0 && cur.width === cw && cur.height === ch
          ? cloneSelectionMask(cur)
          : selectionToDocumentAligned(cur, cw, ch);
      invertMaskInPlace(aligned);
      const active = selectionHasAnyPixels(aligned);
      set({ selection: aligned, hasActiveSelection: active });
    }
    get().pushHistory("invert selection", undefined, { selectionOnly: true });
  },

  reselectLastSelection: () => {
    const last = get().lastSelection;
    if (last) {
      const clone = cloneSelectionMask(last);
      set({ selection: clone, hasActiveSelection: selectionHasAnyPixels(clone) });
      get().pushHistory("reselect", undefined, { selectionOnly: true });
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
  },

  expandCurrentSelection: (px: number) => {
    const sel = get().selection;
    if (!selectionHasAnyPixels(sel)) return;
    const copy = cloneSelectionMask(sel!);
    expandSelectionMask(copy, px);
    get().setSelection(copy);
  },

  contractCurrentSelection: (px: number) => {
    const sel = get().selection;
    if (!selectionHasAnyPixels(sel)) return;
    const copy = cloneSelectionMask(sel!);
    contractSelectionMask(copy, px);
    get().setSelection(copy);
  }
});
