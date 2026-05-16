/**
 * sampleDocument – shared sampling utilities for the sketch editor.
 *
 * Provides a single sampling contract so eyedropper, move auto-pick,
 * clone-stamp source setup, and any future readback helpers all agree
 * on how to sample colors and hit-test layers at document-space points.
 *
 * All functions operate in document-space coordinates and use
 * CoordinateMapper for layers with non-trivial transforms (rotation,
 * scale) to ensure affine-correct results.
 *
 * Phase 1 goal: eyedropper/auto-pick/clone-stamp sampling agree on
 * transformed layers, isolate state, and active stroke state.
 */

import type { Point, Layer } from "../types";
import type { ToolContext } from "../tools/types";
import { rgbToHex } from "../types/geometry";
import { CoordinateMapper } from "./CoordinateMapper";
import { getRasterBounds } from "../transform/geometry/layerGeometry";

// ─── Composite sampling ─────────────────────────────────────────────────────

/**
 * Sample the composite document color at a document-space point.
 *
 * Always uses `readbackComposite` (via `getFullCompositeImageData`) so
 * display-only chrome (checkerboard, canvas border) never leaks into the
 * result. Returns a hex string such as "#ff0000" or null when sampling
 * fails or the point is out of bounds.
 */
export function sampleCompositeColor(
  ctx: ToolContext,
  docPoint: Point
): string | null {
  const x = Math.round(docPoint.x);
  const y = Math.round(docPoint.y);

  const id = ctx.getFullCompositeImageData?.();
  if (id && x >= 0 && y >= 0 && x < id.width && y < id.height) {
    const i = (y * id.width + x) * 4;
    return rgbToHex(id.data[i], id.data[i + 1], id.data[i + 2]);
  }

  return null;
}

/**
 * Sample the composite RGBA value at a document-space point.
 *
 * Returns `[r, g, b, a]` or null when sampling fails. Useful for callers
 * that need the alpha channel (e.g. hit-testing for non-transparent pixels).
 */
export function sampleCompositeRGBA(
  ctx: ToolContext,
  docPoint: Point
): [number, number, number, number] | null {
  const x = Math.round(docPoint.x);
  const y = Math.round(docPoint.y);

  const id = ctx.getFullCompositeImageData?.();
  if (id && x >= 0 && y >= 0 && x < id.width && y < id.height) {
    const i = (y * id.width + x) * 4;
    return [id.data[i], id.data[i + 1], id.data[i + 2], id.data[i + 3]];
  }

  return null;
}

// ─── Per-layer hit testing ──────────────────────────────────────────────────

/**
 * Hit-test whether a layer has a non-transparent pixel at a document-space
 * point.
 *
 * Uses CoordinateMapper to handle layers with affine transforms (rotation,
 * scale) so the hit test is correct for all transform states. Falls back
 * gracefully when the layer canvas doesn't exist or the point is out of
 * bounds.
 *
 * @param layer       The layer to test.
 * @param layerCanvas The layer's backing canvas (from layerCanvasesRef).
 * @param docPoint    The point in document-space coordinates.
 * @param alphaThreshold Minimum alpha value (0–255) to count as "hit".
 *                       Defaults to 1 (any non-zero alpha).
 * @returns true if the layer has a pixel with alpha >= threshold at the point.
 */
export function hitTestLayerAtDocPoint(
  layer: Layer,
  layerCanvas: HTMLCanvasElement,
  docPoint: Point,
  alphaThreshold = 1
): boolean {
  const layerCtx = layerCanvas.getContext("2d");
  if (!layerCtx) {
    return false;
  }

  const bounds = getRasterBounds(
    layer,
    layerCanvas,
    { width: layerCanvas.width, height: layerCanvas.height }
  );

  const mapper = new CoordinateMapper({
    layerTransform: layer.transform ?? { x: 0, y: 0 },
    rasterBounds: { x: bounds.x, y: bounds.y }
  });

  const local = mapper.docToLayer(docPoint);
  const localX = Math.floor(local.x);
  const localY = Math.floor(local.y);

  if (
    localX < 0 ||
    localY < 0 ||
    localX >= layerCanvas.width ||
    localY >= layerCanvas.height
  ) {
    return false;
  }

  const pixel = layerCtx.getImageData(localX, localY, 1, 1).data;
  return pixel[3] >= alphaThreshold;
}
