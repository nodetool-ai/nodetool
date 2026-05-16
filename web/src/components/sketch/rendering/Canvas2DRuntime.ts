/**
 * Canvas2DRuntime
 *
 * Canvas2D implementation of the SketchRuntime interface.
 * Thin facade that delegates to focused sub-modules under `./canvas2d/`.
 *
 * Accepts an external Map for layer canvas storage so that existing
 * hooks (usePointerHandlers) can continue to access layer canvases
 * directly via ref during the migration.
 */

import type { SketchRuntime, ActiveStrokeInfo, DirtyRect, ResolvedLayerBitmap } from "./types";
import type {
  LayerContentBounds,
  LayerEffect,
  Selection,
  SketchDocument
} from "../types";
import {
  getCanvasRasterBounds,
  setCanvasRasterBounds
} from "../transform/geometry/layerGeometry";

import {
  getDefaultRasterBounds,
  deserializeLayerData,
  getLayerDataFromCanvas
} from "./canvas2d/layerIO";
import { resolveAssetUri } from "../../node/output/hooks";
import {
  combineMasks,
  trimSelectionMask,
  type SelectionCombineOp
} from "../selection";
import { evaluateLayerEffectsCPU } from "./canvas2d/resolvedOutput";
import {
  compositeToDisplayCanvas,
  renderDocumentComposite,
  drawLayerToContext as drawLayerToContextFn,
  type StrokeTempState
} from "./canvas2d/composite";
import {
  reconcileLayerToDocumentSpace as reconcileLayerFn,
  cropLayers as cropLayersFn,
  flipLayer as flipLayerFn,
  rotateLayer180 as rotateLayer180Fn,
  nudgeLayer as nudgeLayerFn,
  applyAdjustments as applyAdjustmentsFn,
  invertLayerColors as invertLayerColorsFn
} from "./canvas2d/reconcile";
import {
  flattenToDataUrl as flattenToDataUrlFn,
  getMaskDataUrl as getMaskDataUrlFn,
  flattenVisible as flattenVisibleFn,
  readbackComposite as readbackCompositeFn,
  clearLayerBySelectionMask as clearLayerBySelectionMaskFn,
  fillLayerBySelectionMask as fillLayerBySelectionMaskFn,
  applyLayerSourceBySelectionMask as applyLayerSourceBySelectionMaskFn,
  trimLayerToBounds as trimLayerToBoundsFn,
  mergeLayerDown as mergeLayerDownFn
} from "./canvas2d/maskAndExport";

export class Canvas2DRuntime implements SketchRuntime {
  /**
   * Off-screen layer canvases keyed by layer ID.
   * This map is shared with the React hooks that created the runtime,
   * so changes here are visible to pointer handlers and vice-versa.
   */
  private layerCanvases: Map<string, HTMLCanvasElement>;

  /** Reusable temp canvas for stroke compositing. */
  private strokeTempCanvas: HTMLCanvasElement | null = null;
  /** CPU-side selection snapshot for tool flows that route commits through the runtime. */
  private currentSelection: Selection | null = null;
  /** Temp canvas for FX-evaluated layer content. */
  private fxTempCanvas: HTMLCanvasElement | null = null;

  /**
   * FX result cache: avoids recomputing effects on every composite when
   * neither the source raster nor effect params have changed.
   * Keyed by layer ID → { serialized effect params, cached result canvas }.
   */
  private fxCache: Map<string, { key: string; canvas: HTMLCanvasElement }> = new Map();

  /**
   * Current zoom level, updated by the compositing hook so that
   * the checkerboard pattern can maintain a constant screen-pixel size.
   */
  zoom = 1;

  /**
   * Generation counter per layer for setLayerData. Each call increments the
   * generation; img.onload checks it and bails out if superseded, preventing
   * a stale (e.g. pre-stroke) image from overwriting live-painted pixels.
   */
  private layerLoadGenerations: Map<string, number> = new Map();

  /** Dedicated readback canvas for readbackComposite. */
  private readbackCanvas: HTMLCanvasElement | null = null;

