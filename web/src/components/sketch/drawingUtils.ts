/**
 * drawingUtils.ts
 *
 * Barrel re-export for all drawing algorithm functions. Domain-specific
 * implementations have been split into focused modules under `painting/`
 * and `rendering/`. This file re-exports everything so that existing
 * consumers continue to work without changes.
 *
 * Functions that will move to tool-specific files in a future step
 * (drawGradient, constrainEnd, applyAltCenterDraw, drawShapeOnCtx,
 * floodFill) remain defined here.
 */

// ─── Re-exports from domain modules ─────────────────────────────────────────

export {
  MIN_PRESSURE_FACTOR,
  strokePressureMultiplier,
  paintPressureForEngine,
  SKETCH_FULL_OPACITY_THRESHOLD,
  stampAlongStroke,
  expandDirtyRect,
  expandDirtyRectFromPoints,
  drawBrushStroke,
  brushSettingsForEraserStroke,
  pencilSettingsForEraserStroke,
  drawEraserStroke,
  drawPencilStroke
} from "./painting/strokeRendering";
export type { StrokeStampState } from "./painting/strokeRendering";

export { drawBlurStroke } from "./painting/blurRendering";

export { drawCloneStampStroke } from "./painting/cloneRendering";

export {
  blendModeToComposite,
  checkerboardDocumentCellPx,
  drawCheckerboard,
  PIXEL_GRID_MIN_ZOOM,
  PIXEL_GRID_FULL_OPACITY_ZOOM,
  PENCIL_PIXEL_CURSOR_MIN_ZOOM,
  drawPixelGrid
} from "./rendering/canvasUtils";
export type {
  DirtyRectBox,
  DirtyRectTracker,
  BlurTempCanvases
} from "./rendering/canvasUtils";

// ─── Functions remaining here (will move to tool files later) ────────────────

import type {
  Point,
  ShapeToolType,
  ShapeSettings,
  FillSettings,
  GradientSettings
} from "./types";
import { parseColorToRgba } from "./types";

// ─── Gradient Drawing ────────────────────────────────────────────────────────

export function drawGradient(
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  settings: GradientSettings
): void {
  ctx.save();
  let gradient: CanvasGradient;
  if (settings.type === "radial") {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const radius = Math.sqrt(dx * dx + dy * dy);
    // Minimum radius of 1 prevents invalid gradient when start/end points overlap
    gradient = ctx.createRadialGradient(
      start.x,
      start.y,
      0,
      start.x,
      start.y,
      Math.max(radius, 1)
    );
  } else {
    gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
  }
  gradient.addColorStop(0, settings.startColor);
  gradient.addColorStop(1, settings.endColor);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

// ─── Shape Drawing ───────────────────────────────────────────────────────────

/** Apply shift-constraint to shape end point */
export function constrainEnd(
  start: Point,
  end: Point,
  tool: ShapeToolType,
  shiftHeld: boolean
): Point {
  if (!shiftHeld) {
    return end;
  }
  if (tool === "rectangle" || tool === "ellipse") {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    return {
      x: start.x + size * Math.sign(dx || 1),
      y: start.y + size * Math.sign(dy || 1)
    };
  }
  if (tool === "line" || tool === "arrow") {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const angle = Math.atan2(dy, dx);
    const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    const dist = Math.sqrt(dx * dx + dy * dy);
    return {
      x: start.x + dist * Math.cos(snapped),
      y: start.y + dist * Math.sin(snapped)
    };
  }
  return end;
}

/**
 * When Alt is held for rectangle/ellipse, the start point is treated as
 * the center of the shape. Returns adjusted {start, end} pair.
 */
export function applyAltCenterDraw(
  start: Point,
  end: Point,
  tool: ShapeToolType,
  altHeld: boolean
): { start: Point; end: Point } {
  if (!altHeld) {
    return { start, end };
  }
  if (tool === "rectangle" || tool === "ellipse") {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    return {
      start: { x: start.x - dx, y: start.y - dy },
      end: { x: start.x + dx, y: start.y + dy }
    };
  }
  return { start, end };
}

export function drawShapeOnCtx(
  ctx: CanvasRenderingContext2D,
  tool: ShapeToolType,
  start: Point,
  end: Point,
  settings: ShapeSettings,
  shiftHeld: boolean,
  altHeld: boolean
): void {
  // Apply Alt (draw from center) before constraint
  const centered = applyAltCenterDraw(start, end, tool, altHeld);
  const constrained = constrainEnd(
    centered.start,
    centered.end,
    tool,
    shiftHeld
  );
  const s = centered.start;
  ctx.save();
  ctx.strokeStyle = settings.strokeColor;
  ctx.lineWidth = settings.strokeWidth;
  ctx.fillStyle = settings.fillColor;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (tool) {
    case "rectangle": {
      const x = Math.min(s.x, constrained.x);
      const y = Math.min(s.y, constrained.y);
      const w = Math.abs(constrained.x - s.x);
      const h = Math.abs(constrained.y - s.y);
      if (settings.filled) {
        ctx.fillRect(x, y, w, h);
      }
      ctx.strokeRect(x, y, w, h);
      break;
    }
    case "ellipse": {
      const cx = (s.x + constrained.x) / 2;
      const cy = (s.y + constrained.y) / 2;
      const rx = Math.abs(constrained.x - s.x) / 2;
      const ry = Math.abs(constrained.y - s.y) / 2;
      ctx.beginPath();
      ctx.ellipse(
        cx,
        cy,
        Math.max(rx, 0.1),
        Math.max(ry, 0.1),
        0,
        0,
        Math.PI * 2
      );
      if (settings.filled) {
        ctx.fill();
      }
      ctx.stroke();
      break;
    }
    case "line": {
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(constrained.x, constrained.y);
      ctx.stroke();
      break;
    }
    case "arrow": {
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(constrained.x, constrained.y);
      ctx.stroke();
      const angle = Math.atan2(constrained.y - s.y, constrained.x - s.x);
      const headLen = Math.max(settings.strokeWidth * 3, 10);
      ctx.beginPath();
      ctx.moveTo(constrained.x, constrained.y);
      ctx.lineTo(
        constrained.x - headLen * Math.cos(angle - Math.PI / 6),
        constrained.y - headLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(constrained.x, constrained.y);
      ctx.lineTo(
        constrained.x - headLen * Math.cos(angle + Math.PI / 6),
        constrained.y - headLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

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

    if (filled[y * w + x]) continue;
    if (!colorMatches((y * w + x) * 4)) continue;

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
