/**
 * Selection constraint for putImageData-based tools (fill, gradient, etc.).
 *
 * putImageData bypasses the canvas clipping path, so selection constraints
 * must be applied by restoring original pixel values outside the selection
 * after the draw call completes.
 *
 * This module is the single source of truth — FillTool and GradientTool
 * both delegate here so their clipping behavior cannot drift.
 */

import type { Selection } from "../types";
import { selectionHitTest } from "./selectionMask";

/**
 * Restore pixels outside the active selection to their pre-draw state.
 *
 * For every pixel in the canvas:
 * - if `selectionHitTest` says it is inside the selection → keep the new value
 * - otherwise → revert to the corresponding pixel in `beforeData`
 *
 * `offsetX` / `offsetY` translate canvas-local (0-based) coordinates into
 * document space before querying the selection mask (accounts for layer
 * rasterBounds offset).
 */
export function applySelectionConstraint(
  ctx: CanvasRenderingContext2D,
  beforeData: ImageData,
  selection: Selection,
  offsetX: number,
  offsetY: number
): void {
  const afterData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const after = afterData.data;
  const before = beforeData.data;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!selectionHitTest(selection, x + offsetX, y + offsetY)) {
        const i = (y * w + x) * 4;
        after[i]     = before[i];
        after[i + 1] = before[i + 1];
        after[i + 2] = before[i + 2];
        after[i + 3] = before[i + 3];
      }
    }
  }
  ctx.putImageData(afterData, 0, 0);
}

/**
 * Pure-data variant of `applySelectionConstraint` that operates on raw
 * pixel buffers instead of a canvas context.  Used for unit-testing the
 * constraint logic without needing a real canvas.
 *
 * Mutates `after` in place: pixels outside the selection are reverted to
 * their corresponding values in `before`.
 */
export function applySelectionConstraintToBuffers(
  before: Uint8ClampedArray,
  after: Uint8ClampedArray,
  width: number,
  height: number,
  selection: Selection,
  offsetX: number,
  offsetY: number
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!selectionHitTest(selection, x + offsetX, y + offsetY)) {
        const i = (y * width + x) * 4;
        after[i]     = before[i];
        after[i + 1] = before[i + 1];
        after[i + 2] = before[i + 2];
        after[i + 3] = before[i + 3];
      }
    }
  }
}
