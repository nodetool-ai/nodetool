/**
 * maskAndExport – Flatten, mask, selection-based edits, trim, and merge operations.
 *
 * These functions operate on layer canvases and produce serialized data URLs
 * or mutate canvases in place. They take the layerCanvases map and any
 * needed callbacks (drawLayerToContext, renderDocumentComposite) as arguments.
 */

import type { LayerContentBounds, Selection, SketchDocument } from "../../types";
import { isLayerCompositeVisible } from "../../types";
import { selectionHasAnyPixels } from "../../selection";
import {
  getCanvasRasterBounds,
  setCanvasRasterBounds
} from "../../painting/layerBounds";
import { serializeLayerData } from "./layerIO";
import type { ActiveStrokeInfo } from "../types";

// ─── Type aliases for injected rendering callbacks ───────────────────────────

export type RenderDocumentCompositeFn = (
  ctx: CanvasRenderingContext2D,
  doc: SketchDocument,
  isolatedLayerId: string | null | undefined,
  activeStroke: ActiveStrokeInfo | null
) => void;

export type DrawLayerToContextFn = (
  ctx: CanvasRenderingContext2D,
  doc: SketchDocument,
  layerId: string,
  includeOpacity?: boolean
) => void;

// ─── Flatten to data URL ─────────────────────────────────────────────────────

export function flattenToDataUrl(
  doc: SketchDocument,
  renderDocumentCompositeToContext: RenderDocumentCompositeFn
): string {
  const canvas = window.document.createElement("canvas");
  canvas.width = doc.canvas.width;
  canvas.height = doc.canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return "";
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  renderDocumentCompositeToContext(ctx, doc, null, null);
  return canvas.toDataURL("image/png");
}

// ─── Get mask data URL ───────────────────────────────────────────────────────

export function getMaskDataUrl(
  doc: SketchDocument,
  drawLayerToContext: DrawLayerToContextFn
): string | null {
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
  drawLayerToContext(ctx, doc, doc.maskLayerId, false);
  return canvas.toDataURL("image/png");
}

// ─── Flatten visible ─────────────────────────────────────────────────────────

export function flattenVisible(
  doc: SketchDocument,
  renderDocumentCompositeToContext: RenderDocumentCompositeFn
): string {
  const canvas = window.document.createElement("canvas");
  canvas.width = doc.canvas.width;
  canvas.height = doc.canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return "";
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  renderDocumentCompositeToContext(ctx, doc, null, null);
  return serializeLayerData(canvas.toDataURL("image/png"), {
    x: 0,
    y: 0,
    width: doc.canvas.width,
    height: doc.canvas.height
  });
}

// ─── Readback composite ──────────────────────────────────────────────────────

export function readbackComposite(
  doc: SketchDocument,
  isolatedLayerId: string | null | undefined,
  activeStroke: ActiveStrokeInfo | null,
  renderDocumentCompositeToContext: RenderDocumentCompositeFn,
  readbackCanvas: HTMLCanvasElement | null
): { imageData: ImageData | null; readbackCanvas: HTMLCanvasElement | null } {
  const cw = doc.canvas.width;
  const ch = doc.canvas.height;
  if (cw === 0 || ch === 0) {
    return { imageData: null, readbackCanvas };
  }

  // Reuse a dedicated readback canvas so we don't allocate on every call.
  let rb = readbackCanvas;
  if (!rb || rb.width !== cw || rb.height !== ch) {
    rb = window.document.createElement("canvas");
    rb.width = cw;
    rb.height = ch;
    // Acquire willReadFrequently context before compositing
    rb.getContext("2d", { willReadFrequently: true });
    readbackCanvas = rb;
  }

  const drawCtx = rb.getContext("2d", { willReadFrequently: true });
  if (!drawCtx) {
    return { imageData: null, readbackCanvas };
  }
  drawCtx.clearRect(0, 0, cw, ch);
  renderDocumentCompositeToContext(drawCtx, doc, isolatedLayerId, activeStroke);

  return { imageData: drawCtx.getImageData(0, 0, cw, ch), readbackCanvas };
}

