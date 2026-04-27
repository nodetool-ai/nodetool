/**
 * reconcile – Layer spatial operations.
 *
 * Pure-ish functions that manipulate layer rasters in document space:
 * reconcile transforms, crop, flip, nudge, and apply pixel adjustments.
 */

import type { LayerContentBounds, SketchDocument } from "../../types";
import {
  getCanvasRasterBounds,
  getLayerCompositeOffset,
  setCanvasRasterBounds
} from "../../painting/layerBounds";
import { serializeLayerData } from "./layerIO";

// ─── Reconcile transform to document space ───────────────────────────────────

/**
 * Bake the layer transform offset into the pixel data so that
 * (transform.x, transform.y) can be reset to (0, 0).
 * Returns the reconciled serialized data URL, or null if the layer is missing.
 */
export function reconcileLayerToDocumentSpace(
  layerId: string,
  doc: SketchDocument,
  layerCanvases: Map<string, HTMLCanvasElement>
): string | null {
  const layer = doc.layers.find((l) => l.id === layerId);
  const canvas = layerCanvases.get(layerId);
  if (!layer || !canvas) {
    return null;
  }

  const tx = layer.transform?.x ?? 0;
  const ty = layer.transform?.y ?? 0;
  const sx = layer.transform?.scaleX ?? 1;
  const sy = layer.transform?.scaleY ?? 1;
  const rot = layer.transform?.rotation ?? 0;
  const matrix = layer.transform?.matrix;
  const usesAdvancedAffine = Boolean(matrix && layer.transform?.mode);
  const hasTranslation = tx !== 0 || ty !== 0;
  const hasScaleOrRotation = sx !== 1 || sy !== 1 || rot !== 0;

  // Resolve the raster origin from the canvas raster bounds (set by
  // ensureLayerRasterBounds) or fall back to contentBounds. This matches
  // the preview compositing path in resolvedLayerGeometry which uses
  // getEffectiveRasterBounds → rasterBounds.x/y for the composite offset.
  const storedBounds = getCanvasRasterBounds(canvas);
  const rasterOriginX = storedBounds?.x ?? layer.contentBounds?.x ?? 0;
  const rasterOriginY = storedBounds?.y ?? layer.contentBounds?.y ?? 0;

  if (!hasTranslation && !hasScaleOrRotation) {
    setCanvasRasterBounds(canvas, {
      x: rasterOriginX,
      y: rasterOriginY,
      width: canvas.width,
      height: canvas.height
    });
    return serializeLayerData(canvas.toDataURL("image/png"), {
      x: rasterOriginX,
      y: rasterOriginY,
      width: canvas.width,
      height: canvas.height
    });
  }

  /** Fallback: serialize the canvas as-is when a context cannot be obtained. */
  const fallbackSerialize = () =>
    serializeLayerData(canvas.toDataURL("image/png"), {
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height
    });

  const source = window.document.createElement("canvas");
  source.width = canvas.width;
  source.height = canvas.height;
  const sourceCtx = source.getContext("2d");

  if (!sourceCtx) {
    return fallbackSerialize();
  }
  sourceCtx.drawImage(canvas, 0, 0);

  if (usesAdvancedAffine && matrix) {
    const [a, b, c, d, e, f] = matrix;
    const corners = [
      { x: rasterOriginX, y: rasterOriginY },
      { x: rasterOriginX + source.width, y: rasterOriginY },
      { x: rasterOriginX + source.width, y: rasterOriginY + source.height },
      { x: rasterOriginX, y: rasterOriginY + source.height }
    ].map((corner) => ({
      x: a * corner.x + c * corner.y + e,
      y: b * corner.x + d * corner.y + f
    }));

    const minX = Math.floor(Math.min(...corners.map((corner) => corner.x)));
    const minY = Math.floor(Math.min(...corners.map((corner) => corner.y)));
    const maxX = Math.ceil(Math.max(...corners.map((corner) => corner.x)));
    const maxY = Math.ceil(Math.max(...corners.map((corner) => corner.y)));
    const outX = Math.min(0, minX);
    const outY = Math.min(0, minY);
    const outW = Math.max(doc.canvas.width, maxX) - outX;
    const outH = Math.max(doc.canvas.height, maxY) - outY;

    const temp = window.document.createElement("canvas");
    temp.width = outW;
    temp.height = outH;
    const tempCtx = temp.getContext("2d");

    if (!tempCtx) {
      return fallbackSerialize();
    }

    tempCtx.setTransform(a, b, c, d, e - outX, f - outY);
    tempCtx.drawImage(source, rasterOriginX, rasterOriginY);

    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return fallbackSerialize();
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(temp, 0, 0);
    setCanvasRasterBounds(canvas, {
      x: outX,
      y: outY,
      width: outW,
      height: outH
    });
    return serializeLayerData(canvas.toDataURL("image/png"), {
      x: outX,
      y: outY,
      width: outW,
      height: outH
    });
  }

  // Compute the axis-aligned bounding box of the transformed content
  // so that scaling/rotating beyond document bounds doesn't clip pixels.
  //
  // Center computation must include the raster origin (rasterBounds.x/y)
  // to match the preview compositing path in resolvedLayerGeometry:
  //   cx = transform.x + rasterBounds.x + rasterBounds.width / 2
  const w = source.width;
  const h = source.height;
  const cx = tx + rasterOriginX + w / 2;
  const cy = ty + rasterOriginY + h / 2;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const hw = (w * sx) / 2;
  const hh = (h * sy) / 2;
  // Four corners after scale+rotation around center
  const corners = [
    { x: cx + (-hw) * cos - (-hh) * sin, y: cy + (-hw) * sin + (-hh) * cos },
    { x: cx + ( hw) * cos - (-hh) * sin, y: cy + ( hw) * sin + (-hh) * cos },
    { x: cx + (-hw) * cos - ( hh) * sin, y: cy + (-hw) * sin + ( hh) * cos },
    { x: cx + ( hw) * cos - ( hh) * sin, y: cy + ( hw) * sin + ( hh) * cos }
  ];
  let bMinX = corners[0].x, bMinY = corners[0].y;
  let bMaxX = corners[0].x, bMaxY = corners[0].y;
  for (let i = 1; i < 4; i++) {
    if (corners[i].x < bMinX) { bMinX = corners[i].x; }
    if (corners[i].y < bMinY) { bMinY = corners[i].y; }
    if (corners[i].x > bMaxX) { bMaxX = corners[i].x; }
    if (corners[i].y > bMaxY) { bMaxY = corners[i].y; }
  }
  const minX = Math.floor(bMinX);
  const minY = Math.floor(bMinY);
  const maxX = Math.ceil(bMaxX);
  const maxY = Math.ceil(bMaxY);

  // Use the union of the document bounds and the transformed AABB
  // to ensure no content is lost while keeping the document area covered.
  const outX = Math.min(0, minX);
  const outY = Math.min(0, minY);
  const outW = Math.max(doc.canvas.width, maxX) - outX;
  const outH = Math.max(doc.canvas.height, maxY) - outY;

  const temp = window.document.createElement("canvas");
  temp.width = outW;
  temp.height = outH;
  const tempCtx = temp.getContext("2d");

  if (!tempCtx) {
    return fallbackSerialize();
  }

  // Apply full transform with offset for expanded canvas
  if (hasScaleOrRotation) {
    const drawCx = cx - outX;
    const drawCy = cy - outY;
    tempCtx.translate(drawCx, drawCy);
    tempCtx.rotate(rot);
    tempCtx.scale(sx, sy);
    tempCtx.drawImage(source, -w / 2, -h / 2);
  } else {
    // Translation-only: offset includes raster origin
    tempCtx.drawImage(source, tx + rasterOriginX - outX, ty + rasterOriginY - outY);
  }

  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return fallbackSerialize();
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(temp, 0, 0);
  setCanvasRasterBounds(canvas, {
    x: outX,
    y: outY,
    width: outW,
    height: outH
  });
  return serializeLayerData(canvas.toDataURL("image/png"), {
    x: outX,
    y: outY,
    width: outW,
    height: outH
  });
}

