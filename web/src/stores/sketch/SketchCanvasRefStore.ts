/** Non-reactive canvas getters published by SketchEditor for hooks that need flatten/mask access. */

import { create } from "zustand";

interface SketchCanvasRefState {
  /** Flattens all visible layers into a PNG data URL, or returns null. */
  flattenToDataUrl: (() => string | null) | null;
  /** Returns the active mask layer rendered as a PNG data URL, or null. */
  getMaskDataUrl: (() => string | null) | null;
  /** Writes pixel data (PNG data URL) into the given raster layer. */
  setLayerData: ((layerId: string, data: string | null) => void) | null;
  /**
   * Clears the active layer — within the active selection if one exists,
   * otherwise the whole layer. Pushes its own history entry.
   */
  clearActiveLayer: (() => void) | null;

  setGetters: (getters: {
    flattenToDataUrl: () => string;
    getMaskDataUrl: () => string | null;
    setLayerData: (layerId: string, data: string | null) => void;
    clearActiveLayer: () => void;
  }) => void;
  clearGetters: () => void;
}

export const useSketchCanvasRefStore = create<SketchCanvasRefState>((set) => ({
  flattenToDataUrl: null,
  getMaskDataUrl: null,
  setLayerData: null,
  clearActiveLayer: null,

  setGetters: (getters) =>
    set({
      flattenToDataUrl: getters.flattenToDataUrl,
      getMaskDataUrl: getters.getMaskDataUrl,
      setLayerData: getters.setLayerData,
      clearActiveLayer: getters.clearActiveLayer
    }),

  clearGetters: () =>
    set({
      flattenToDataUrl: null,
      getMaskDataUrl: null,
      setLayerData: null,
      clearActiveLayer: null
    })
}));