// ─── Clear layer by selection mask ───────────────────────────────────────────

export function clearLayerBySelectionMask(
  layerCanvases: Map<string, HTMLCanvasElement>,
  layerId: string,
  offsetX: number,
  offsetY: number,
  mask: Selection
): void {
  if (!selectionHasAnyPixels(mask)) {
    return;
  }
  const canvas = layerCanvases.get(layerId);
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
  const mox = mask.originX ?? 0;
  const moy = mask.originY ?? 0;
  const th = 128;
  for (let ly = 0; ly < lh; ly++) {
    const docY = ly + offsetY;
    const by = docY - moy;
    if (by < 0 || by >= mh) {
      continue;
    }
    const rowOff = by * mw;
    let lx = 0;
    while (lx < lw) {
      const docX = lx + offsetX;
      const bx = docX - mox;
      if (bx < 0 || bx >= mw) {
        lx++;
        continue;
      }
      if (data[rowOff + bx] < th) {
        lx++;
        continue;
      }
      let lx2 = lx + 1;
      while (lx2 < lw) {
        const ddx = lx2 + offsetX - mox;
        if (ddx >= mw || data[rowOff + ddx] < th) {
          break;
        }
        lx2++;
      }
      ctx.clearRect(lx, ly, lx2 - lx, 1);
      lx = lx2;
    }
  }
}

// ─── Fill layer by selection mask ────────────────────────────────────────────