  constructor(layerCanvases?: Map<string, HTMLCanvasElement>) {
    this.layerCanvases = layerCanvases ?? new Map();
  }

  // ─── Bound callbacks for sub-module injection ──────────────────────────

  /**
   * Bound wrapper for evaluateLayerEffects so sub-module functions receive a
   * stable callback without needing to manage `this` binding themselves.
   */
  private readonly boundEvaluateLayerEffects = (
    layerId: string,
    source: HTMLCanvasElement,
    effects: LayerEffect[]
  ): ResolvedLayerBitmap => this.evaluateLayerEffects(layerId, source, effects);

  /** Bound wrapper for renderDocumentCompositeToContext. */
  private readonly boundRenderDocComposite = (
    ctx: CanvasRenderingContext2D,
    doc: SketchDocument,
    isolatedLayerId: string | null | undefined,
    activeStroke: ActiveStrokeInfo | null
  ): void => {
    this.renderDocumentCompositeToContext(ctx, doc, isolatedLayerId, activeStroke);
  };

  /** Bound wrapper for drawLayerToContext. */
  private readonly boundDrawLayerToContext = (
    ctx: CanvasRenderingContext2D,
    doc: SketchDocument,
    layerId: string,
    includeOpacity?: boolean
  ): void => {
    drawLayerToContextFn(
      ctx,
      doc,
      layerId,
      this.layerCanvases,
      this.boundEvaluateLayerEffects,
      includeOpacity
    );
  };

  // ─── Layer canvas management ─────────────────────────────────────────

  getOrCreateLayerCanvas(
    layerId: string,
    width: number,
    height: number
  ): HTMLCanvasElement {
    let canvas = this.layerCanvases.get(layerId);
    if (!canvas) {
      canvas = window.document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      // Acquire the 2D context immediately so the canvas always has an active
      // rendering context. copyExternalImageToTexture (used by WebGPURuntime)
      // requires the source canvas to have been initialized with a context.
      canvas.getContext("2d", { willReadFrequently: true });
      setCanvasRasterBounds(canvas, { x: 0, y: 0, width, height });
      this.layerCanvases.set(layerId, canvas);
    }
    return canvas;
  }

  getLayerCanvas(layerId: string): HTMLCanvasElement | undefined {
    return this.layerCanvases.get(layerId);
  }

  deleteLayerCanvas(layerId: string): void {
    this.layerCanvases.delete(layerId);
  }

  invalidateLayer(layerId: string): void {
    // Canvas2D reads directly from the authoritative layer canvases, so
    // there is no extra invalidation work to do here — except clearing
    // the FX result cache so effects are recomputed from the new source.
    this.fxCache.delete(layerId);
  }

  // ─── Compositing ─────────────────────────────────────────────────────

  compositeToDisplay(
    targetCanvas: HTMLCanvasElement,
    doc: SketchDocument,
    isolatedLayerId: string | null | undefined,
    activeStroke: ActiveStrokeInfo | null,
    dirtyRect?: DirtyRect | null,
    viewportZoom?: number
  ): void {
    if (
      viewportZoom != null &&
      Number.isFinite(viewportZoom) &&
      viewportZoom > 0
    ) {
      this.zoom = viewportZoom;
    }
    const nextState = compositeToDisplayCanvas(
      targetCanvas,
      doc,
      isolatedLayerId,
      activeStroke,
      this.zoom,
      this.layerCanvases,
      this.boundEvaluateLayerEffects,
      this.getStrokeTempState(),
      dirtyRect
    );
    this.applyStrokeTempState(nextState);
  }

  // ─── Internal compositing helpers ────────────────────────────────────

  private getStrokeTempState(): StrokeTempState {
    return { strokeTempCanvas: this.strokeTempCanvas };
  }

  private applyStrokeTempState(state: StrokeTempState): void {
    this.strokeTempCanvas = state.strokeTempCanvas;
  }

