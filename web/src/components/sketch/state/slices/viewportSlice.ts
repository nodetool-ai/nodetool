/**
 * Viewport Slice — zoom, pan, viewport constants.
 */

import type { StateCreator } from "zustand";
import type { SketchStore } from "../useSketchStore";
import type { Point } from "../../types";

/** Sketch viewport zoom limits (1 = 100%). */
export const SKETCH_ZOOM_MIN = 0.1;
export const SKETCH_ZOOM_MAX = 56;

export interface ViewportSlice {
  zoom: number;
  pan: Point;
  setZoom: (zoom: number) => void;
  setPan: (pan: Point) => void;
}

export const createViewportSlice: StateCreator<
  SketchStore,
  [],
  [],
  ViewportSlice
> = (set) => ({
  zoom: 1,
  pan: { x: 0, y: 0 },

  setZoom: (zoom: number) =>
    set({
      zoom: Math.max(SKETCH_ZOOM_MIN, Math.min(SKETCH_ZOOM_MAX, zoom))
    }),
  setPan: (pan: Point) => set({ pan })
});
