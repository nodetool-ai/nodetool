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
  invertMaskInPlace,
  selectionHasAnyPixels,
  selectionToDocumentAligned,
  trimSelectionMask
} from "../../selection";

/** Max pad around ROI for blur-like ops; must cover ~3× feather radius for edges. */
const MAX_SELECTION_MUTATION_PADDING = 256;

/** Extra blur bleed beyond nominal feather radius (box blur × 3 passes). */
const FEATHER_MUTATION_PAD_FACTOR = 3;

function featherMutationPaddingPx(featherRadius: number): number {
  const r = Math.max(0, Math.round(featherRadius));
  return Math.min(
    MAX_SELECTION_MUTATION_PADDING,
    Math.ceil(r * FEATHER_MUTATION_PAD_FACTOR)
  );
}
const MAX_SELECTION_BORDER_WIDTH = 64;

/**
 * Returns bounds for every pixel with any remaining alpha.
 *
 * This intentionally keeps sub-threshold soft edges so repeated feather/smooth
 * operations do not clip partially selected pixels back to the hard-selection
 * threshold before the next mutation runs.
 */
function getSelectionAlphaBounds(
  sel: Selection
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const { width, height, data } = sel;
  // Sentinel values let us detect the "found nothing" case after one scan.
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

  if (maxX < 0 || maxY < 0 || minX >= width || minY >= height) {
    return null;
  }

  return { minX, minY, maxX, maxY };
}

