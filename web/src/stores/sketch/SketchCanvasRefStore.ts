/** Non-reactive canvas getters published by SketchEditor for hooks that need flatten/mask access. */

import { create, type StoreApi, type UseBoundStore } from "zustand";

import type {
  AgentStrokeOutcome,
  AgentStrokeRequest
} from "../../components/sketch/painting/agentStrokes";

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
   * Paints brush/pencil/eraser strokes onto raster layers with the editor's own
   * paint engine, commits the whole batch as one undo entry, and redraws.
   * Returns what each stroke touched, in document-space pixels.
   */
  paintStrokes:
    | ((strokes: readonly AgentStrokeRequest[]) => AgentStrokeOutcome[])
    | null;
  /**
   * Apply a pixel mutation to a layer, commit one undo step, and persist.
   */
  applyLayerRasterOp:
    | ((
        layerId: string,
        label: string,
        mutate: (canvas: HTMLCanvasElement) => void
      ) => void)
    | null;
  /** Crop the whole document to a document-space box. */
  cropDocument:
    | ((x: number, y: number, width: number, height: number) => void)
    | null;
  /** Sample composite (layerId null) or a layer at a document-space point. */
  sampleColor:
    | ((
        layerId: string | null,
        x: number,
        y: number
      ) => { r: number; g: number; b: number; a: number } | null)
    | null;
  /**
   * Clears the active layer — within the active selection if one exists,
   * otherwise the whole layer. Pushes its own history entry.
   */
  clearActiveLayer: (() => void) | null;
  /** Fit the whole artboard into the viewport and re-center it (Ctrl+0). */
  fitViewToScreen: (() => void) | null;

  /**
   * The editor's own layer verbs. Each is the *whole* operation — the runtime
   * bake plus the store rewrite plus the history entry — so a non-React caller
   * (the agent bridge) cannot run half of a two-part destructive op.
   */
  addLayer:
    | ((options?: {
        name?: string;
        type?: "raster" | "mask";
        fillColor?: string | null;
      }) => string)
    | null;
  removeLayer: ((layerId: string) => void) | null;
  duplicateLayer: ((layerId: string) => void) | null;
  /** Merge a layer into the sibling below it; returns the survivor's id. */
  mergeLayerDown: ((upperLayerId: string) => string | null) | null;
  flattenVisible: (() => void) | null;
  /** Resize the artboard, keeping the visible center put. */
  resizeCanvas: ((width: number, height: number) => void) | null;

  setGetters: (getters: {
    flattenToDataUrl: () => string;
    getMaskDataUrl: () => string | null;
    setLayerData: (layerId: string, data: string | null) => void;
    getLayerData?: (layerId: string) => string | null;
    fillLayerWithColor?: (layerId: string, color: string) => void;
    paintStrokes?: (
      strokes: readonly AgentStrokeRequest[]
    ) => AgentStrokeOutcome[];
    applyLayerRasterOp?: (
      layerId: string,
      label: string,
      mutate: (canvas: HTMLCanvasElement) => void
    ) => void;
    cropDocument?: (
      x: number,
      y: number,
      width: number,
      height: number
    ) => void;
    sampleColor?: (
      layerId: string | null,
      x: number,
      y: number
    ) => { r: number; g: number; b: number; a: number } | null;
    clearActiveLayer: () => void;
    fitViewToScreen?: () => void;
    addLayer?: (options?: {
      name?: string;
      type?: "raster" | "mask";
      fillColor?: string | null;
    }) => string;
    removeLayer?: (layerId: string) => void;
    duplicateLayer?: (layerId: string) => void;
    mergeLayerDown?: (upperLayerId: string) => string | null;
    flattenVisible?: () => void;
    resizeCanvas?: (width: number, height: number) => void;
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
    paintStrokes: null,
    applyLayerRasterOp: null,
    cropDocument: null,
    sampleColor: null,
    clearActiveLayer: null,
    fitViewToScreen: null,
    addLayer: null,
    removeLayer: null,
    duplicateLayer: null,
    mergeLayerDown: null,
    flattenVisible: null,
    resizeCanvas: null,

    setGetters: (getters) =>
      set({
        flattenToDataUrl: getters.flattenToDataUrl,
        getMaskDataUrl: getters.getMaskDataUrl,
        setLayerData: getters.setLayerData,
        getLayerData: getters.getLayerData ?? null,
        fillLayerWithColor: getters.fillLayerWithColor ?? null,
        paintStrokes: getters.paintStrokes ?? null,
        applyLayerRasterOp: getters.applyLayerRasterOp ?? null,
        cropDocument: getters.cropDocument ?? null,
        sampleColor: getters.sampleColor ?? null,
        clearActiveLayer: getters.clearActiveLayer,
        fitViewToScreen: getters.fitViewToScreen ?? null,
        addLayer: getters.addLayer ?? null,
        removeLayer: getters.removeLayer ?? null,
        duplicateLayer: getters.duplicateLayer ?? null,
        mergeLayerDown: getters.mergeLayerDown ?? null,
        flattenVisible: getters.flattenVisible ?? null,
        resizeCanvas: getters.resizeCanvas ?? null
      }),

    clearGetters: () =>
      set({
        flattenToDataUrl: null,
        getMaskDataUrl: null,
        setLayerData: null,
        getLayerData: null,
        fillLayerWithColor: null,
        paintStrokes: null,
        applyLayerRasterOp: null,
        cropDocument: null,
        sampleColor: null,
        clearActiveLayer: null,
        fitViewToScreen: null,
        addLayer: null,
        removeLayer: null,
        duplicateLayer: null,
        mergeLayerDown: null,
        flattenVisible: null,
        resizeCanvas: null
      })
  }));

// Context-bound hook re-exported from the instance module.
export { useSketchCanvasRefStore } from "./SketchInstance";
