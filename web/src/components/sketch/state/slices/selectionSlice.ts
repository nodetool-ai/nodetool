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
  smoothSelectionBorders,
  trimSelectionMask
} from "../../selection";

function getNonZeroSelectionBounds(
  sel: Selection
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const { width, height, data } = sel;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (data[row + x] === 0) {
        continue;
      }
      if (x < minX) {
        minX = x;
      }
      if (y < minY) {
        minY = y;
      }
      if (x > maxX) {
        maxX = x;
      }
      if (y > maxY) {
        maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  return { minX, minY, maxX, maxY };
}

function cloneSelectionRegion(sel: Selection, padding: number): Selection {
  const bounds = getNonZeroSelectionBounds(sel);
  if (!bounds) {
    return cloneSelectionMask(sel);
  }

  const paddedMinX = bounds.minX - padding;
  const paddedMinY = bounds.minY - padding;
  const paddedMaxX = bounds.maxX + padding;
  const paddedMaxY = bounds.maxY + padding;
  const width = paddedMaxX - paddedMinX + 1;
  const height = paddedMaxY - paddedMinY + 1;
  const data = new Uint8ClampedArray(width * height);
  const srcX0 = Math.max(0, paddedMinX);
  const srcY0 = Math.max(0, paddedMinY);
  const srcX1 = Math.min(sel.width - 1, paddedMaxX);
  const srcY1 = Math.min(sel.height - 1, paddedMaxY);
  const copyWidth = srcX1 - srcX0 + 1;
  const dstX = srcX0 - paddedMinX;
  const dstY = srcY0 - paddedMinY;

  for (let y = srcY0; y <= srcY1; y++) {
    const srcOffset = y * sel.width + srcX0;
    const dstOffset = (dstY + (y - srcY0)) * width + dstX;
    data.set(sel.data.subarray(srcOffset, srcOffset + copyWidth), dstOffset);
  }

  return {
    width,
    height,
    data,
    originX: (sel.originX ?? 0) + paddedMinX,
    originY: (sel.originY ?? 0) + paddedMinY
  };
}

function finalizeMutatedSelection(sel: Selection): Selection {
  return trimSelectionMask(sel) ?? sel;
}

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
    const copy = cloneSelectionRegion(
      sel!,
      Math.max(0, Math.min(64, Math.round(state.toolSettings.select.featherRadius)))
    );
    featherMaskAlpha(copy, state.toolSettings.select.featherRadius);
    get().setSelection(finalizeMutatedSelection(copy));
  },

  smoothCurrentSelectionBorders: () => {
    const sel = get().selection;
    if (!selectionHasAnyPixels(sel)) {
      return;
    }
    const copy = cloneSelectionRegion(sel!, 3);
    smoothSelectionBorders(copy, 3);
    get().setSelection(finalizeMutatedSelection(copy));
  },

  convertSelectionToBorderOutline: () => {
    const state = get();
    const sel = state.selection;
    if (!selectionHasAnyPixels(sel)) {
      return;
    }
    const widthPx = state.toolSettings.select.borderWidth;
    const copy = cloneSelectionRegion(sel!, Math.ceil(Math.max(1, widthPx) / 2));
    const ring = buildSelectionBorderStrokeMask(copy, widthPx);
    if (!ring || !selectionHasAnyPixels(ring)) {
      return;
    }
    get().setSelection(finalizeMutatedSelection(ring));
  },

  expandCurrentSelection: (px: number) => {
    const sel = get().selection;
    if (!selectionHasAnyPixels(sel)) return;
    const copy = cloneSelectionRegion(sel!, Math.max(0, Math.round(px)));
    expandSelectionMask(copy, px);
    get().setSelection(finalizeMutatedSelection(copy));
  },

  contractCurrentSelection: (px: number) => {
    const sel = get().selection;
    if (!selectionHasAnyPixels(sel)) return;
    const copy = cloneSelectionRegion(sel!, 0);
    contractSelectionMask(copy, px);
    get().setSelection(finalizeMutatedSelection(copy));
  }
});
