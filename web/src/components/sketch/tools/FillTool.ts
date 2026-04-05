/**
 * FillTool – flood-fills a region on the active layer canvas.
 *
 * Extracted from usePointerHandlers handlePointerDown (~line 810-835).
 */

import type { ToolHandler, ToolContext, ToolPointerEvent, ToolDefinition } from "./types";
import type { FillSettings, Selection } from "../types";
import { parseColorToRgba } from "../types";
import FormatColorFillIcon from "@mui/icons-material/FormatColorFill";
import { CoordinateMapper } from "../painting/CoordinateMapper";
import { getCanvasRasterBounds } from "../painting";
import {
  selectionHasAnyPixels,
  selectionHitTest
} from "../selection";

// ─── Selection masking for putImageData-based tools ──────────────────────────
//
// putImageData bypasses the canvas clipping path, so selection constraints
// must be applied by restoring original pixel values outside the selection
// after the draw call completes.

function applySelectionConstraint(
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

// ─── Flood Fill (moved from drawingUtils.ts) ─────────────────────────────────
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
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const sx = Math.round(startX);
  const sy = Math.round(startY);
  if (sx < 0 || sx >= w || sy < 0 || sy >= h) {
    return;
  }

  const fillParsed = parseColorToRgba(settings.color);
  const fillR = fillParsed.r;
  const fillG = fillParsed.g;
  const fillB = fillParsed.b;
  const fillA = Math.round(Math.max(0, Math.min(1, fillParsed.a)) * 255);

  const idx0 = (sy * w + sx) * 4;
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

  const filled = new Uint8Array(w * h);

  // Stack stores interleaved (x, y) pairs as plain numbers.
  // Pre-allocate generously to avoid repeated array growth.
  const stack: number[] = [sx, sy];

  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;

    if (filled[y * w + x]) { continue; }
    if (!colorMatches((y * w + x) * 4)) { continue; }

    // ── Scan left from seed ────────────────────────────────────────────
    let x1 = x;
    while (x1 > 0 && !filled[y * w + x1 - 1] && colorMatches((y * w + x1 - 1) * 4)) {
      x1--;
    }

    // ── Scan right from seed ───────────────────────────────────────────
    let x2 = x;
    while (x2 < w - 1 && !filled[y * w + x2 + 1] && colorMatches((y * w + x2 + 1) * 4)) {
      x2++;
    }

    // ── Fill the horizontal span ───────────────────────────────────────
    const rowBase = y * w;
    for (let xi = x1; xi <= x2; xi++) {
      filled[rowBase + xi] = 1;
      const ii = (rowBase + xi) * 4;
      data[ii] = fillR;
      data[ii + 1] = fillG;
      data[ii + 2] = fillB;
      data[ii + 3] = fillA;
    }

    // ── Push one seed per contiguous unfilled sub-span above and below ─
    if (y > 0) {
      let inSpan = false;
      for (let xi = x1; xi <= x2; xi++) {
        const pi = (y - 1) * w + xi;
        if (!filled[pi] && colorMatches(pi * 4)) {
          if (!inSpan) { stack.push(xi, y - 1); inSpan = true; }
        } else {
          inSpan = false;
        }
      }
    }
    if (y < h - 1) {
      let inSpan = false;
      for (let xi = x1; xi <= x2; xi++) {
        const pi = (y + 1) * w + xi;
        if (!filled[pi] && colorMatches(pi * 4)) {
          if (!inSpan) { stack.push(xi, y + 1); inSpan = true; }
        } else {
          inSpan = false;
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
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

    const layerCanvas = ctx.getOrCreateLayerCanvas(activeLayer.id);
    const layerCtx = layerCanvas.getContext("2d");
    if (!layerCtx) {
      return false;
    }

    ctx.onStrokeStart();

    // Map the document-space click into the layer's backing raster space
    const mapper = new CoordinateMapper({
      layerTransform: activeLayer.transform,
      rasterBounds: activeLayer.contentBounds
    });
    const localPt = mapper.docToLayer(pt);
    const offset = mapper.offset;

    // Snapshot pixels before fill so we can mask selection afterward.
    // putImageData bypasses canvas clipping, so we apply selection constraint post-fill.
    const hasSelection = selection && selectionHasAnyPixels(selection);
    const beforeData = hasSelection
      ? layerCtx.getImageData(0, 0, layerCanvas.width, layerCanvas.height)
      : null;

    floodFill(layerCtx, localPt.x, localPt.y, { ...doc.toolSettings.fill, color: ctx.foregroundColor || doc.toolSettings.fill.color });

    if (hasSelection && beforeData && selection) {
      applySelectionConstraint(layerCtx, beforeData, selection, offset.x, offset.y);
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
  shortcut: "G",
  Icon: FormatColorFillIcon,
  group: "painting"
};
