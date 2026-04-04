/**
 * SketchRuntime interface
 *
 * Abstraction layer between the sketch editor and the rendering backend.
 * Phase 1 provides a Canvas2D implementation; later phases will add WebGPU.
 *
 * The runtime owns layer storage, compositing, and readback.
 * It does NOT own the display canvas DOM element (React manages that).
 */

import type { LayerContentBounds, LayerEffect, Selection, SketchDocument } from "../types";

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
  /**
   * When set, live compositing applies the same alpha modulation as commit-time
   * `applySelectionMaskAlpha` (feathered selection edges) without mutating `buffer`.
   */
  selectionMaskForPreview?: {
    mask: Selection;
    offsetX: number;
    offsetY: number;
  } | null;
  /**
   * When set, the stroke buffer has not yet been merged onto the layer canvas.
   * Execute this callback at the start of the next rAF (before compositing) to
   * commit the merge without blocking the pointer-up handler.
   */
  pendingCommit?: (() => void) | null;
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
   */
  compositeToDisplay(
    targetCanvas: HTMLCanvasElement,
    doc: SketchDocument,
    isolatedLayerId: string | null | undefined,
    activeStroke: ActiveStrokeInfo | null,
    dirtyRect?: DirtyRect | null
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

  /** Clear pixels under the document-space selection mask (layer offset in doc space). */
  clearLayerBySelectionMask(
    layerId: string,
    offsetX: number,
    offsetY: number,
    mask: Selection
  ): void;

  /** Fill pixels under the selection mask with a solid color. */
  fillLayerBySelectionMask(
    layerId: string,
    offsetX: number,
    offsetY: number,
    mask: Selection,
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

  // ─── Effects evaluation ──────────────────────────────────────────────
  /**
   * Apply non-destructive effects to a layer's raster before compositing.
   * Returns `source` unchanged if `effects` is empty or all disabled.
   *
   * This method is the single integration point for the FX pipeline —
   * all output paths (main canvas, thumbnails, flatten/export, solo preview)
   * must call it. Bypassing it is a bug.
   */
  evaluateLayerEffects(
    layerId: string,
    source: HTMLCanvasElement,
    effects: LayerEffect[]
  ): HTMLCanvasElement;

  // ─── Composite readback ─────────────────────────────────────────────
  /**
   * Composite all visible layers (with effects, opacity, blend modes) and
   * return the result as ImageData at document resolution.
   *
   * This is the single entry point for any tool or subsystem that needs to
   * sample the composited document (eyedropper, magic wand, selection
   * sampling, clipboard readback). Callers must not create their own
   * Canvas2DRuntime or duplicate compositing logic.
   *
   * @param doc - The current document state.
   * @param isolatedLayerId - If set, only this layer is composited (solo/isolate preview).
   * @param activeStroke - Optional in-progress stroke for live preview.
   * @returns ImageData at document resolution, or null if readback fails.
   */
  readbackComposite(
    doc: SketchDocument,
    isolatedLayerId: string | null | undefined,
    activeStroke: ActiveStrokeInfo | null
  ): ImageData | null;

  // ─── Lifecycle ───────────────────────────────────────────────────────
  /** Release all resources held by the runtime. */
  dispose(): void;
}
