/**
 * Canvas2DRuntime
 *
 * Canvas2D implementation of the SketchRuntime interface.
 * Extracts all Canvas2D compositing and layer operations from the
 * former useCompositing / useCanvasImperativeHandle hooks into a
 * framework-agnostic class.
 *
 * Accepts an external Map for layer canvas storage so that existing
 * hooks (usePointerHandlers) can continue to access layer canvases
 * directly via ref during the migration.
 */

import type { SketchRuntime, ActiveStrokeInfo, DirtyRect } from "./types";
import {
  getAncestorGroupOpacityProduct,
  isLayerCompositeVisible,
  type LayerContentBounds,
  type Selection,
  type SketchDocument
} from "../types";
import {
  drawStrokeBufferForDisplayWithSelectionFeather,
  selectionHasAnyPixels
} from "../selection/selectionMask";
import { blendModeToComposite, drawCheckerboard } from "../drawingUtils";
import {
  getCanvasRasterBounds,
  getLayerCompositeOffset,
  setCanvasRasterBounds
} from "../painting/layerBounds";

const SERIALIZED_LAYER_DATA_PREFIX = "ntlayer:";

type SerializedLayerData = {
  version: 1;
  image: string | null;
  bounds: LayerContentBounds;
};

function getDefaultRasterBounds(
  bounds: LayerContentBounds
): LayerContentBounds {
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height))
  };
}

function serializeLayerData(
  image: string | null,
  bounds: LayerContentBounds
): string {
  const payload: SerializedLayerData = {
    version: 1,
    image,
    bounds: getDefaultRasterBounds(bounds)
  };
  return `${SERIALIZED_LAYER_DATA_PREFIX}${window.btoa(JSON.stringify(payload))}`;
}

function deserializeLayerData(
  data: string | null,
  fallbackBounds: LayerContentBounds
): {
  image: string | null;
  bounds: LayerContentBounds;
} {
  if (!data) {
    return { image: null, bounds: getDefaultRasterBounds(fallbackBounds) };
  }
  if (!data.startsWith(SERIALIZED_LAYER_DATA_PREFIX)) {
    return { image: data, bounds: getDefaultRasterBounds(fallbackBounds) };
  }
  try {
    const payload = JSON.parse(
      window.atob(data.slice(SERIALIZED_LAYER_DATA_PREFIX.length))
    ) as Partial<SerializedLayerData>;
    return {
      image: typeof payload.image === "string" ? payload.image : null,
      bounds: getDefaultRasterBounds({
        x: payload.bounds?.x ?? fallbackBounds.x,
        y: payload.bounds?.y ?? fallbackBounds.y,
        width: payload.bounds?.width ?? fallbackBounds.width,
        height: payload.bounds?.height ?? fallbackBounds.height
      })
    };
  } catch {
    return { image: null, bounds: getDefaultRasterBounds(fallbackBounds) };
  }
}

export class Canvas2DRuntime implements SketchRuntime {
  /**
   * Off-screen layer canvases keyed by layer ID.
   * This map is shared with the React hooks that created the runtime,
   * so changes here are visible to pointer handlers and vice-versa.
   */
  private layerCanvases: Map<string, HTMLCanvasElement>;

  /** Reusable temp canvas for stroke compositing. */
  private strokeTempCanvas: HTMLCanvasElement | null = null;
  /** Scratch for feathered selection preview (stroke buffer × mask alpha). */
  private strokeMaskScratchCanvas: HTMLCanvasElement | null = null;

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

  constructor(layerCanvases?: Map<string, HTMLCanvasElement>) {
    this.layerCanvases = layerCanvases ?? new Map();
  }

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

  invalidateLayer(_layerId: string): void {
    // Canvas2D reads directly from the authoritative layer canvases, so
    // there is no extra invalidation work to do here.
  }

  // ─── Compositing ─────────────────────────────────────────────────────

