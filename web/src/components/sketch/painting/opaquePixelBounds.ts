/**
 * opaquePixelBounds – Compute the tight bounding box of non-transparent
 * pixels in a canvas.
 *
 * Used by `resolveGizmoBounds` so that the transform/move gizmo wraps
 * the actual visual content of a layer rather than the full canvas
 * allocation.
 *
 * The scan is O(width × height) but only runs once per tool activation
 * (not per frame), so the cost is acceptable for typical layer sizes.
 *
 * @module painting/opaquePixelBounds
 */

import type { LayerContentBounds } from "../types";

/**
 * Scan a canvas for non-transparent pixels and return the tight bounding
 * box in canvas-local coordinates.
 *
 * @param canvas  The canvas to scan.
 * @param alphaThreshold  Minimum alpha value (0–255) to count as opaque.
 *                        Defaults to 1 (any non-zero alpha).
 * @returns The tight bounding box of opaque pixels, or `null` if the
 *          canvas is fully transparent.
 */
export function computeOpaquePixelBounds(
  canvas: HTMLCanvasElement,
  alphaThreshold = 1
): LayerContentBounds | null {
  const w = canvas.width;
  const h = canvas.height;
  if (w === 0 || h === 0) {
    return null;
  }

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return null;
  }

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < h; y++) {
    const rowOffset = y * w * 4;
    for (let x = 0; x < w; x++) {
      const alpha = data[rowOffset + x * 4 + 3];
      if (alpha >= alphaThreshold) {
        if (x < minX) { minX = x; }
        if (x > maxX) { maxX = x; }
        if (y < minY) { minY = y; }
        if (y > maxY) { maxY = y; }
      }
    }
  }

  if (maxX < 0) {
    // Fully transparent canvas
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}

/**
 * Compute the tight bounding box of opaque pixels in a layer canvas,
 * incorporating the layer's stored raster origin.
 *
 * If the canvas has stored raster bounds (via `__nodetoolRasterBounds`),
 * the returned bounds are offset by the raster origin so they are in
 * layer-local space (same coordinate system as `contentBounds`).
 *
 * @param canvas  The layer canvas.
 * @param rasterOrigin  Optional raster origin ({x, y}) from stored bounds.
 * @param alphaThreshold  Minimum alpha value (0–255) to count as opaque.
 * @returns Tight bounds in layer-local space, or `null` if fully transparent.
 */
export function computeLayerOpaquePixelBounds(
  canvas: HTMLCanvasElement,
  rasterOrigin?: { x: number; y: number },
  alphaThreshold = 1
): LayerContentBounds | null {
  const bounds = computeOpaquePixelBounds(canvas, alphaThreshold);
  if (!bounds) {
    return null;
  }
  const ox = rasterOrigin?.x ?? 0;
  const oy = rasterOrigin?.y ?? 0;
  return {
    x: bounds.x + ox,
    y: bounds.y + oy,
    width: bounds.width,
    height: bounds.height
  };
}
