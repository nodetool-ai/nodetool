/**
 * SketchRuntime interface
 *
 * Abstraction layer between the sketch editor and the rendering backend.
 * Phase 1 provides a Canvas2D implementation; later phases will add WebGPU.
 *
 * The runtime owns layer storage, compositing, and readback.
 * It does NOT own the display canvas DOM element (React manages that).
 */

import type { LayerContentBounds, SketchDocument } from "../types";

// ─── Dirty rect for partial compositing ──────────────────────────────────────

export interface DirtyRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ─── Active stroke buffer ────────────────────────────────────────────────────

export interface ActiveStrokeInfo {
  layerId: string;
  buffer: HTMLCanvasElement;
  opacity: number;
  compositeOp: GlobalCompositeOperation;
}

// ─── Runtime interface ───────────────────────────────────────────────────────

export interface SketchRuntime {
  // ─── Layer canvas management ─────────────────────────────────────────
  /** Get or create an off-screen canvas for a layer. */
  getOrCreateLayerCanvas(
    layerId: string,
    width: number,
    height: number
  ): HTMLCanvasElement;

  /** Get the off-screen canvas for a layer, or undefined if it doesn't exist. */
  getLayerCanvas(layerId: string): HTMLCanvasElement | undefined;

  /** Delete the off-screen canvas for a layer. */
  deleteLayerCanvas(layerId: string): void;

  /** Notify the runtime that CPU-side layer pixels changed. */
  invalidateLayer(layerId: string): void;

  // ─── Compositing ─────────────────────────────────────────────────────
  /**
   * Composite all visible layers onto the target canvas.
   * When `dirtyRect` is provided, only that region is repainted.
   * `hiddenLayerId` lets the caller suppress one layer from the base pass so a
   * separate overlay can render that layer's live preview without double-drawing.
   */
  compositeToDisplay(
    targetCanvas: HTMLCanvasElement,
    doc: SketchDocument,
    isolatedLayerId: string | null | undefined,
    activeStroke: ActiveStrokeInfo | null,
    dirtyRect?: DirtyRect | null,
    hiddenLayerId?: string | null
  ): void;

  // ─── Readback / export ───────────────────────────────────────────────
  /** Read a layer canvas back as a data URL. */
  getLayerData(layerId: string): string | null;

  /** Clone a layer canvas for undo snapshots. */
  snapshotLayerCanvas(layerId: string): HTMLCanvasElement | null;

  /** Flatten all visible non-mask layers onto a background and return a data URL. */
  flattenToDataUrl(doc: SketchDocument): string;

  /** Export the mask layer as a data URL. */
  getMaskDataUrl(doc: SketchDocument): string | null;

  /** Flatten all visible layers (including mask) and return a data URL. */
  flattenVisible(doc: SketchDocument): string;

  // ─── Layer operations ────────────────────────────────────────────────
  /** Load a data URL (or clear) into a layer canvas. Calls `onComplete` after the image loads. */
  setLayerData(
    layerId: string,
    data: string | null,
    bounds: LayerContentBounds,
    onComplete?: () => void
  ): void;

  /** Overwrite a layer canvas from a source canvas (used by undo/redo). */
  restoreLayerCanvas(layerId: string, source: HTMLCanvasElement): void;

  /** Clear an entire layer canvas. */
  clearLayer(layerId: string): void;

  /** Clear a rectangular region of a layer canvas. */
  clearLayerRect(
    layerId: string,
    x: number,
    y: number,
    width: number,
    height: number
  ): void;

  /** Flip a layer canvas horizontally or vertically. */
  flipLayer(layerId: string, direction: "horizontal" | "vertical"): void;

  /** Fill an entire layer canvas with a solid color. */
  fillLayerWithColor(layerId: string, color: string): void;

  /** Fill a rectangular region of a layer canvas with a solid color. */
  fillLayerRect(
    layerId: string,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string
  ): void;

  /** Translate layer pixel content by (dx, dy). */
  nudgeLayer(layerId: string, dx: number, dy: number): void;

  /**
   * Shrink a layer raster to its non-transparent pixel bounds while preserving
   * its document-space placement via updated raster bounds metadata.
   */
  trimLayerToBounds(
    layerId: string
  ): { data: string; bounds: LayerContentBounds } | null;

  /** Merge the upper layer into the lower layer and return the merged data URL. */
  mergeLayerDown(
    upperLayerId: string,
    lowerLayerId: string,
    doc: SketchDocument
  ): string | undefined;

  /** Crop all layer canvases to the given rectangle. */
  cropLayers(x: number, y: number, width: number, height: number): void;

  /** Apply brightness/contrast/saturation adjustments to the active layer. */
  applyAdjustments(
    doc: SketchDocument,
    brightness: number,
    contrast: number,
    saturation: number
  ): void;

  /**
   * Bake the layer transform offset into the pixel data so that
   * (transform.x, transform.y) can be reset to (0, 0).
   * Returns the reconciled data URL.
   */
  reconcileLayerToDocumentSpace(
    layerId: string,
    doc: SketchDocument
  ): string | null;

  // ─── Lifecycle ───────────────────────────────────────────────────────
  /** Release all resources held by the runtime. */
  dispose(): void;
}
