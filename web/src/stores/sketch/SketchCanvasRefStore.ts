/** Non-reactive canvas getters published by SketchEditor for hooks that need flatten/mask access. */

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
