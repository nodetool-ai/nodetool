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

/**
 * Region of the document canvas that needs recompositing.
 *
 * **Backend behavior:**
 * - **Canvas2D**: When provided, compositing clips to this rect + 2px padding
 *   for a partial redraw. Falls back to full composite when `null`.
 * - **WebGPU**: Always performs full compositing — the `dirtyRect` parameter is
 *   accepted for interface compatibility but ignored. GPU compositing via
 *   ping-pong passes is fast enough that partial redraws add complexity without
 *   measurable benefit.
 *
 * This is an intentional design decision (Phase 3A): WebGPU dirty-region redraw
 * is not implemented because full GPU composites are already fast and partial
 * redraws would require per-pass clipping or viewport scissors that complicate
 * the blend-shader pipeline.
 */
export interface DirtyRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ─── Resolved layer output ───────────────────────────────────────────────────

/**
 * The resolved output of a layer after non-destructive effects have been
 * evaluated. Carries working-space and dynamic-range metadata so downstream
 * consumers (compositing, export, thumbnails) can make informed decisions.
 *
 * **Phase 3C contract:**
 * - `workingSpace` declares the color space of the surface pixels.
 *   `"srgb"` means standard gamma-encoded sRGB (current default for all paths).
 *   `"linear-srgb"` means linear-light sRGB — required for physically correct
 *   blending, tonemapping, and bloom.
 * - `dynamicRange` declares whether pixel values may exceed [0, 1].
 *   `"sdr"` means values are clamped to 8-bit [0, 255] per channel.
 *   `"hdr"` means the surface may contain values outside [0, 1] (e.g. via
 *   `rgba16float` textures) that require tonemapping before display.
 *
 * **Current state:** All paths return `{ workingSpace: "srgb", dynamicRange: "sdr" }`.
 * The metadata exists so future shader-backed effects (curves, tonemap, bloom)
 * can declare when they produce linear-light or HDR intermediates without
 * changing the interface.
 */
export type WorkingSpace = "srgb" | "linear-srgb";
export type DynamicRange = "sdr" | "hdr";

export interface ResolvedLayerBitmap {
  /** The rasterized surface after effect evaluation. */
  surface: HTMLCanvasElement;
  /** Color space of the pixel data in `surface`. */
  workingSpace: WorkingSpace;
  /** Whether pixel values may exceed the standard [0, 1] range. */
  dynamicRange: DynamicRange;
}

// ─── Active stroke buffer ────────────────────────────────────────────────────

export interface ActiveStrokeInfo {
  layerId: string;
  buffer: HTMLCanvasElement;
  opacity: number;
  compositeOp: GlobalCompositeOperation;
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
   * Notify the runtime of the current selection mask. WebGPU uploads the
   * `r8unorm` mask texture on the next composite when `data` identity changes.
   * Canvas2D ignores this call — selection masking is handled per-tool on CPU.
   */
  setSelection(sel: Selection | null): void;

  /**
   * GPU-accelerated selection refine: feather the current mask in-place on
   * the GPU (separable box blur ×3 ≈ Gaussian) and return the resulting
   * Selection. Asynchronous because the result is read back through a
   * mappable buffer (`GPUBuffer.mapAsync`). Returns `null` if the runtime
   * has no active selection or cannot service the request (e.g. device lost).
   *
   * Implementations (WebGPU only at present) must keep the GPU-resident
   * mask texture in lock-step with the returned `Selection` so callers can
   * commit it via `setSelectionAfterGpuOp` without triggering an immediate
   * CPU→GPU re-upload on the next composite.
   *
   * Optional on the interface so Canvas2D can omit the implementation;
   * callers must feature-detect before invoking.
   */
  featherSelectionGpu?(radius: number): Promise<Selection | null>;

  /**
   * GPU expand: dilate the current selection mask by `radius` pixels (a
   * separable (2r+1)-tap max filter on each axis). Async because the
   * post-pass mask is read back through a mappable buffer. Returns `null`
   * when there is no active selection or the runtime cannot service the
   * request. See `featherSelectionGpu` for the full semantics.
   */
  expandSelectionGpu?(radius: number): Promise<Selection | null>;

  /**
   * GPU contract: erode the current selection mask by `radius` pixels (a
   * separable (2r+1)-tap min filter on each axis). Async because the
   * post-pass mask is read back through a mappable buffer. Returns `null`
   * when there is no active selection or the runtime cannot service the
   * request. See `featherSelectionGpu` for the full semantics.
   */
  contractSelectionGpu?(radius: number): Promise<Selection | null>;

