/**
 * FillTool – flood-fills a region on the active layer canvas.
 */

import type { ToolHandler, ToolContext, ToolPointerEvent, ToolDefinition } from "./types";
import type { FillSettings } from "../types";
import { parseColorToRgba } from "../types";
import FormatColorFillIcon from "@mui/icons-material/FormatColorFill";
import { CoordinateMapper } from "../painting/CoordinateMapper";
import { ensureLayerRasterBounds } from "../transform/geometry/ensureRasterBounds";
import {
  getCanvasRasterBounds,
  getDocumentViewportInLayerSpace
} from "../transform/geometry/layerGeometry";
import {
  selectionHasAnyPixels,
  selectionHitTest
} from "../selection";

// ─── Flood Fill ──────────────────────────────────────────────────────────────
//
// Scanline span-fill: ~7x faster than 4-way pixel-stack fill.
// Uses perceptually weighted color distance (luminance-weighted RGB + alpha)
// so tolerance behaves consistently across the color spectrum.

export function floodFill(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  settings: FillSettings
): void {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const sx = Math.round(startX);
  const sy = Math.round(startY);
  if (sx < 0 || sx >= width || sy < 0 || sy >= height) {
    return;
  }

  const fillParsed = parseColorToRgba(settings.color);
  const fillR = fillParsed.r;
  const fillG = fillParsed.g;
  const fillB = fillParsed.b;
  const fillA = Math.round(Math.max(0, Math.min(1, fillParsed.a)) * 255);

  const idx0 = (sy * width + sx) * 4;
  const targetR = data[idx0];
  const targetG = data[idx0 + 1];
  const targetB = data[idx0 + 2];
  const targetA = data[idx0 + 3];

  if (targetR === fillR && targetG === fillG && targetB === fillB && targetA === fillA) {
    return;
  }

  // Perceptually weighted distance² threshold.
  // Weights: R×0.299, G×0.587, B×0.114 (standard luminance coefficients).
  // tolerance is on a 0–255 per-channel scale; we square it for comparison.
  const tol = settings.tolerance;
  const tol2 = tol * tol;

  const colorMatches = (i: number): boolean => {
    const dr = data[i] - targetR;
    const dg = data[i + 1] - targetG;
    const db = data[i + 2] - targetB;
    const da = data[i + 3] - targetA;
    return dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114 + da * da * 0.5 <= tol2;
  };

  const fillMask = new Uint8Array(width * height);
  const bounds = computeFloodFillMask(fillMask, width, height, sx, sy, colorMatches);
  if (!bounds) {
    return;
  }

  for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
    const rowBase = y * width;
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      if (!fillMask[rowBase + x]) {
        continue;
      }
      const ii = (rowBase + x) * 4;
      data[ii] = fillR;
      data[ii + 1] = fillG;
      data[ii + 2] = fillB;
      data[ii + 3] = fillA;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

interface FloodFillBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Compute the flood-filled region for a seed point.
 *
 * Mutates `filled` in place by marking every filled pixel with `1`, then
 * returns the document-space bounding box of those filled pixels. Returns
 * `null` when the seed does not produce any filled pixels.
 */
function computeFloodFillMask(
  filled: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  colorMatches: (i: number) => boolean
): FloodFillBounds | null {
  const stack: number[] = [startX, startY];
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;

    if (filled[y * width + x]) { continue; }
    if (!colorMatches((y * width + x) * 4)) { continue; }

    // ── Scan left from seed ────────────────────────────────────────────
    let x1 = x;
    while (x1 > 0 && !filled[y * width + x1 - 1] && colorMatches((y * width + x1 - 1) * 4)) {
      x1--;
    }

    // ── Scan right from seed ───────────────────────────────────────────
    let x2 = x;
    while (x2 < width - 1 && !filled[y * width + x2 + 1] && colorMatches((y * width + x2 + 1) * 4)) {
      x2++;
    }

    const rowBase = y * width;
    for (let xi = x1; xi <= x2; xi++) {
      filled[rowBase + xi] = 1;
    }
    if (x1 < minX) {
      minX = x1;
    }
    if (x2 > maxX) {
      maxX = x2;
    }
    if (y < minY) {
      minY = y;
    }
    if (y > maxY) {
      maxY = y;
    }

    // ── Push one seed per contiguous unfilled sub-span above and below ─
    if (y > 0) {
      let inSpan = false;
      for (let xi = x1; xi <= x2; xi++) {
        const pi = (y - 1) * width + xi;
        if (!filled[pi] && colorMatches(pi * 4)) {
          if (!inSpan) { stack.push(xi, y - 1); inSpan = true; }
        } else {
          inSpan = false;
        }
      }
    }
    if (y < height - 1) {
      let inSpan = false;
      for (let xi = x1; xi <= x2; xi++) {
        const pi = (y + 1) * width + xi;
        if (!filled[pi] && colorMatches(pi * 4)) {
          if (!inSpan) { stack.push(xi, y + 1); inSpan = true; }
        } else {
          inSpan = false;
        }
      }
    }
  }

  if (maxX < minX || maxY < minY) {
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
 * Build a temporary ROI canvas containing only the flood-filled output.
 *
 * The returned canvas is transparent outside the fill result and is sized to
 * the minimal fill bounds so the runtime can composite it through the active
 * selection mask without restoring the whole layer.
 */
function createFloodFillOverlayCanvas(
  sourceCtx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  settings: FillSettings
): HTMLCanvasElement | null {
  const width = sourceCtx.canvas.width;
  const height = sourceCtx.canvas.height;
  const imageData = sourceCtx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const sx = Math.round(startX);
  const sy = Math.round(startY);
  if (sx < 0 || sx >= width || sy < 0 || sy >= height) {
    return null;
  }

  const fillParsed = parseColorToRgba(settings.color);
  const fillR = fillParsed.r;
  const fillG = fillParsed.g;
  const fillB = fillParsed.b;
  const fillA = Math.round(Math.max(0, Math.min(1, fillParsed.a)) * 255);
  const idx0 = (sy * width + sx) * 4;
  const targetR = data[idx0];
  const targetG = data[idx0 + 1];
  const targetB = data[idx0 + 2];
  const targetA = data[idx0 + 3];
  if (targetR === fillR && targetG === fillG && targetB === fillB && targetA === fillA) {
    return null;
  }

  const tol = settings.tolerance;
  const tol2 = tol * tol;
  const colorMatches = (i: number): boolean => {
    const dr = data[i] - targetR;
    const dg = data[i + 1] - targetG;
    const db = data[i + 2] - targetB;
    const da = data[i + 3] - targetA;
    return dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114 + da * da * 0.5 <= tol2;
  };

  const fillMask = new Uint8Array(width * height);
  const bounds = computeFloodFillMask(fillMask, width, height, sx, sy, colorMatches);
  if (!bounds) {
    return null;
  }

  const overlayCanvas = document.createElement("canvas");
  overlayCanvas.width = bounds.width;
  overlayCanvas.height = bounds.height;
  const overlayCtx = overlayCanvas.getContext("2d");
  if (!overlayCtx) {
    return null;
  }
  const overlay = overlayCtx.createImageData(bounds.width, bounds.height);
  for (let y = 0; y < bounds.height; y++) {
    const sourceRow = (bounds.y + y) * width;
    const overlayRow = y * bounds.width * 4;
    for (let x = 0; x < bounds.width; x++) {
      if (!fillMask[sourceRow + bounds.x + x]) {
        continue;
      }
      const i = overlayRow + x * 4;
      overlay.data[i] = fillR;
      overlay.data[i + 1] = fillG;
      overlay.data[i + 2] = fillB;
      overlay.data[i + 3] = fillA;
    }
  }
  overlayCtx.putImageData(overlay, 0, 0);
  return overlayCanvas;
}

export class FillTool implements ToolHandler {
  readonly toolId = "fill" as const;

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    const { doc, selection } = ctx;
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!activeLayer) {
      return false;
    }

    // Locked layers reject pixel edits.
    if (activeLayer.locked) {
      return false;
    }

    const pt = event.point;
    if (selection && selectionHasAnyPixels(selection)) {
      if (!selectionHitTest(selection, pt.x, pt.y)) {
        return false;
      }
    }

    // Ensure the layer canvas covers the full document viewport so the flood
    // fill can reach all pixels visible on-screen. Without this, layers with
    // compact contentBounds leave an unfilled border at the edges.
    const viewportBounds = getDocumentViewportInLayerSpace(activeLayer, doc);
    const expandedBounds = ensureLayerRasterBounds(ctx, activeLayer, viewportBounds);

    const layerCanvas = ctx.getOrCreateLayerCanvas(activeLayer.id);
    const layerCtx = layerCanvas.getContext("2d");
    if (!layerCtx) {
      return false;
    }

    ctx.onStrokeStart();

    // Map the document-space click into the layer's backing raster space.
    // Use the expanded bounds so the coordinate mapping accounts for the
    // full-viewport canvas origin.
    const mapper = new CoordinateMapper({
      layerTransform: activeLayer.transform,
      rasterBounds: expandedBounds
    });
    const localPt = mapper.docToLayer(pt);
    const offset = mapper.offset;

    const hasSelection = selection && selectionHasAnyPixels(selection);
    const fillSettings = {
      ...doc.toolSettings.fill,
      color: ctx.foregroundColor || doc.toolSettings.fill.color
    };
    if (
      hasSelection &&
      selection &&
      ctx.runtime?.applyLayerSourceBySelectionMask
    ) {
      const overlayCanvas = createFloodFillOverlayCanvas(
        layerCtx,
        localPt.x,
        localPt.y,
        fillSettings
      );
      if (overlayCanvas) {
        ctx.runtime.applyLayerSourceBySelectionMask(
          activeLayer.id,
          offset.x,
          offset.y,
          selection,
          overlayCanvas
        );
      }
    } else {
      floodFill(layerCtx, localPt.x, localPt.y, fillSettings);
    }
    const committedBounds = getCanvasRasterBounds(layerCanvas) ?? undefined;
    ctx.onStrokeEnd(activeLayer.id, null, committedBounds);
    ctx.invalidateLayer?.(activeLayer.id);
    ctx.redraw();
    return false;
  }
}

export const definition: ToolDefinition = {
  tool: "fill",
  label: "Fill",
  Icon: FormatColorFillIcon,
  group: "painting"
};
