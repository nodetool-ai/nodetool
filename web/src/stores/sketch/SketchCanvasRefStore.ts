/** Non-reactive canvas getters published by SketchEditor for hooks that need flatten/mask access. */

import { create, type StoreApi, type UseBoundStore } from "zustand";

export interface SketchCanvasRefState {
  /** Flattens all visible layers into a PNG data URL, or returns null. */
  flattenToDataUrl: (() => string | null) | null;
  /** Returns the active mask layer rendered as a PNG data URL, or null. */
  getMaskDataUrl: (() => string | null) | null;
  /** Writes pixel data (PNG data URL) into the given raster layer. */
  setLayerData: ((layerId: string, data: string | null) => void) | null;
  /** Reads a layer's pixels as a serialized raster payload / PNG data URL. */
  getLayerData: ((layerId: string) => string | null) | null;
  /** Fills the given raster layer with a solid color (respecting alpha lock). */
  fillLayerWithColor: ((layerId: string, color: string) => void) | null;
  /**
   * Clears the active layer — within the active selection if one exists,
   * otherwise the whole layer. Pushes its own history entry.
   */
  clearActiveLayer: (() => void) | null;

  setGetters: (getters: {
    flattenToDataUrl: () => string;
    getMaskDataUrl: () => string | null;
    setLayerData: (layerId: string, data: string | null) => void;
    getLayerData?: (layerId: string) => string | null;
    fillLayerWithColor?: (layerId: string, color: string) => void;
    clearActiveLayer: () => void;
  }) => void;
  clearGetters: () => void;
}

export type SketchCanvasRefStoreApi = UseBoundStore<
  StoreApi<SketchCanvasRefState>
>;

/** Create an isolated canvas-ref store for a single sketch-editor instance. */
export const createSketchCanvasRefStore = (): SketchCanvasRefStoreApi =>
  create<SketchCanvasRefState>((set) => ({
    flattenToDataUrl: null,
    getMaskDataUrl: null,
    setLayerData: null,
    getLayerData: null,
    fillLayerWithColor: null,
    clearActiveLayer: null,

    setGetters: (getters) =>
      set({
        flattenToDataUrl: getters.flattenToDataUrl,
        getMaskDataUrl: getters.getMaskDataUrl,
        setLayerData: getters.setLayerData,
        getLayerData: getters.getLayerData ?? null,
        fillLayerWithColor: getters.fillLayerWithColor ?? null,
        clearActiveLayer: getters.clearActiveLayer
      }),

    clearGetters: () =>
      set({
        flattenToDataUrl: null,
        getMaskDataUrl: null,
        setLayerData: null,
        getLayerData: null,
        fillLayerWithColor: null,
        clearActiveLayer: null
      })
  }));

// Context-bound hook re-exported from the instance module.
export { useSketchCanvasRefStore } from "./SketchInstance";