  /**
   * GPU smooth: feather (3× separable box blur) followed by a hard
   * threshold @ 128 to snap edges back to 0/255. Async because it
   * composes `featherSelectionGpu` under the hood. Returns `null`
   * when there is no active selection or the runtime cannot service
   * the request.
   */
  smoothSelectionGpu?(strength: number): Promise<Selection | null>;

  /**
   * Adopt a Selection produced by a GPU refine op. Equivalent to
   * `setSelection` except it suppresses the next CPU→GPU upload because
   * the runtime's mask texture already holds the post-op pixels.
   *
   * Callers must always pair this with a store update so React state stays
   * in sync. The follow-up `setSelection` triggered by that update will be
   * a no-op because the `Selection.data` reference matches what was just
   * adopted here.
   */
  setSelectionAfterGpuOp?(sel: Selection | null): void;

  /**
   * Composite all visible layers onto the target canvas.
   *
   * @param dirtyRect - Optional region for partial recompositing.
   *   **Canvas2D**: clips to this rect + padding for a fast partial redraw.
   *   **WebGPU**: ignored — always performs full compositing (see `DirtyRect` docs).
   */
  compositeToDisplay(
    targetCanvas: HTMLCanvasElement,
    doc: SketchDocument,
    isolatedLayerId: string | null | undefined,
    activeStroke: ActiveStrokeInfo | null,
    dirtyRect?: DirtyRect | null,
    /** CSS viewport zoom (same value as canvas `scale(zoom)`). When set, runtimes apply it for this frame so rAF compositing cannot use a stale `runtime.zoom` from an earlier render. */
    viewportZoom?: number
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

  /** Rotate a layer canvas 180° in-place (dimensions preserved). */
  rotateLayer180(layerId: string): void;

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

  /** Invert all color channels of the active layer while preserving alpha.
   *  When a selection mask is provided, only selected pixels are inverted. */
  invertLayerColors(doc: SketchDocument, selection?: { width: number; height: number; data: Uint8ClampedArray; originX?: number; originY?: number } | null): void;

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
   * Returns a `ResolvedLayerBitmap` containing the output surface and its
   * working-space / dynamic-range metadata.
   *
   * When `effects` is empty or all disabled, returns the unmodified `source`
   * wrapped in `{ surface: source, workingSpace: "srgb", dynamicRange: "sdr" }`.
   *
   * This method is the single integration point for the FX pipeline —
   * all output paths (main canvas, thumbnails, flatten/export, solo preview)
   * must call it. Bypassing it is a bug.
   *
   * **Current implementation (Phase 3C — temporary SDR plumbing):**
   * Simple SDR adjustments (brightness/contrast, hue/saturation, exposure) are
   * evaluated via CSS `ctx.filter` on a Canvas2D scratch surface. This is
   * adequate for SDR editing but does **not** define the long-term semantics
   * for curves, true exposure, tonemapping, or bloom — those require
   * shader-backed evaluation with explicit working-space handling.
   *
   * Advanced effects (`curves`, `tonemap`, `bloom`) throw in development to
   * prevent silent correctness degradation.
   */
  evaluateLayerEffects(
    layerId: string,
    source: HTMLCanvasElement,
    effects: LayerEffect[]
  ): ResolvedLayerBitmap;

  // ─── Resolved layer output ───────────────────────────────────────────
  /**
   * Single entry point for "raw layer canvas → resolved surface".
   *
   * Returns the resolved output for a layer: evaluates non-destructive
   * effects when present, or returns the unmodified layer canvas otherwise.
   * This is the contract that display, export, readback, and helper flows
   * should use instead of choosing ad hoc between `layer.data`, the raw
   * layer canvas, and effected output.
   *
   * Layer-panel thumbnail behavior is out of scope for Phase 1 and remains
   * a later explicit product decision.
   *
   * @param doc      Current document.
   * @param layerId  Layer to resolve.
   * @returns The resolved surface (with effects applied if any), or null
   *          when the layer or its canvas does not exist.
   */
  getResolvedLayerOutput(
    doc: SketchDocument,
    layerId: string
  ): ResolvedLayerBitmap | null;

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
   * The returned pixels are document content only. Display-only decorations
   * such as the checkerboard background must be excluded.
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