export function fillLayerBySelectionMask(
  layerCanvases: Map<string, HTMLCanvasElement>,
  layerId: string,
  offsetX: number,
  offsetY: number,
  mask: Selection,
  color: string
): void {
  if (!selectionHasAnyPixels(mask)) {
    return;
  }
  const canvas = layerCanvases.get(layerId);
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
  const mox = mask.originX ?? 0;
  const moy = mask.originY ?? 0;
  const th = 128;
  ctx.save();
  ctx.fillStyle = color;
  for (let ly = 0; ly < lh; ly++) {
    const docY = ly + offsetY;
    const by = docY - moy;
    if (by < 0 || by >= mh) {
      continue;
    }
    const rowOff = by * mw;
    let lx = 0;
    while (lx < lw) {
      const docX = lx + offsetX;
      const bx = docX - mox;
      if (bx < 0 || bx >= mw) {
        lx++;
        continue;
      }
      if (data[rowOff + bx] < th) {
        lx++;
        continue;
      }
      let lx2 = lx + 1;
      while (lx2 < lw) {
        const ddx = lx2 + offsetX - mox;
        if (ddx >= mw || data[rowOff + ddx] < th) {
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

/**
 * Composite a source canvas into a layer, clipped to the document-space
 * selection mask projected into that layer's raster space.
 */
export function applyLayerSourceBySelectionMask(
  layerCanvases: Map<string, HTMLCanvasElement>,
  layerId: string,
  offsetX: number,
  offsetY: number,
  mask: Selection,
  source: CanvasImageSource,
  compositeOp: GlobalCompositeOperation = "source-over"
): void {
  if (!selectionHasAnyPixels(mask)) {
    return;
  }
  const canvas = layerCanvases.get(layerId);
  if (!canvas) {
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const layerWidth = canvas.width;
  const layerHeight = canvas.height;
  const maskOriginX = mask.originX ?? 0;
  const maskOriginY = mask.originY ?? 0;
  const roiX = Math.max(0, maskOriginX - offsetX);
  const roiY = Math.max(0, maskOriginY - offsetY);
  const roiRight = Math.min(layerWidth, maskOriginX + mask.width - offsetX);
  const roiBottom = Math.min(layerHeight, maskOriginY + mask.height - offsetY);
  const roiWidth = roiRight - roiX;
  const roiHeight = roiBottom - roiY;
  if (roiWidth <= 0 || roiHeight <= 0) {
    return;
  }

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = roiWidth;
  tempCanvas.height = roiHeight;
  const tempCtx = tempCanvas.getContext("2d");
  if (!tempCtx) {
    return;
  }
  tempCtx.clearRect(0, 0, roiWidth, roiHeight);
  tempCtx.drawImage(source, -roiX, -roiY);

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = roiWidth;
  maskCanvas.height = roiHeight;
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) {
    return;
  }
  const maskImage = maskCtx.createImageData(roiWidth, roiHeight);
  const alpha = maskImage.data;
  // Match the active-pixel threshold used by selectionHitTest in selectionMask.ts.
  const threshold = 128;
  const startMaskX = roiX + offsetX - maskOriginX;
  const startMaskY = roiY + offsetY - maskOriginY;
  for (let y = 0; y < roiHeight; y++) {
    const maskRow = (startMaskY + y) * mask.width;
    const alphaRow = y * roiWidth * 4;
    for (let x = 0; x < roiWidth; x++) {
      if (mask.data[maskRow + startMaskX + x] < threshold) {
        continue;
      }
      alpha[alphaRow + x * 4 + 3] = 255;
    }
  }
  maskCtx.putImageData(maskImage, 0, 0);

  tempCtx.save();
  tempCtx.globalCompositeOperation = "destination-in";
  tempCtx.drawImage(maskCanvas, 0, 0);
  tempCtx.restore();

  ctx.save();
  ctx.globalCompositeOperation = compositeOp;
  ctx.drawImage(tempCanvas, roiX, roiY);
  ctx.restore();
}

// ─── Trim layer to bounds ────────────────────────────────────────────────────

export function trimLayerToBounds(
  layerCanvases: Map<string, HTMLCanvasElement>,
  layerId: string
): { data: string; bounds: LayerContentBounds } | null {
  const canvas = layerCanvases.get(layerId);
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

// ─── Merge layer down ────────────────────────────────────────────────────────

export function mergeLayerDown(
  layerCanvases: Map<string, HTMLCanvasElement>,
  upperLayerId: string,
  lowerLayerId: string,
  doc: SketchDocument,
  drawLayerToContext: DrawLayerToContextFn
): string | undefined {
  const lowerCanvas = layerCanvases.get(lowerLayerId);
  if (!lowerCanvas) {
    return;
  }
  const lowerCtx = lowerCanvas.getContext("2d");
  if (!lowerCtx) {
    layerCanvases.delete(upperLayerId);
    return;
  }
  const upperLayer = doc.layers.find((l) => l.id === upperLayerId);
  const lowerLayer = doc.layers.find((l) => l.id === lowerLayerId);
  const mergedCanvas = window.document.createElement("canvas");
  mergedCanvas.width = doc.canvas.width;
  mergedCanvas.height = doc.canvas.height;
  const mergedCtx = mergedCanvas.getContext("2d");
  if (!mergedCtx) {
    layerCanvases.delete(upperLayerId);
    return;
  }
  if (lowerLayer) {
    drawLayerToContext(mergedCtx, doc, lowerLayerId);
  }
  if (upperLayer) {
    drawLayerToContext(mergedCtx, doc, upperLayerId);
  }
  lowerCtx.clearRect(0, 0, lowerCanvas.width, lowerCanvas.height);
  lowerCtx.drawImage(mergedCanvas, 0, 0);
  setCanvasRasterBounds(lowerCanvas, {
    x: 0,
    y: 0,
    width: doc.canvas.width,
    height: doc.canvas.height
  });
  layerCanvases.delete(upperLayerId);
  return serializeLayerData(lowerCanvas.toDataURL("image/png"), {
    x: 0,
    y: 0,
    width: doc.canvas.width,
    height: doc.canvas.height
  });
}