  /**
   * Render document pixels only: visibility, opacity, blend modes, transforms,
   * effects, and optional active-stroke preview. This excludes display-only
   * chrome such as the checkerboard background.
   */
  private renderDocumentCompositeToContext(
    ctx: CanvasRenderingContext2D,
    doc: SketchDocument,
    isolatedLayerId: string | null | undefined,
    activeStroke: ActiveStrokeInfo | null
  ): void {
    const nextState = renderDocumentComposite(
      ctx,
      doc,
      isolatedLayerId,
      activeStroke,
      this.layerCanvases,
      this.boundEvaluateLayerEffects,
      this.getStrokeTempState()
    );
    this.applyStrokeTempState(nextState);
  }

  // ─── Readback / export ───────────────────────────────────────────────

  getLayerData(layerId: string): string | null {
    const canvas = this.layerCanvases.get(layerId);
    if (!canvas) {
      return null;
    }
    return getLayerDataFromCanvas(canvas);
  }

  snapshotLayerCanvas(layerId: string): HTMLCanvasElement | null {
    const source = this.layerCanvases.get(layerId);
    if (!source) {
      return null;
    }
    const snapshot = window.document.createElement("canvas");
    snapshot.width = source.width;
    snapshot.height = source.height;
    const rasterBounds = getCanvasRasterBounds(source);
    if (rasterBounds) {
      setCanvasRasterBounds(snapshot, rasterBounds);
    }
    const ctx = snapshot.getContext("2d");
    if (ctx) {
      ctx.drawImage(source, 0, 0);
    }
    return snapshot;
  }

  flattenToDataUrl(doc: SketchDocument): string {
    return flattenToDataUrlFn(doc, this.boundRenderDocComposite);
  }

  getMaskDataUrl(doc: SketchDocument): string | null {
    return getMaskDataUrlFn(doc, this.boundDrawLayerToContext);
  }

  flattenVisible(doc: SketchDocument): string {
    return flattenVisibleFn(doc, this.boundRenderDocComposite);
  }

  // ─── Layer operations ────────────────────────────────────────────────

  setLayerData(
    layerId: string,
    data: string | null,
    bounds: LayerContentBounds,
    onComplete?: () => void
  ): void {
    const defaultBounds = getDefaultRasterBounds(bounds);
    const decoded = deserializeLayerData(data, defaultBounds);
    const desiredWidth = decoded.bounds.width;
    const desiredHeight = decoded.bounds.height;

    if (!decoded.image) {
      // No image: resize and clear immediately (canvas is already blank).
      const canvas = this.getOrCreateLayerCanvas(
        layerId,
        desiredWidth,
        desiredHeight
      );
      if (canvas.width !== desiredWidth || canvas.height !== desiredHeight) {
        canvas.width = desiredWidth;
        canvas.height = desiredHeight;
      } else {
        canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      }
      setCanvasRasterBounds(canvas, decoded.bounds);
      onComplete?.();
      return;
    }

    // Bump the generation so any in-flight load from a prior call
    // knows it has been superseded and should not overwrite the canvas.
    const gen = (this.layerLoadGenerations.get(layerId) ?? 0) + 1;
    this.layerLoadGenerations.set(layerId, gen);

    /** Shared finalization: resize canvas, draw the decoded source, and notify. */
    const finalize = (source: ImageBitmap | HTMLImageElement) => {
      const isImageBitmap =
        typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap;
      // Bail out if a newer setLayerData call has already taken over.
      if (this.layerLoadGenerations.get(layerId) !== gen) {
        if (isImageBitmap) {
          (source as ImageBitmap).close();
        }
        return;
      }
      const canvas = this.getOrCreateLayerCanvas(
        layerId,
        desiredWidth,
        desiredHeight
      );
      if (canvas.width !== desiredWidth || canvas.height !== desiredHeight) {
        // Assigning width/height also clears the canvas; no clearRect needed.
        canvas.width = desiredWidth;
        canvas.height = desiredHeight;
      } else {
        canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      }
      setCanvasRasterBounds(canvas, decoded.bounds);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(source, 0, 0);
      }
      if (isImageBitmap) {
        (source as ImageBitmap).close();
      }
      onComplete?.();
    };