function cloneSelectionRegion(sel: Selection, padding: number): Selection {
  const bounds = getSelectionAlphaBounds(sel);
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

/**
 * Trims zero-valued borders after a mutation so the store does not retain a
 * full-document buffer when the edited selection only occupies a small ROI.
 * When the mutation clears everything, keep the mutated buffer instead of
 * switching to `null` so empty-selection behavior stays unchanged.
 */
function finalizeMutatedSelection(sel: Selection): Selection {
  return trimSelectionMask(sel) ?? sel;
}

/**
 * How the active selection is rendered on the canvas.
 * - `ants`: classic marching-ants outline (default).
 * - `mask`: red @ 50% rubylith overlay over unselected pixels (Photoshop "Quick Mask" style).
 *
 * Useful while refining feather / smooth / grow / shrink — the rubylith makes
 * partial selections visible in a way ants cannot.
 */
export type SelectionPreviewMode = "ants" | "mask";

export interface SelectionSlice {
  selection: Selection | null;
  lastSelection: Selection | null;
  /** Cached boolean — `true` when `selection` contains at least one pixel ≥ threshold. */
  hasActiveSelection: boolean;
  selectionPreviewMode: SelectionPreviewMode;
  setSelection: (sel: Selection | null) => void;
  setSelectionPreviewMode: (mode: SelectionPreviewMode) => void;
  selectAll: () => void;
  invertSelection: () => void;
  reselectLastSelection: () => void;
  /**
   * GPU-accelerated feather. Resolves once the post-blur mask has been read
   * back to CPU and committed to the store. Callers that want to chain (e.g.
   * to disable a UI control while the kernel runs) can `await` the result.
   *
   * Resolves immediately (no-op) when there is no active selection, no
   * registered runtime, or the runtime lacks `featherSelectionGpu`. There is
   * no CPU fallback by design — the kernel must run on the GPU.
   */
  featherCurrentSelection: () => Promise<void>;
  /**
   * GPU-accelerated smooth (feather + threshold @ 128). Resolves once
   * the post-pass mask has been committed. No-op without a runtime
   * exposing `smoothSelectionGpu`.
   */
  smoothCurrentSelectionBorders: () => Promise<void>;
  /** Replace the filled selection with a border ring of width from tool settings. */
  convertSelectionToBorderOutline: () => void;
  /**
   * GPU-accelerated expand (mask dilation). Resolves once the post-pass
   * mask has been read back to CPU and committed. No-op when there is no
   * active selection, no registered runtime, or the runtime lacks
   * `expandSelectionGpu`. There is no CPU fallback by design.
   */
  expandCurrentSelection: (px: number) => Promise<void>;
  /**
   * GPU-accelerated contract (mask erosion). Same shape as
   * `expandCurrentSelection`.
   */
  contractCurrentSelection: (px: number) => Promise<void>;
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
  selectionPreviewMode: "ants",

  setSelectionPreviewMode: (mode: SelectionPreviewMode) => {
    set({ selectionPreviewMode: mode });
  },

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

  featherCurrentSelection: async () => {
    const state = get();
    const sel = state.selection;
    if (!selectionHasAnyPixels(sel)) {
      return;
    }
    const radius = state.toolSettings.select.featherRadius;
    const runtime = state.runtime;

    // GPU is the only blur path — no CPU fallback by design. If the runtime
    // is not (yet) registered or doesn't expose the GPU API, we no-op
    // rather than fall back to the slow synchronous CPU path.
    if (!runtime?.featherSelectionGpu) {
      return;
    }

    // Pad the buffer so the blur kernel has zero-valued pixels around the
    // existing selection to bleed into. Without this, the texture's
    // clamp-to-edge sampling holds the selection's edge value steady and
    // the feather visibly clips at the tight selection bounds.
    const padded = cloneSelectionRegion(sel!, featherMutationPaddingPx(radius));

    // Push the padded buffer to the runtime BEFORE awaiting the GPU op so
    // the upload happens against the right dimensions. The React effect in
    // `useCanvasOrchestration` will also call `setSelection(padded)` on the
    // next render — that becomes a no-op because the data reference matches.
    runtime.setSelection(padded);
    get().setSelection(padded);

    const result = await runtime.featherSelectionGpu(radius);
    if (!result) {
      return;
    }
    get().setSelection(finalizeMutatedSelection(result));
  },

  smoothCurrentSelectionBorders: async () => {
    const sel = get().selection;
    if (!selectionHasAnyPixels(sel)) {
      return;
    }
    const runtime = get().runtime;
    if (!runtime?.smoothSelectionGpu) {
      return;
    }
    // Smooth = feather(3) + threshold. Pad by the feather kernel's bleed
    // radius so the soft edge has room to fall off before the threshold
    // snaps it back to 0/255. Without padding, the feather sees the
    // texture clamp-to-edge value and the threshold pulls the edge
    // outline inward.
    const STRENGTH = 3;
    const padded = cloneSelectionRegion(
      sel!,
      featherMutationPaddingPx(STRENGTH)
    );
    runtime.setSelection(padded);
    get().setSelection(padded);

    const result = await runtime.smoothSelectionGpu(STRENGTH);
    if (!result) {
      return;
    }
    get().setSelection(finalizeMutatedSelection(result));
  },

  convertSelectionToBorderOutline: () => {
    const state = get();
    const sel = state.selection;
    if (!selectionHasAnyPixels(sel)) {
      return;
    }
    const widthPx = state.toolSettings.select.borderWidth;
    const normalizedBorderWidth = Math.max(
      1,
      Math.min(MAX_SELECTION_BORDER_WIDTH, Math.round(widthPx))
    );
    const copy = cloneSelectionRegion(sel!, Math.ceil(normalizedBorderWidth / 2));
    const ring = buildSelectionBorderStrokeMask(copy, widthPx);
    if (!ring || !selectionHasAnyPixels(ring)) {
      return;
    }
    get().setSelection(finalizeMutatedSelection(ring));
  },

  expandCurrentSelection: async (px: number) => {
    const sel = get().selection;
    if (!selectionHasAnyPixels(sel)) {
      return;
    }
    const runtime = get().runtime;
    if (!runtime?.expandSelectionGpu) {
      return;
    }
    const r = Math.max(0, Math.round(px));
    // Pad so the dilate kernel has room to grow into beyond the current
    // tight selection bounds. Without padding, max-filter values would
    // clamp at the texture edge and the expand never extends past the
    // selection's original outer bbox.
    const padded = cloneSelectionRegion(sel!, r);
    runtime.setSelection(padded);
    get().setSelection(padded);

    const result = await runtime.expandSelectionGpu(r);
    if (!result) {
      return;
    }
    get().setSelection(finalizeMutatedSelection(result));
  },

  contractCurrentSelection: async (px: number) => {
    const sel = get().selection;
    if (!selectionHasAnyPixels(sel)) {
      return;
    }
    const runtime = get().runtime;
    if (!runtime?.contractSelectionGpu) {
      return;
    }
    const r = Math.max(0, Math.round(px));
    // Padding must be ≥ px so the cloned region has zero-valued pixels
    // around the selection bounds; otherwise the min-filter's clamp-to-
    // edge reads see the original selection's edge value and never erode
    // the outermost pixels.
    const padded = cloneSelectionRegion(sel!, r);
    runtime.setSelection(padded);
    get().setSelection(padded);

    const result = await runtime.contractSelectionGpu(r);
    if (!result) {
      return;
    }
    get().setSelection(finalizeMutatedSelection(result));
  }
});