  compositeToDisplay(
    targetCanvas: HTMLCanvasElement,
    doc: SketchDocument,
    isolatedLayerId: string | null | undefined,
    activeStroke: ActiveStrokeInfo | null,
    dirtyRect?: DirtyRect | null
  ): void {
    const ctx = targetCanvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const fullW = targetCanvas.width;
    const fullH = targetCanvas.height;
    const useClip = !!dirtyRect;

    if (useClip) {
      const pad = 2;
      const rx = Math.max(0, Math.floor(dirtyRect.x - pad));
      const ry = Math.max(0, Math.floor(dirtyRect.y - pad));
      const rw = Math.min(fullW - rx, Math.ceil(dirtyRect.w + pad * 2));
      const rh = Math.min(fullH - ry, Math.ceil(dirtyRect.h + pad * 2));

      ctx.save();
      ctx.beginPath();
      ctx.rect(rx, ry, rw, rh);
      ctx.clip();
      ctx.clearRect(rx, ry, rw, rh);
      drawCheckerboard(ctx, fullW, fullH, this.zoom);
    } else {
      ctx.clearRect(0, 0, fullW, fullH);
      drawCheckerboard(ctx, fullW, fullH, this.zoom);
    }

    for (const layer of doc.layers) {
      if (layer.type === "mask" || layer.type === "group") {
        continue;
      }
      if (!isLayerCompositeVisible(doc.layers, layer, isolatedLayerId)) {
        continue;
      }
      if (isolatedLayerId && layer.id !== isolatedLayerId) {
        continue;
      }
      const layerCanvas = this.layerCanvases.get(layer.id);
      if (!layerCanvas) {
        continue;
      }

      const opacityScale = getAncestorGroupOpacityProduct(
        doc.layers,
        layer,
        isolatedLayerId
      );
      const hasActiveStroke = activeStroke && activeStroke.layerId === layer.id;
      const compositeOffset = getLayerCompositeOffset(
        layer,
        {
          width: layerCanvas.width,
          height: layerCanvas.height
        },
        layerCanvas
      );

      if (hasActiveStroke) {
        let tempCanvas = this.strokeTempCanvas;
        if (
          !tempCanvas ||
          tempCanvas.width !== layerCanvas.width ||
          tempCanvas.height !== layerCanvas.height
        ) {
          tempCanvas = window.document.createElement("canvas");
          tempCanvas.width = layerCanvas.width;
          tempCanvas.height = layerCanvas.height;
          this.strokeTempCanvas = tempCanvas;
        }
        const tempCtx = tempCanvas.getContext("2d");
        if (tempCtx) {
          tempCtx.setTransform(1, 0, 0, 1, 0, 0);
          tempCtx.globalAlpha = 1;
          tempCtx.globalCompositeOperation = "source-over";
          tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
          tempCtx.drawImage(layerCanvas, 0, 0);
          tempCtx.save();
          tempCtx.globalAlpha = activeStroke.opacity;
          tempCtx.globalCompositeOperation = activeStroke.compositeOp;
          this.strokeMaskScratchCanvas =
            drawStrokeBufferForDisplayWithSelectionFeather(
              tempCtx,
              activeStroke.buffer,
              activeStroke.selectionMaskForPreview,
              this.strokeMaskScratchCanvas
            );
          tempCtx.restore();

          ctx.save();
          ctx.globalAlpha = layer.opacity * opacityScale;
          ctx.globalCompositeOperation = blendModeToComposite(
            layer.blendMode || "normal"
          );
          this.drawWithTransform(ctx, tempCanvas, compositeOffset, layer);
          ctx.restore();
        }
      } else {
        ctx.save();
        ctx.globalAlpha = layer.opacity * opacityScale;
        ctx.globalCompositeOperation = blendModeToComposite(
          layer.blendMode || "normal"
        );
        this.drawWithTransform(ctx, layerCanvas, compositeOffset, layer);
        ctx.restore();
      }
    }

    if (useClip) {
      ctx.restore();
    }

    // Draw a subtle border around the canvas to show its boundaries
    if (!useClip && typeof ctx.strokeRect === "function") {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, fullW - 1, fullH - 1);
      ctx.restore();
    }
  }

  // ─── Transform-aware drawing ─────────────────────────────────────────

  /**
   * Draw a source canvas into the target context, applying any scale/rotation
   * from the layer transform around the content center.
   */
  private drawWithTransform(
    ctx: CanvasRenderingContext2D,
    source: HTMLCanvasElement,
    compositeOffset: { x: number; y: number },
    layer: { transform: { scaleX?: number; scaleY?: number; rotation?: number } }
  ): void {
    const sx = layer.transform.scaleX ?? 1;
    const sy = layer.transform.scaleY ?? 1;
    const rot = layer.transform.rotation ?? 0;

    if (sx !== 1 || sy !== 1 || rot !== 0) {
      const cx = compositeOffset.x + source.width / 2;
      const cy = compositeOffset.y + source.height / 2;
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.scale(sx, sy);
      ctx.drawImage(source, -source.width / 2, -source.height / 2);
    } else {
      ctx.drawImage(source, compositeOffset.x, compositeOffset.y);
    }
  }

  // ─── Readback helpers ────────────────────────────────────────────────

  /** Draw a single layer into a context, respecting opacity and blend mode. */
  private drawLayerToContext(
    ctx: CanvasRenderingContext2D,
    doc: SketchDocument,
    layerId: string,
    includeOpacity = true
  ): void {
    const layer = doc.layers.find((l) => l.id === layerId);
    const layerCanvas = this.layerCanvases.get(layerId);
    if (!layer || !layerCanvas) {
      return;
    }
    ctx.save();
    if (includeOpacity) {
      const opacityScale = getAncestorGroupOpacityProduct(
        doc.layers,
        layer,
        null
      );
      ctx.globalAlpha = layer.opacity * opacityScale;
      ctx.globalCompositeOperation = blendModeToComposite(
        layer.blendMode || "normal"
      );
    }
    const compositeOffset = getLayerCompositeOffset(
      layer,
      {
        width: layerCanvas.width,
        height: layerCanvas.height
      },
      layerCanvas
    );
    this.drawWithTransform(ctx, layerCanvas, compositeOffset, layer);
    ctx.restore();
  }

  getLayerData(layerId: string): string | null {
    const canvas = this.layerCanvases.get(layerId);
    if (!canvas) {
      return null;
    }
    const fullBounds = getCanvasRasterBounds(canvas) ?? {
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height
    };

    // Find the actual non-transparent content rect so we store a compact,
    // content-sized PNG instead of the full (often doc-sized) canvas.
    // A smaller PNG encodes faster and makes layer thumbnails zoom in on the
    // painted pixels rather than showing a tiny speck inside a large canvas.
    const contentRect = this.findContentRect(canvas);
    if (!contentRect) {
      // Empty layer — store a 1×1 null image at the canvas origin.
      return serializeLayerData(null, {
        x: fullBounds.x,
        y: fullBounds.y,
        width: 1,
        height: 1
      });
    }

    const contentBounds = {
      x: fullBounds.x + contentRect.x,
      y: fullBounds.y + contentRect.y,
      width: contentRect.width,
      height: contentRect.height
    };

    // Only crop when it meaningfully reduces the encoded area (>10% reduction).
    const originalArea = canvas.width * canvas.height;
    const contentArea = contentRect.width * contentRect.height;
    if (contentArea >= originalArea * 0.9) {
      return serializeLayerData(canvas.toDataURL("image/png"), fullBounds);
    }

    // Encode only the content region.
    const cropped = window.document.createElement("canvas");
    cropped.width = contentRect.width;
    cropped.height = contentRect.height;
    const croppedCtx = cropped.getContext("2d");
    if (!croppedCtx) {
      return serializeLayerData(canvas.toDataURL("image/png"), fullBounds);
    }
    croppedCtx.drawImage(canvas, -contentRect.x, -contentRect.y);
    return serializeLayerData(cropped.toDataURL("image/png"), contentBounds);
  }

  /**
   * Find the bounding rect of all non-transparent pixels in the canvas.
   *
   * To keep this fast regardless of canvas size, we draw the layer into a
   * small proxy canvas (max PROXY_MAX × PROXY_MAX) and scan that instead.
   * The result is scaled back to full-canvas coordinates and padded by one
   * proxy pixel (= one scale-factor worth of real pixels) so no visible
   * content is ever excluded. Returns null if the canvas is empty.
   */
  private findContentRect(
    canvas: HTMLCanvasElement
  ): { x: number; y: number; width: number; height: number } | null {
    if (canvas.width === 0 || canvas.height === 0) {
      return null;
    }

    const PROXY_MAX = 128;
    const scaleX = canvas.width / PROXY_MAX;
    const scaleY = canvas.height / PROXY_MAX;
    const pw = Math.min(canvas.width, PROXY_MAX);
    const ph = Math.min(canvas.height, PROXY_MAX);

    const proxy = window.document.createElement("canvas");
    proxy.width = pw;
    proxy.height = ph;
    const proxyCtx = proxy.getContext("2d", { willReadFrequently: true });
    if (!proxyCtx) {
      return null;
    }
    proxyCtx.drawImage(canvas, 0, 0, pw, ph);

    const imageData = proxyCtx.getImageData(0, 0, pw, ph);
    const data = imageData.data;

    let minX = pw,
      minY = ph,
      maxX = -1,
      maxY = -1;
    for (let y = 0; y < ph; y++) {
      const rowBase = y * pw;
      for (let x = 0; x < pw; x++) {
        if (data[(rowBase + x) * 4 + 3] !== 0) {
          if (x < minX) {
            minX = x;
          }
          if (y < minY) {
            minY = y;
          }
          if (x > maxX) {
            maxX = x;
          }
          if (y > maxY) {
            maxY = y;
          }
        }
      }
    }

    if (maxX < 0) {
      return null; // all transparent
    }

    // Scale back to full-canvas coordinates, padded by one proxy-pixel each
    // side to account for sub-pixel content the downscale may have blurred.
    const padX = Math.ceil(scaleX);
    const padY = Math.ceil(scaleY);
    const fx = Math.max(0, Math.floor(minX * scaleX) - padX);
    const fy = Math.max(0, Math.floor(minY * scaleY) - padY);
    const fx2 = Math.min(canvas.width, Math.ceil((maxX + 1) * scaleX) + padX);
    const fy2 = Math.min(canvas.height, Math.ceil((maxY + 1) * scaleY) + padY);
    return { x: fx, y: fy, width: fx2 - fx, height: fy2 - fy };
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
    const canvas = window.document.createElement("canvas");
    canvas.width = doc.canvas.width;
    canvas.height = doc.canvas.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return "";
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const layer of doc.layers) {
      if (layer.type === "mask" || layer.type === "group") {
        continue;
      }
      if (!isLayerCompositeVisible(doc.layers, layer, null)) {
        continue;
      }
      this.drawLayerToContext(ctx, doc, layer.id);
    }
    return canvas.toDataURL("image/png");
  }

  getMaskDataUrl(doc: SketchDocument): string | null {
    if (!doc.maskLayerId) {
      return null;
    }
    const maskLayer = doc.layers.find((l) => l.id === doc.maskLayerId);
    if (!maskLayer || !isLayerCompositeVisible(doc.layers, maskLayer, null)) {
      return null;
    }
    const canvas = window.document.createElement("canvas");
    canvas.width = doc.canvas.width;
    canvas.height = doc.canvas.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }
    this.drawLayerToContext(ctx, doc, doc.maskLayerId, false);
    return canvas.toDataURL("image/png");
  }

  flattenVisible(doc: SketchDocument): string {
    const canvas = window.document.createElement("canvas");
    canvas.width = doc.canvas.width;
    canvas.height = doc.canvas.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return "";
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const layer of doc.layers) {
      if (layer.type === "mask" || layer.type === "group") {
        continue;
      }
      if (!isLayerCompositeVisible(doc.layers, layer, null)) {
        continue;
      }
      this.drawLayerToContext(ctx, doc, layer.id);
    }
    return serializeLayerData(canvas.toDataURL("image/png"), {
      x: 0,
      y: 0,
      width: doc.canvas.width,
      height: doc.canvas.height
    });
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

    // Bump the generation so any in-flight img.onload from a prior call
    // knows it has been superseded and should not overwrite the canvas.
    const gen = (this.layerLoadGenerations.get(layerId) ?? 0) + 1;
    this.layerLoadGenerations.set(layerId, gen);

    // Defer the resize and clear until the image is ready to draw.
    // This keeps the live canvas content visible between now and onload,
    // preventing a blank-canvas flash during the encode→decode round-trip.
    const img = new Image();
    img.onload = () => {
      // Bail out if a newer setLayerData call has already taken over.
      if (this.layerLoadGenerations.get(layerId) !== gen) {
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
        ctx.drawImage(img, 0, 0);
      }
      onComplete?.();
    };
    img.src = decoded.image;
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
    const canvas = this.layerCanvases.get(layerId);
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const temp = window.document.createElement("canvas");
    temp.width = canvas.width;
    temp.height = canvas.height;
    const tempCtx = temp.getContext("2d");
    if (!tempCtx) {
      return;
    }
    tempCtx.drawImage(canvas, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    if (direction === "horizontal") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    } else {
      ctx.translate(0, canvas.height);
      ctx.scale(1, -1);
    }
    ctx.drawImage(temp, 0, 0);
    ctx.restore();
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
    if (!selectionHasAnyPixels(mask)) {
      return;
    }
    const canvas = this.layerCanvases.get(layerId);
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const lw = canvas.width;
    const lh = canvas.height;
    const { width: mw, height: mh, data } = mask;
    const th = 128;
    for (let ly = 0; ly < lh; ly++) {
      const docY = ly + offsetY;
      if (docY < 0 || docY >= mh) {
        continue;
      }
      const rowOff = docY * mw;
      let lx = 0;
      while (lx < lw) {
        const docX = lx + offsetX;
        if (docX < 0 || docX >= mw) {
          lx++;
          continue;
        }
        if (data[rowOff + docX] < th) {
          lx++;
          continue;
        }
        let lx2 = lx + 1;
        while (lx2 < lw) {
          const dx = lx2 + offsetX;
          if (dx >= mw || data[rowOff + dx] < th) {
            break;
          }
          lx2++;
        }
        ctx.clearRect(lx, ly, lx2 - lx, 1);
        lx = lx2;
      }
    }
  }

  fillLayerBySelectionMask(
    layerId: string,
    offsetX: number,
    offsetY: number,
    mask: Selection,
    color: string
  ): void {
    if (!selectionHasAnyPixels(mask)) {
      return;
    }
    const canvas = this.layerCanvases.get(layerId);
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const lw = canvas.width;
    const lh = canvas.height;
    const { width: mw, height: mh, data } = mask;
    const th = 128;
    ctx.save();
    ctx.fillStyle = color;
    for (let ly = 0; ly < lh; ly++) {
      const docY = ly + offsetY;
      if (docY < 0 || docY >= mh) {
        continue;
      }
      const rowOff = docY * mw;
      let lx = 0;
      while (lx < lw) {
        const docX = lx + offsetX;
        if (docX < 0 || docX >= mw) {
          lx++;
          continue;
        }
        if (data[rowOff + docX] < th) {
          lx++;
          continue;
        }
        let lx2 = lx + 1;
        while (lx2 < lw) {
          const dx = lx2 + offsetX;
          if (dx >= mw || data[rowOff + dx] < th) {
            break;
          }
          lx2++;
        }
        ctx.fillRect(lx, ly, lx2 - lx, 1);
        lx = lx2;
      }
    }
    ctx.restore();
  }

  nudgeLayer(layerId: string, dx: number, dy: number): void {
    const canvas = this.layerCanvases.get(layerId);
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const tmp = window.document.createElement("canvas");
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const tmpCtx = tmp.getContext("2d");
    if (!tmpCtx) {
      return;
    }
    tmpCtx.drawImage(canvas, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tmp, dx, dy);
  }

  trimLayerToBounds(
    layerId: string
  ): { data: string; bounds: LayerContentBounds } | null {
    const canvas = this.layerCanvases.get(layerId);
    if (!canvas) {
      return null;
    }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return null;
    }

    const width = canvas.width;
    const height = canvas.height;
    const imageData = ctx.getImageData(0, 0, width, height).data;

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      const rowOffset = y * width * 4;
      for (let x = 0; x < width; x += 1) {
        if (imageData[rowOffset + x * 4 + 3] === 0) {
          continue;
        }
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    const currentBounds = getCanvasRasterBounds(canvas) ?? {
      x: 0,
      y: 0,
      width,
      height
    };

    if (maxX < minX || maxY < minY) {
      const emptyBounds = {
        x: currentBounds.x,
        y: currentBounds.y,
        width: 1,
        height: 1
      };
      canvas.width = 1;
      canvas.height = 1;
      const emptyCtx = canvas.getContext("2d");
      emptyCtx?.clearRect(0, 0, 1, 1);
      setCanvasRasterBounds(canvas, emptyBounds);
      return {
        data: serializeLayerData(null, emptyBounds),
        bounds: emptyBounds
      };
    }

    const trimmedWidth = maxX - minX + 1;
    const trimmedHeight = maxY - minY + 1;
    const trimmedBounds = {
      x: currentBounds.x + minX,
      y: currentBounds.y + minY,
      width: trimmedWidth,
      height: trimmedHeight
    };

    if (
      minX === 0 &&
      minY === 0 &&
      trimmedWidth === width &&
      trimmedHeight === height
    ) {
      setCanvasRasterBounds(canvas, trimmedBounds);
      return {
        data: serializeLayerData(canvas.toDataURL("image/png"), trimmedBounds),
        bounds: trimmedBounds
      };
    }

    const trimmedCanvas = window.document.createElement("canvas");
    trimmedCanvas.width = trimmedWidth;
    trimmedCanvas.height = trimmedHeight;
    const trimmedCtx = trimmedCanvas.getContext("2d");
    if (!trimmedCtx) {
      return null;
    }
    trimmedCtx.drawImage(canvas, -minX, -minY);

    canvas.width = trimmedWidth;
    canvas.height = trimmedHeight;
    const targetCtx = canvas.getContext("2d");
    if (!targetCtx) {
      return null;
    }
    targetCtx.clearRect(0, 0, trimmedWidth, trimmedHeight);
    targetCtx.drawImage(trimmedCanvas, 0, 0);
    setCanvasRasterBounds(canvas, trimmedBounds);

    return {
      data: serializeLayerData(canvas.toDataURL("image/png"), trimmedBounds),
      bounds: trimmedBounds
    };
  }

  mergeLayerDown(
    upperLayerId: string,
    lowerLayerId: string,
    doc: SketchDocument
  ): string | undefined {
    const lowerCanvas = this.layerCanvases.get(lowerLayerId);
    if (!lowerCanvas) {
      return;
    }
    const lowerCtx = lowerCanvas.getContext("2d");
    if (!lowerCtx) {
      // Even without a context we still clean up the upper layer
      this.layerCanvases.delete(upperLayerId);
      return;
    }
    const upperLayer = doc.layers.find((l) => l.id === upperLayerId);
    const lowerLayer = doc.layers.find((l) => l.id === lowerLayerId);
    const mergedCanvas = window.document.createElement("canvas");
    mergedCanvas.width = doc.canvas.width;
    mergedCanvas.height = doc.canvas.height;
    const mergedCtx = mergedCanvas.getContext("2d");
    if (!mergedCtx) {
      this.layerCanvases.delete(upperLayerId);
      return;
    }
    if (lowerLayer) {
      this.drawLayerToContext(mergedCtx, doc, lowerLayerId);
    }
    if (upperLayer) {
      this.drawLayerToContext(mergedCtx, doc, upperLayerId);
    }
    lowerCtx.clearRect(0, 0, lowerCanvas.width, lowerCanvas.height);
    lowerCtx.drawImage(mergedCanvas, 0, 0);
    setCanvasRasterBounds(lowerCanvas, {
      x: 0,
      y: 0,
      width: doc.canvas.width,
      height: doc.canvas.height
    });
    this.layerCanvases.delete(upperLayerId);
    return serializeLayerData(lowerCanvas.toDataURL("image/png"), {
      x: 0,
      y: 0,
      width: doc.canvas.width,
      height: doc.canvas.height
    });
  }

  cropLayers(x: number, y: number, width: number, height: number): void {
    for (const [, layerCanvas] of this.layerCanvases) {
      const snapshot = window.document.createElement("canvas");
      snapshot.width = layerCanvas.width;
      snapshot.height = layerCanvas.height;
      const snapshotCtx = snapshot.getContext("2d");
      const ctx = layerCanvas.getContext("2d");
      if (snapshotCtx && ctx) {
        snapshotCtx.drawImage(layerCanvas, 0, 0);
        layerCanvas.width = width;
        layerCanvas.height = height;
        setCanvasRasterBounds(layerCanvas, { x: 0, y: 0, width, height });
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(snapshot, -x, -y);
      } else {
        layerCanvas.width = width;
        layerCanvas.height = height;
        setCanvasRasterBounds(layerCanvas, { x: 0, y: 0, width, height });
      }
    }
  }

  applyAdjustments(
    doc: SketchDocument,
    brightness: number,
    contrast: number,
    saturation: number
  ): void {
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!activeLayer) {
      return;
    }
    const layerCanvas = this.layerCanvases.get(activeLayer.id);
    if (!layerCanvas) {
      return;
    }
    const ctx = layerCanvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const b = Math.max(0, 1 + brightness / 100);
    const c = Math.max(0, 1 + contrast / 100);
    const s = Math.max(0, 1 + saturation / 100);
    const tmp = window.document.createElement("canvas");
    tmp.width = layerCanvas.width;
    tmp.height = layerCanvas.height;
    const tmpCtx = tmp.getContext("2d");
    if (!tmpCtx) {
      return;
    }
    tmpCtx.filter = `brightness(${b}) contrast(${c}) saturate(${s})`;
    tmpCtx.drawImage(layerCanvas, 0, 0);
    ctx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
    ctx.drawImage(tmp, 0, 0);
  }

  reconcileLayerToDocumentSpace(
    layerId: string,
    doc: SketchDocument
  ): string | null {
    const layer = doc.layers.find((l) => l.id === layerId);
    const canvas = this.layerCanvases.get(layerId);
    if (!layer || !canvas) {
      return null;
    }

    const tx = layer.transform?.x ?? 0;
    const ty = layer.transform?.y ?? 0;
    const sx = layer.transform?.scaleX ?? 1;
    const sy = layer.transform?.scaleY ?? 1;
    const rot = layer.transform?.rotation ?? 0;
    const hasTranslation = tx !== 0 || ty !== 0;
    const hasScaleOrRotation = sx !== 1 || sy !== 1 || rot !== 0;

    if (!hasTranslation && !hasScaleOrRotation) {
      setCanvasRasterBounds(canvas, {
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height
      });
      return serializeLayerData(canvas.toDataURL("image/png"), {
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height
      });
    }

    const source = window.document.createElement("canvas");
    source.width = canvas.width;
    source.height = canvas.height;
    const sourceCtx = source.getContext("2d");

    const temp = window.document.createElement("canvas");
    temp.width = doc.canvas.width;
    temp.height = doc.canvas.height;
    const tempCtx = temp.getContext("2d");

    if (!sourceCtx || !tempCtx) {
      return serializeLayerData(canvas.toDataURL("image/png"), {
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height
      });
    }

    sourceCtx.drawImage(canvas, 0, 0);
    canvas.width = doc.canvas.width;
    canvas.height = doc.canvas.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return serializeLayerData(canvas.toDataURL("image/png"), {
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height
      });
    }

    // Apply full transform: translate to position, then scale/rotate around center
    if (hasScaleOrRotation) {
      const cx = tx + source.width / 2;
      const cy = ty + source.height / 2;
      tempCtx.translate(cx, cy);
      tempCtx.rotate(rot);
      tempCtx.scale(sx, sy);
      tempCtx.drawImage(source, -source.width / 2, -source.height / 2);
    } else {
      tempCtx.drawImage(source, tx, ty);
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(temp, 0, 0);
    setCanvasRasterBounds(canvas, {
      x: 0,
      y: 0,
      width: doc.canvas.width,
      height: doc.canvas.height
    });
    return serializeLayerData(canvas.toDataURL("image/png"), {
      x: 0,
      y: 0,
      width: doc.canvas.width,
      height: doc.canvas.height
    });
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────

  dispose(): void {
    this.layerCanvases.clear();
    this.strokeTempCanvas = null;
    this.strokeMaskScratchCanvas = null;
  }
}