    // For HTTP(S) URLs, use fetch + createImageBitmap for off-main-thread
    // decoding. This reduces main-thread blocking during editor startup when
    // multiple imageReference layers load simultaneously.
    const imageSrc = resolveAssetUri(decoded.image);
    if (
      typeof createImageBitmap === "function" &&
      (imageSrc.startsWith("http://") ||
        imageSrc.startsWith("https://") ||
        imageSrc.startsWith("/"))
    ) {
      fetch(imageSrc)
        .then((resp) => {
          if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
          }
          return resp.blob();
        })
        .then((blob) => createImageBitmap(blob))
        .then((bitmap) => finalize(bitmap))
        .catch((err) => {
          // Fallback to Image element on fetch/decode failure
          if (process.env.NODE_ENV === "development") {
            console.warn("[Canvas2DRuntime] fetch/createImageBitmap failed, falling back to Image element:", err);
          }
          this.loadWithImageElement(imageSrc, gen, layerId, finalize);
        });
      return;
    }

    // Defer the resize and clear until the image is ready to draw.
    // This keeps the live canvas content visible between now and onload,
    // preventing a blank-canvas flash during the encode→decode round-trip.
    this.loadWithImageElement(imageSrc, gen, layerId, finalize);
  }

  /**
   * Fallback image loading using an HTMLImageElement.
   * Used for data URLs and as a fallback when fetch/createImageBitmap fails.
   */
  private loadWithImageElement(
    src: string,
    gen: number,
    layerId: string,
    finalize: (source: HTMLImageElement) => void
  ): void {
    const img = new Image();
    img.onload = () => {
      if (this.layerLoadGenerations.get(layerId) !== gen) {
        return;
      }
      finalize(img);
    };
    img.src = src;
  }

  restoreLayerCanvas(layerId: string, source: HTMLCanvasElement): void {
    const canvas = this.getOrCreateLayerCanvas(
      layerId,
      source.width,
      source.height
    );
    if (canvas.width !== source.width || canvas.height !== source.height) {
      canvas.width = source.width;
      canvas.height = source.height;
    }
    setCanvasRasterBounds(
      canvas,
      getCanvasRasterBounds(source) ?? {
        x: 0,
        y: 0,
        width: source.width,
        height: source.height
      }
    );
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0);
  }

  clearLayer(layerId: string): void {
    const canvas = this.layerCanvases.get(layerId);
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  clearLayerRect(
    layerId: string,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    const canvas = this.layerCanvases.get(layerId);
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(x, y, width, height);
    }
  }

  flipLayer(layerId: string, direction: "horizontal" | "vertical"): void {
    flipLayerFn(this.layerCanvases, layerId, direction);
  }

  rotateLayer180(layerId: string): void {
    rotateLayer180Fn(this.layerCanvases, layerId);
  }

  fillLayerWithColor(layerId: string, color: string): void {
    const canvas = this.layerCanvases.get(layerId);
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.save();
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  fillLayerRect(
    layerId: string,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string
  ): void {
    const canvas = this.layerCanvases.get(layerId);
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.save();
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width, height);
    ctx.restore();
  }

  clearLayerBySelectionMask(
    layerId: string,
    offsetX: number,
    offsetY: number,
    mask: Selection
  ): void {
    clearLayerBySelectionMaskFn(this.layerCanvases, layerId, offsetX, offsetY, mask);
  }

  fillLayerBySelectionMask(
    layerId: string,
    offsetX: number,
    offsetY: number,
    mask: Selection,
    color: string
  ): void {
    fillLayerBySelectionMaskFn(this.layerCanvases, layerId, offsetX, offsetY, mask, color);
  }

  applyLayerSourceBySelectionMask(
    layerId: string,
    offsetX: number,
    offsetY: number,
    mask: Selection,
    source: CanvasImageSource,
    compositeOp: GlobalCompositeOperation = "source-over"
  ): void {
    applyLayerSourceBySelectionMaskFn(
      this.layerCanvases,
      layerId,
      offsetX,
      offsetY,
      mask,
      source,
      compositeOp
    );
  }

  nudgeLayer(layerId: string, dx: number, dy: number): void {
    nudgeLayerFn(this.layerCanvases, layerId, dx, dy);
  }

  trimLayerToBounds(
    layerId: string
  ): { data: string; bounds: LayerContentBounds } | null {
    return trimLayerToBoundsFn(this.layerCanvases, layerId);
  }

  mergeLayerDown(
    upperLayerId: string,
    lowerLayerId: string,
    doc: SketchDocument
  ): string | undefined {
    return mergeLayerDownFn(
      this.layerCanvases,
      upperLayerId,
      lowerLayerId,
      doc,
      this.boundDrawLayerToContext
    );
  }

  cropLayers(x: number, y: number, width: number, height: number): void {
    cropLayersFn(this.layerCanvases, x, y, width, height);
  }

  applyAdjustments(
    doc: SketchDocument,
    brightness: number,
    contrast: number,
    saturation: number
  ): void {
    applyAdjustmentsFn(doc, this.layerCanvases, brightness, contrast, saturation);
  }

  invertLayerColors(doc: SketchDocument, selection?: { width: number; height: number; data: Uint8ClampedArray; originX?: number; originY?: number } | null): void {
    invertLayerColorsFn(doc, this.layerCanvases, selection);
  }

  reconcileLayerToDocumentSpace(
    layerId: string,
    doc: SketchDocument
  ): string | null {
    return reconcileLayerFn(layerId, doc, this.layerCanvases);
  }

  // ─── Effects evaluation ──────────────────────────────────────────────

  evaluateLayerEffects(
    layerId: string,
    source: HTMLCanvasElement,
    effects: LayerEffect[]
  ): ResolvedLayerBitmap {
    const { result, fxTempCanvas } = evaluateLayerEffectsCPU(
      layerId,
      source,
      effects,
      this.fxCache,
      this.fxTempCanvas
    );
    this.fxTempCanvas = fxTempCanvas;
    return result;
  }

  getResolvedLayerOutput(
    doc: SketchDocument,
    layerId: string
  ): ResolvedLayerBitmap | null {
    const layer = doc.layers.find((l) => l.id === layerId);
    if (!layer) {
      return null;
    }
    const canvas = this.layerCanvases.get(layerId);
    if (!canvas) {
      return null;
    }
    return this.evaluateLayerEffects(layerId, canvas, layer.effects);
  }

  // ─── Composite readback ─────────────────────────────────────────────

  readbackComposite(
    doc: SketchDocument,
    isolatedLayerId: string | null | undefined,
    activeStroke: ActiveStrokeInfo | null
  ): ImageData | null {
    const { imageData, readbackCanvas } = readbackCompositeFn(
      doc,
      isolatedLayerId,
      activeStroke,
      this.boundRenderDocComposite,
      this.readbackCanvas
    );
    this.readbackCanvas = readbackCanvas;
    return imageData;
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────

  setSelection(sel: Selection | null): void {
    this.currentSelection = sel;
  }

  applySelectionOverlay(
    overlay: Selection,
    op: SelectionCombineOp
  ): Selection | null {
    const normalizedOverlay = trimSelectionMask(overlay);
    if (!normalizedOverlay) {
      return this.currentSelection;
    }
    const base = op === "replace" ? null : this.currentSelection;
    const nextSelection = trimSelectionMask(combineMasks(base, normalizedOverlay, op));
    this.currentSelection = nextSelection;
    return nextSelection;
  }

  dispose(): void {
    this.layerCanvases.clear();
    this.strokeTempCanvas = null;
    this.fxTempCanvas = null;
    this.fxCache.clear();
    this.readbackCanvas = null;
    this.currentSelection = null;
  }
}
