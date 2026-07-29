/**
 * alphaLock – shared alpha-lock save/restore utilities for stroke-based tools.
 *
 * Multiple tools (CloneStamp, Blur, and PaintSession) need to:
 *   1. Snapshot the layer's alpha channel before a stroke begins
 *   2. Restore the original alpha values after the stroke ends
 *
 * This utility centralizes that logic so each tool no longer carries its
 * own copy of the pixel-level alpha restoration loop.
 */

/**
 * Capture the full pixel data of a layer canvas for later alpha restoration.
 *
 * Returns an ImageData snapshot, or null if the canvas context is unavailable.
 * The snapshot must be taken **before** any drawing on this stroke so the
 * alpha values represent the pre-stroke state.
 */
export function captureAlphaSnapshot(
  layerCanvas: HTMLCanvasElement
): ImageData | null {
  const ctx = layerCanvas.getContext("2d");
  if (!ctx) {
    return null;
  }
  return ctx.getImageData(0, 0, layerCanvas.width, layerCanvas.height);
}

/**
 * Dirty-rect region for constraining alpha restoration to just the
 * area modified during a stroke.
 */
export interface AlphaRestoreDirtyRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Restore the original alpha channel in the dirty region of a layer canvas.
 *
 * For each pixel in the dirty rect, the current alpha value is clamped to
 * be no higher than the pre-stroke snapshot's alpha. This preserves
 * transparency: strokes can darken or color pixels but cannot increase
 * the alpha beyond what existed before the stroke.
 *
 * If no dirty rect is provided, the entire canvas is processed.
 *
 * @param layerCanvas  The layer canvas to restore alpha on.
 * @param snapshot     The pre-stroke pixel snapshot from `captureAlphaSnapshot`.
 * @param dirtyRect    Optional dirty rect to constrain processing area.
 */
export function restoreAlphaFromSnapshot(
  layerCanvas: HTMLCanvasElement,
  snapshot: ImageData,
  dirtyRect?: AlphaRestoreDirtyRect | null
): void {
  const ctx = layerCanvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const rect = dirtyRect ?? {
    minX: 0,
    minY: 0,
    maxX: layerCanvas.width,
    maxY: layerCanvas.height
  };

  const x = Math.max(0, rect.minX);
  const y = Math.max(0, rect.minY);
  const width = Math.min(layerCanvas.width - x, rect.maxX - x);
  const height = Math.min(layerCanvas.height - y, rect.maxY - y);

  if (width <= 0 || height <= 0) {
    return;
  }

  const currentData = ctx.getImageData(x, y, width, height);
  const current = currentData.data;
  const snap = snapshot.data;
  const canvasW = layerCanvas.width;

  for (let yy = 0; yy < height; yy++) {
    for (let xx = 0; xx < width; xx++) {
      const localIndex = (yy * width + xx) * 4 + 3;
      const snapshotIndex = ((y + yy) * canvasW + (x + xx)) * 4 + 3;
      current[localIndex] = Math.min(current[localIndex], snap[snapshotIndex]);
    }
  }

  ctx.putImageData(currentData, x, y);
}
