/**
 * SketchCanvasRefStore
 *
 * Tiny Zustand store that holds non-reactive getters into the live
 * `SketchCanvasRef`. The sketch editor registers the getters at mount and
 * any consumer (Inpaint Here, Re-generate Stale Layers, etc.) reads them
 * without prop-drilling the canvas ref or duplicating compositing code.
 *
 * The getters return `null` when the canvas is unavailable so callers can
 * gracefully no-op (e.g. before the sketch has mounted).
 */

import { create } from "zustand";

interface SketchCanvasRefState {
  /** Flattens all visible layers into a PNG data URL, or returns null. */
  flattenToDataUrl: (() => string | null) | null;
  /** Returns the active mask layer rendered as a PNG data URL, or null. */
  getMaskDataUrl: (() => string | null) | null;

  setGetters: (getters: {
    flattenToDataUrl: () => string;
    getMaskDataUrl: () => string | null;
  }) => void;
  clearGetters: () => void;
}

export const useSketchCanvasRefStore = create<SketchCanvasRefState>((set) => ({
  flattenToDataUrl: null,
  getMaskDataUrl: null,

  setGetters: (getters) =>
    set({
      flattenToDataUrl: getters.flattenToDataUrl,
      getMaskDataUrl: getters.getMaskDataUrl
    }),

  clearGetters: () =>
    set({ flattenToDataUrl: null, getMaskDataUrl: null })
}));
