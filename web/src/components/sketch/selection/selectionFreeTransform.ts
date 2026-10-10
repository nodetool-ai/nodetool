import {
  getLayerGeometry,
  getCanvasRasterBounds,
  setCanvasRasterBounds,
  unionLayerBounds
} from "../transform/geometry/layerGeometry";
import { buildSketchInternalClipboardCanvas } from "../sketchClipboard";
import type { Layer, LayerContentBounds, LayerTransform, Selection } from "../types";
import { isAffineTransform } from "../types";
import { cloneSelectionMask, getSelectionBounds, sampleMask, selectionHasAnyPixels } from "./selectionMask";

interface PreparedSelectionFreeTransform {
  selectionCanvas: HTMLCanvasElement;
  baseCanvas: HTMLCanvasElement;
  selectionBounds: LayerContentBounds;
}

function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const clone = window.document.createElement("canvas");
  clone.width = source.width;
  clone.height = source.height;
  const bounds = getCanvasRasterBounds(source);
  if (bounds) {
    setCanvasRasterBounds(clone, bounds);
  }
  const ctx = clone.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to acquire 2D context for selection transform canvas clone");
  }
  ctx.drawImage(source, 0, 0);
  return clone;
}

/**
 * Remove the selected pixels from the layer, scaled by the mask so that it
 * matches the soft-edged copy the transform lifts out. A hard cut here would
 * leave the partly selected edge both in the lifted copy and on the layer.
 */
function clearSelectedPixelsFromCanvas(
  canvas: HTMLCanvasElement,
  offsetX: number,
  offsetY: number,
  selection: Selection
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const maskOriginX = selection.originX ?? 0;
  const maskOriginY = selection.originY ?? 0;
  // The part of the canvas the mask covers, in canvas-local pixels.
  const left = Math.max(0, maskOriginX - offsetX);
  const top = Math.max(0, maskOriginY - offsetY);
  const right = Math.min(canvas.width, maskOriginX + selection.width - offsetX);
  const bottom = Math.min(canvas.height, maskOriginY + selection.height - offsetY);
  if (right <= left || bottom <= top) {
    return;
  }
  const width = right - left;
  const image = ctx.getImageData(left, top, width, bottom - top);
  const pixels = image.data;
  for (let y = top; y < bottom; y++) {
    const maskRow = (y + offsetY - maskOriginY) * selection.width;
    const pixelRow = (y - top) * width;
    for (let x = left; x < right; x++) {
      const m = selection.data[maskRow + x + offsetX - maskOriginX];
      if (m === 0) {
        continue;
      }
      const alpha = ((pixelRow + x - left) << 2) + 3;
      pixels[alpha] = Math.round((pixels[alpha] * (255 - m)) / 255);
    }
  }
  ctx.putImageData(image, left, top);
}

export function prepareSelectionFreeTransformCanvases(params: {
  snapshot: HTMLCanvasElement;
  layer: Layer;
  documentCanvasWidth: number;
  documentCanvasHeight: number;
  selection: Selection;
}): PreparedSelectionFreeTransform | null {
  const { snapshot, layer, documentCanvasWidth, documentCanvasHeight, selection } = params;
  if (!selectionHasAnyPixels(selection)) {
    return null;
  }
  const selectionBounds = getSelectionBounds(selection);
  if (!selectionBounds || selectionBounds.width <= 0 || selectionBounds.height <= 0) {
    return null;
  }

  const selectionCanvas = buildSketchInternalClipboardCanvas({
    snapshot,
    layer,
    documentCanvasWidth,
    documentCanvasHeight,
    selection
  });
  if (!selectionCanvas) {
    return null;
  }
  setCanvasRasterBounds(selectionCanvas, selectionBounds);

  const baseCanvas = cloneCanvas(snapshot);
  const offset = getLayerGeometry(
    layer,
    snapshot,
    { width: snapshot.width, height: snapshot.height }
  ).compositeOffset;
  clearSelectedPixelsFromCanvas(baseCanvas, offset.x, offset.y, selection);

  return {
    selectionCanvas,
    baseCanvas,
    selectionBounds
  };
}

