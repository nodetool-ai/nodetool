/**
 * Selection-mask → PNG data URL conversion.
 *
 * The sketch editor stores a `Selection` as a document-space byte grid
 * (`width × height`, 0–255). Inpaint Here needs that mask as a PNG image
 * sized to the canvas, so the bound workflow can hand it directly to an
 * `nodetool.input.ImageInput` field.
 *
 * `selectionToMaskDataUrl` rasterizes the selection grid into a canvas-sized
 * PNG: each pixel's alpha is the selection's value (0 = unmasked, 255 =
 * fully selected), with white RGB so the mask is visible in standard
 * preview UIs.
 */

import type { Selection } from "../../components/sketch/types/selection";

/**
 * Render a selection grid into a canvas-sized PNG data URL (R=G=B=255,
 * A=selection value). Returns `null` when the selection grid is empty,
 * fully-empty (no values >0), or document space is degenerate.
 */
export function selectionToMaskDataUrl(
  selection: Selection,
  canvasWidth: number,
  canvasHeight: number
): string | null {
  if (
    canvasWidth <= 0 ||
    canvasHeight <= 0 ||
    selection.width <= 0 ||
    selection.height <= 0
  ) {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const out = ctx.createImageData(canvasWidth, canvasHeight);
  const ox = selection.originX ?? 0;
  const oy = selection.originY ?? 0;

  let anyActive = false;
  for (let y = 0; y < selection.height; y++) {
    const docY = y + oy;
    if (docY < 0 || docY >= canvasHeight) continue;
    for (let x = 0; x < selection.width; x++) {
      const docX = x + ox;
      if (docX < 0 || docX >= canvasWidth) continue;
      const value = selection.data[y * selection.width + x];
      if (!value) continue;
      anyActive = true;
      const idx = (docY * canvasWidth + docX) * 4;
      out.data[idx] = 255;
      out.data[idx + 1] = 255;
      out.data[idx + 2] = 255;
      out.data[idx + 3] = value;
    }
  }

  if (!anyActive) return null;

  ctx.putImageData(out, 0, 0);
  return canvas.toDataURL("image/png");
}
