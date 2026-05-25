/** Non-reactive canvas getters published by SketchEditor for hooks that need flatten/mask access. */

import { create } from "zustand";

interface SketchCanvasRefState {
  /** Flattens all visible layers into a PNG data URL, or returns null. */
  flattenToDataUrl: (() => string | null) | null;
  /** Returns the active mask layer rendered as a PNG data URL, or null. */
  getMaskDataUrl: (() => string | null) | null;
  /** Writes pixel data (PNG data URL) into the given raster layer. */
  setLayerData: ((layerId: string, data: string | null) => void) | null;

  setGetters: (getters: {
    flattenToDataUrl: () => string;
    getMaskDataUrl: () => string | null;
    setLayerData: (layerId: string, data: string | null) => void;
  }) => void;
  clearGetters: () => void;
}

export const useSketchCanvasRefStore = create<SketchCanvasRefState>((set) => ({
  flattenToDataUrl: null,
  getMaskDataUrl: null,
  setLayerData: null,

  setGetters: (getters) =>
    set({
      flattenToDataUrl: getters.flattenToDataUrl,
      getMaskDataUrl: getters.getMaskDataUrl,
      setLayerData: getters.setLayerData
    }),

  clearGetters: () =>
    set({ flattenToDataUrl: null, getMaskDataUrl: null, setLayerData: null })
}));