// ─── Crop all layers ─────────────────────────────────────────────────────────

export function cropLayers(
  layerCanvases: Map<string, HTMLCanvasElement>,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  for (const [, layerCanvas] of layerCanvases) {
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

// ─── Flip layer ──────────────────────────────────────────────────────────────

export function flipLayer(
  layerCanvases: Map<string, HTMLCanvasElement>,
  layerId: string,
  direction: "horizontal" | "vertical"
): void {
  const canvas = layerCanvases.get(layerId);
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

// ─── Nudge layer ─────────────────────────────────────────────────────────────

export function nudgeLayer(
  layerCanvases: Map<string, HTMLCanvasElement>,
  layerId: string,
  dx: number,
  dy: number
): void {
  const canvas = layerCanvases.get(layerId);
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

// ─── Apply brightness / contrast / saturation adjustments ────────────────────

export function applyAdjustments(
  doc: SketchDocument,
  layerCanvases: Map<string, HTMLCanvasElement>,
  brightness: number,
  contrast: number,
  saturation: number
): void {
  const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
  if (!activeLayer) {
    return;
  }
  const layerCanvas = layerCanvases.get(activeLayer.id);
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

// ─── Invert layer colors ─────────────────────────────────────────────────────

/**
 * Invert all color channels of the active layer while preserving alpha.
 * When a selection mask is provided, only pixels within the selection
 * (mask value ≥ 128) are inverted; others are left unchanged.
 * Uses CSS filter `invert(1)` on a temporary canvas, then blends via
 * the selection mask when present.
 */
export function invertLayerColors(
  doc: SketchDocument,
  layerCanvases: Map<string, HTMLCanvasElement>,
  selection?: { width: number; height: number; data: Uint8ClampedArray; originX?: number; originY?: number } | null
): void {
  const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
  if (!activeLayer) {
    return;
  }
  const layerCanvas = layerCanvases.get(activeLayer.id);
  if (!layerCanvas) {
    return;
  }
  const ctx = layerCanvas.getContext("2d");
  if (!ctx) {
    return;
  }

  if (!selection) {
    // No selection — invert the entire layer using CSS filter
    const tmp = window.document.createElement("canvas");
    tmp.width = layerCanvas.width;
    tmp.height = layerCanvas.height;
    const tmpCtx = tmp.getContext("2d");
    if (!tmpCtx) {
      return;
    }
    tmpCtx.filter = "invert(1)";
    tmpCtx.drawImage(layerCanvas, 0, 0);
    ctx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
    ctx.drawImage(tmp, 0, 0);
    return;
  }

  // Selection present — invert only selected pixels using imageData
  const w = layerCanvas.width;
  const h = layerCanvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const pixels = imageData.data;
  const selOriginX = selection.originX ?? 0;
  const selOriginY = selection.originY ?? 0;
  const selW = selection.width;
  const selH = selection.height;
  const mask = selection.data;

  // Map layer-local raster pixels → document space so we can look up the
  // selection mask (which lives in document space).  The full document offset
  // includes both contentBounds (backing raster position) *and* any pending
  // layer transform translation — exactly the same contract used by
  // clearLayerBySelectionMask / fillLayerBySelectionMask via
  // getLayerCompositeOffset.
  const compositeOffset = getLayerCompositeOffset(activeLayer, {
    width: w,
    height: h
  });
  const cbx = compositeOffset.x;
  const cby = compositeOffset.y;

  for (let y = 0; y < h; y++) {
    // Map layer-local raster row → document row
    const docY = y + cby;
    // Map document row → selection mask row
    const selY = docY - selOriginY;
    if (selY < 0 || selY >= selH) {
      continue;
    }
    const rowOff = selY * selW;
    for (let x = 0; x < w; x++) {
      const docX = x + cbx;
      const selX = docX - selOriginX;
      if (selX < 0 || selX >= selW) {
        continue;
      }
      const maskVal = mask[rowOff + selX];
      if (maskVal < 128) {
        continue;
      }
      const idx = (y * w + x) * 4;
      pixels[idx] = 255 - pixels[idx];         // R
      pixels[idx + 1] = 255 - pixels[idx + 1]; // G
      pixels[idx + 2] = 255 - pixels[idx + 2]; // B
      // Alpha (idx + 3) is preserved
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

export type { LayerContentBounds };