function buildSelectionSourceMaskCanvas(
  selection: Selection,
  bounds: LayerContentBounds
): HTMLCanvasElement {
  const canvas = window.document.createElement("canvas");
  canvas.width = Math.max(1, bounds.width);
  canvas.height = Math.max(1, bounds.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to acquire 2D context for selection mask transform");
  }
  const imageData = ctx.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    const docY = bounds.y + y;
    for (let x = 0; x < canvas.width; x++) {
      const alpha = sampleMask(selection, bounds.x + x, docY);
      const index = (y * canvas.width + x) * 4;
      imageData.data[index] = 255;
      imageData.data[index + 1] = 255;
      imageData.data[index + 2] = 255;
      imageData.data[index + 3] = alpha;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function getTransformedSelectionAabb(
  bounds: LayerContentBounds,
  transform: LayerTransform
): LayerContentBounds {
  const aff = isAffineTransform(transform) ? transform : null;
  const scaleX = aff?.scaleX ?? 1;
  const scaleY = aff?.scaleY ?? 1;
  const rotation = aff?.rotation ?? 0;
  const translateX = aff?.x ?? 0;
  const translateY = aff?.y ?? 0;
  const centerX = bounds.x + translateX + bounds.width / 2;
  const centerY = bounds.y + translateY + bounds.height / 2;
  const halfWidth = (bounds.width * scaleX) / 2;
  const halfHeight = (bounds.height * scaleY) / 2;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const transformPoint = (x: number, y: number) => ({
    x: centerX + x * cos - y * sin,
    y: centerY + x * sin + y * cos
  });
  const corners = [
    transformPoint(-halfWidth, -halfHeight),
    transformPoint(halfWidth, -halfHeight),
    transformPoint(-halfWidth, halfHeight),
    transformPoint(halfWidth, halfHeight)
  ];
  let minX = corners[0].x;
  let minY = corners[0].y;
  let maxX = corners[0].x;
  let maxY = corners[0].y;
  for (let i = 1; i < corners.length; i++) {
    minX = Math.min(minX, corners[i].x);
    minY = Math.min(minY, corners[i].y);
    maxX = Math.max(maxX, corners[i].x);
    maxY = Math.max(maxY, corners[i].y);
  }
  return {
    x: Math.floor(minX),
    y: Math.floor(minY),
    width: Math.max(1, Math.ceil(maxX) - Math.floor(minX)),
    height: Math.max(1, Math.ceil(maxY) - Math.floor(minY))
  };
}

export function transformSelectionMask(
  selection: Selection,
  sourceBounds: LayerContentBounds,
  transform: LayerTransform
): Selection {
  if (!selectionHasAnyPixels(selection)) {
    return cloneSelectionMask(selection);
  }
  const sourceCanvas = buildSelectionSourceMaskCanvas(selection, sourceBounds);
  const outputBounds = getTransformedSelectionAabb(sourceBounds, transform);
  const outputCanvas = window.document.createElement("canvas");
  outputCanvas.width = outputBounds.width;
  outputCanvas.height = outputBounds.height;
  const ctx = outputCanvas.getContext("2d");
  if (!ctx) {
    return cloneSelectionMask(selection);
  }

  const aff = isAffineTransform(transform) ? transform : null;
  const centerX = sourceBounds.x + (aff?.x ?? 0) + sourceBounds.width / 2;
  const centerY = sourceBounds.y + (aff?.y ?? 0) + sourceBounds.height / 2;
  ctx.translate(centerX - outputBounds.x, centerY - outputBounds.y);
  ctx.rotate(aff?.rotation ?? 0);
  ctx.scale(aff?.scaleX ?? 1, aff?.scaleY ?? 1);
  ctx.translate(-sourceBounds.width / 2, -sourceBounds.height / 2);
  ctx.drawImage(sourceCanvas, 0, 0);

  const imageData = ctx.getImageData(0, 0, outputCanvas.width, outputCanvas.height);
  const mask = new Uint8ClampedArray(outputCanvas.width * outputCanvas.height);
  for (let index = 0; index < mask.length; index++) {
    mask[index] = imageData.data[index * 4 + 3];
  }

  return {
    originX: outputBounds.x,
    originY: outputBounds.y,
    width: outputBounds.width,
    height: outputBounds.height,
    data: mask
  };
}

export function compositeSelectionOverBase(
  baseCanvas: HTMLCanvasElement,
  transformedSelectionCanvas: HTMLCanvasElement
): HTMLCanvasElement {
  const baseBounds = getCanvasRasterBounds(baseCanvas) ?? {
    x: 0,
    y: 0,
    width: baseCanvas.width,
    height: baseCanvas.height
  };
  const transformedBounds = getCanvasRasterBounds(transformedSelectionCanvas) ?? {
    x: 0,
    y: 0,
    width: transformedSelectionCanvas.width,
    height: transformedSelectionCanvas.height
  };
  const unionBounds = unionLayerBounds(baseBounds, transformedBounds);
  const canvas = window.document.createElement("canvas");
  canvas.width = unionBounds.width;
  canvas.height = unionBounds.height;
  setCanvasRasterBounds(canvas, unionBounds);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  ctx.drawImage(baseCanvas, baseBounds.x - unionBounds.x, baseBounds.y - unionBounds.y);
  ctx.drawImage(
    transformedSelectionCanvas,
    transformedBounds.x - unionBounds.x,
    transformedBounds.y - unionBounds.y
  );
  return canvas;
}
