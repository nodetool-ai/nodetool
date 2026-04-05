/**
 * reconcile – Layer spatial operations.
 *
 * Pure-ish functions that manipulate layer rasters in document space:
 * reconcile transforms, crop, flip, nudge, and apply pixel adjustments.
 */

import type { LayerContentBounds, SketchDocument } from "../../types";
import {
  getCanvasRasterBounds,
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

export type { LayerContentBounds };
