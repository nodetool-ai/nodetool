/**
 * Per-pixel selection mask utilities (document space, same size as sketch canvas).
 */

import type { Point, Selection } from "../types";

const THRESH = 128;

const ANT_ON = "#aaa";
const ANT_OFF = "#000";

/**
 * Set up stroke style for marching ants on a screen-resolution canvas.
 * The context already has a document→screen transform applied (scale = zoom).
 * Line width and dash lengths are specified in document coordinates so that
 * after the transform they appear as ~1 screen pixel wide with ~4px dashes.
 */
function setupScreenAnts(
  ctx: CanvasRenderingContext2D,
  phase: number,
  zoom: number
): { dashLen: number; offset: number } {
  const z = Math.max(0.02, zoom);
  const lw = 1 / z;
  const dashLen = 4 / z;
  const offset = -((phase % 256) / 32) * dashLen * 2;
  ctx.lineWidth = lw;
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  ctx.setLineDash([dashLen, dashLen]);
  return { dashLen, offset };
}

function strokeDualAnts(
  ctx: CanvasRenderingContext2D,
  dashLen: number,
  offset: number
): void {
  ctx.strokeStyle = ANT_ON;
  ctx.lineDashOffset = offset;
  ctx.stroke();
  ctx.strokeStyle = ANT_OFF;
  ctx.lineDashOffset = offset + dashLen;
  ctx.stroke();
}

export function createEmptyMask(width: number, height: number): Selection {
  const n = width * height;
  return {
    width,
    height,
    data: new Uint8ClampedArray(n)
  };
}

export function cloneSelectionMask(src: Selection): Selection {
  return {
    width: src.width,
    height: src.height,
    data: new Uint8ClampedArray(src.data)
  };
}

export function selectionMaskByteLength(sel: Selection): number {
  return sel.width * sel.height;
}

export function validateSelectionMask(sel: Selection | null): sel is Selection {
  if (!sel) {
    return false;
  }
  return (
    sel.width > 0 &&
    sel.height > 0 &&
    sel.data.length === sel.width * sel.height
  );
}

export function selectionHasAnyPixels(sel: Selection | null): boolean {
  if (!validateSelectionMask(sel)) {
    return false;
  }
  for (let i = 0; i < sel.data.length; i++) {
    if (sel.data[i] >= THRESH) {
      return true;
    }
  }
  return false;
}

export function sampleMask(sel: Selection, docX: number, docY: number): number {
  if (
    docX < 0 ||
    docY < 0 ||
    docX >= sel.width ||
    docY >= sel.height
  ) {
    return 0;
  }
  return sel.data[docY * sel.width + docX];
}

export function selectionHitTest(
  sel: Selection,
  docX: number,
  docY: number
): boolean {
  return sampleMask(sel, Math.floor(docX), Math.floor(docY)) >= THRESH;
}

/** Axis-aligned bounds of pixels with alpha ≥ threshold. */
export function getSelectionBounds(
  sel: Selection
): { x: number; y: number; width: number; height: number } | null {
  if (!validateSelectionMask(sel)) {
    return null;
  }
  const { width: w, height: h, data } = sel;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (data[row + x] >= THRESH) {
        if (x < minX) {
          minX = x;
        }
        if (y < minY) {
          minY = y;
        }
        if (x > maxX) {
          maxX = x;
        }
        if (y > maxY) {
          maxY = y;
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

export function fillRectMask(
  mask: Selection,
  x: number,
  y: number,
  rw: number,
  rh: number,
  value: number
): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(mask.width, Math.ceil(x + rw));
  const y1 = Math.min(mask.height, Math.ceil(y + rh));
  const v = Math.max(0, Math.min(255, Math.round(value)));
  for (let py = y0; py < y1; py++) {
    const row = py * mask.width;
    for (let px = x0; px < x1; px++) {
      mask.data[row + px] = v;
    }
  }
}

/** New mask covering a solid rectangle (rest zero). */
export function rectSelectionMask(
  canvasW: number,
  canvasH: number,
  x: number,
  y: number,
  rw: number,
  rh: number
): Selection {
  const m = createEmptyMask(canvasW, canvasH);
  fillRectMask(m, x, y, rw, rh, 255);
  return m;
}

/**
 * Pixel-aligned marquee bounds in document space from two drag endpoints.
 * Matches {@link fillRectMask}: every pixel that intersects the continuous
 * axis-aligned box between the two points is included. Use for preview and
 * commit so marching ants do not shift on pointer up.
 */
export function marqueeRectFromDocPoints(start: Point, end: Point): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const minX = Math.min(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxX = Math.max(start.x, end.x);
  const maxY = Math.max(start.y, end.y);
  const x = Math.floor(minX);
  const y = Math.floor(minY);
  const w = Math.ceil(maxX) - x;
  const h = Math.ceil(maxY) - y;
  return { x, y, w, h };
}

export type SelectionCombineOp = "replace" | "add" | "subtract" | "intersect";

export function combineMasks(
  base: Selection | null,
  overlay: Selection,
  op: SelectionCombineOp
): Selection {
  if (op === "replace" || !base || !validateSelectionMask(base)) {
    return cloneSelectionMask(overlay);
  }
  if (base.width !== overlay.width || base.height !== overlay.height) {
    return cloneSelectionMask(overlay);
  }
  const out = cloneSelectionMask(base);
  const n = out.data.length;
  for (let i = 0; i < n; i++) {
    const b = out.data[i];
    const o = overlay.data[i];
    let v = 0;
    if (op === "add") {
      v = Math.min(255, b + o);
    } else if (op === "subtract") {
      v = Math.max(0, b - o);
    } else {
      v = Math.min(b, o);
    }
    out.data[i] = v;
  }
  return out;
}

export function invertMaskInPlace(mask: Selection): void {
  for (let i = 0; i < mask.data.length; i++) {
    mask.data[i] = 255 - mask.data[i];
  }
}

export function translateMask(
  src: Selection,
  dx: number,
  dy: number
): Selection {
  const out = createEmptyMask(src.width, src.height);
  const { width: w, height: h, data: s } = src;
  for (let y = 0; y < h; y++) {
    const sy = y - dy;
    if (sy < 0 || sy >= h) {
      continue;
    }
    for (let x = 0; x < w; x++) {
      const sx = x - dx;
      if (sx < 0 || sx >= w) {
        continue;
      }
      out.data[y * w + x] = s[sy * w + sx];
    }
  }
  return out;
}

/**
 * Flood region on RGBA image (same perceptual tolerance as fill tool).
 * Returns binary mask (0 / 255), same dimensions as imageData.
 */
export function magicWandFromRgba(
  imageData: ImageData,
  seedX: number,
  seedY: number,
  tolerance: number
): Uint8ClampedArray {
  const w = imageData.width;
  const h = imageData.height;
  const d = imageData.data;
  const out = new Uint8ClampedArray(w * h);
  const sx = Math.round(seedX);
  const sy = Math.round(seedY);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) {
    return out;
  }
  const idx0 = (sy * w + sx) * 4;
  const targetR = d[idx0];
  const targetG = d[idx0 + 1];
  const targetB = d[idx0 + 2];
  const targetA = d[idx0 + 3];
  const tol = Math.max(0, Math.min(255, tolerance));
  const tol2 = tol * tol;
  const colorMatches = (i: number): boolean => {
    const dr = d[i] - targetR;
    const dg = d[i + 1] - targetG;
    const db = d[i + 2] - targetB;
    const da = d[i + 3] - targetA;
    return (
      dr * dr * 0.299 +
        dg * dg * 0.587 +
        db * db * 0.114 +
        da * da * 0.5 <=
      tol2
    );
  };
  const filled = new Uint8Array(w * h);
  const stack: number[] = [sx, sy];
  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    if (filled[y * w + x]) {
      continue;
    }
    if (!colorMatches((y * w + x) * 4)) {
      continue;
    }
    let x1 = x;
    while (x1 > 0 && !filled[y * w + x1 - 1] && colorMatches((y * w + x1 - 1) * 4)) {
      x1--;
    }
    let x2 = x;
    while (
      x2 < w - 1 &&
      !filled[y * w + x2 + 1] &&
      colorMatches((y * w + x2 + 1) * 4)
    ) {
      x2++;
    }
    const rowBase = y * w;
    for (let xi = x1; xi <= x2; xi++) {
      filled[rowBase + xi] = 1;
      out[rowBase + xi] = 255;
    }
    if (y > 0) {
      let inSpan = false;
      for (let xi = x1; xi <= x2; xi++) {
        const pi = (y - 1) * w + xi;
        if (!filled[pi] && colorMatches(pi * 4)) {
          if (!inSpan) {
            stack.push(xi, y - 1);
            inSpan = true;
          }
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
          if (!inSpan) {
            stack.push(xi, y + 1);
            inSpan = true;
          }
        } else {
          inSpan = false;
        }
      }
    }
  }
  return out;
}

export function writeBinaryIntoMask(
  mask: Selection,
  binary: Uint8ClampedArray,
  op: SelectionCombineOp
): void {
  if (binary.length !== mask.data.length) {
    return;
  }
  if (op === "replace") {
    mask.data.set(binary);
    return;
  }
  const n = mask.data.length;
  for (let i = 0; i < n; i++) {
    const b = mask.data[i] >= THRESH ? 255 : 0;
    const o = binary[i] >= THRESH ? 255 : 0;
    let v = 0;
    if (op === "add") {
      v = Math.min(255, b | o);
    } else if (op === "subtract") {
      v = o >= THRESH ? 0 : b;
    } else {
      v = Math.min(b, o);
    }
    mask.data[i] = v;
  }
}

/** Rasterize closed polygon into a scratch mask (canvas fill), then returns binary buffer. */
export function polygonToBinaryMask(
  canvasW: number,
  canvasH: number,
  points: Point[]
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(canvasW * canvasH);
  if (points.length < 3) {
    return out;
  }
  const c = document.createElement("canvas");
  c.width = canvasW;
  c.height = canvasH;
  const ctx = c.getContext("2d");
  if (!ctx) {
    return out;
  }
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.fill();
  const id = ctx.getImageData(0, 0, canvasW, canvasH);
  for (let i = 0; i < out.length; i++) {
    out[i] = id.data[i * 4 + 3] >= THRESH ? 255 : 0;
  }
  return out;
}

/** Approximate Gaussian feather via repeated box blur + renormalize peaks to 255. */
export function featherMaskAlpha(mask: Selection, radiusPx: number): void {
  const r = Math.max(0, Math.min(64, Math.round(radiusPx)));
  if (r <= 0) {
    return;
  }
  const passes = 3;
  const { width: w, height: h, data } = mask;
  const n = w * h;
  const tmp = new Float32Array(n);
  const cur = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    cur[i] = data[i];
  }
  for (let p = 0; p < passes; p++) {
    horizontalBoxBlurFloat(cur, tmp, w, h, r);
    verticalBoxBlurFloat(tmp, cur, w, h, r);
  }
  let peak = 0;
  for (let i = 0; i < n; i++) {
    if (cur[i] > peak) {
      peak = cur[i];
    }
  }
  const scale = peak > 1e-6 ? 255 / peak : 0;
  for (let i = 0; i < n; i++) {
    data[i] = Math.max(0, Math.min(255, Math.round(cur[i] * scale)));
  }
}

function horizontalBoxBlurFloat(
  src: Float32Array,
  dst: Float32Array,
  w: number,
  h: number,
  r: number
): void {
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    const diam = r * 2 + 1;
    for (let x = -r; x <= r; x++) {
      const cx = Math.max(0, Math.min(w - 1, x));
      sum += src[row + cx];
    }
    for (let x = 0; x < w; x++) {
      dst[row + x] = sum / diam;
      const xOut = x - r;
      const xIn = x + r + 1;
      const vOut =
        xOut < 0 ? src[row] : src[row + Math.min(w - 1, xOut)];
      const vIn =
        xIn >= w ? src[row + w - 1] : src[row + xIn];
      sum += vIn - vOut;
    }
  }
}

function verticalBoxBlurFloat(
  src: Float32Array,
  dst: Float32Array,
  w: number,
  h: number,
  r: number
): void {
  const diam = r * 2 + 1;
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) {
      const cy = Math.max(0, Math.min(h - 1, y));
      sum += src[cy * w + x];
    }
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = sum / diam;
      const yOut = y - r;
      const yIn = y + r + 1;
      const vOut =
        yOut < 0 ? src[x] : src[Math.min(h - 1, yOut) * w + x];
      const vIn =
        yIn >= h ? src[(h - 1) * w + x] : src[yIn * w + x];
      sum += vIn - vOut;
    }
  }
}

/** Mild edge smoothing: blur then re-threshold. */
export function smoothSelectionBorders(mask: Selection, strength: number): void {
  const s = Math.max(1, Math.min(8, Math.round(strength)));
  featherMaskAlpha(mask, s);
  for (let i = 0; i < mask.data.length; i++) {
    mask.data[i] = mask.data[i] >= THRESH ? 255 : 0;
  }
}

/**
 * Marching ants along an open polyline (lasso in progress).
 * Expects a context with a document→screen transform already applied so that
 * strokes render at screen resolution (crisp 1px lines at any zoom).
 */
export function drawSelectionPolylineOutline(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  phase: number,
  zoom = 1
): void {
  if (points.length < 2) {
    return;
  }
  ctx.save();
  const { dashLen, offset } = setupScreenAnts(ctx, phase, zoom);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  strokeDualAnts(ctx, dashLen, offset);
  ctx.restore();
}

/**
 * Marching ants on mask boundary edges.
 * Traces horizontal and vertical pixel-boundary contour segments (merged into
 * runs) and strokes them.  Expects a context with a document→screen transform
 * so lines render at screen pixel resolution regardless of zoom.
 */
export function drawSelectionMaskOutline(
  ctx: CanvasRenderingContext2D,
  mask: Selection,
  phase: number,
  zoom = 1
): void {
  const { width: w, height: h, data } = mask;

  ctx.save();
  const { dashLen, offset } = setupScreenAnts(ctx, phase, zoom);

  ctx.beginPath();

  for (let y = 0; y <= h; y++) {
    let runStart = -1;
    for (let x = 0; x < w; x++) {
      const above = y > 0 && data[(y - 1) * w + x] >= THRESH;
      const below = y < h && data[y * w + x] >= THRESH;
      if (above !== below) {
        if (runStart < 0) {
          runStart = x;
        }
      } else if (runStart >= 0) {
        ctx.moveTo(runStart, y);
        ctx.lineTo(x, y);
        runStart = -1;
      }
    }
    if (runStart >= 0) {
      ctx.moveTo(runStart, y);
      ctx.lineTo(w, y);
    }
  }

  for (let x = 0; x <= w; x++) {
    let runStart = -1;
    for (let y = 0; y < h; y++) {
      const left = x > 0 && data[y * w + x - 1] >= THRESH;
      const right = x < w && data[y * w + x] >= THRESH;
      if (left !== right) {
        if (runStart < 0) {
          runStart = y;
        }
      } else if (runStart >= 0) {
        ctx.moveTo(x, runStart);
        ctx.lineTo(x, y);
        runStart = -1;
      }
    }
    if (runStart >= 0) {
      ctx.moveTo(x, runStart);
      ctx.lineTo(x, h);
    }
  }

  strokeDualAnts(ctx, dashLen, offset);
  ctx.restore();
}

/**
 * Clip layer-space context to document selection.
 * Uses `> 0` threshold so feathered edges (values 1–254) are included in the
 * clip region.  The actual alpha modulation for feathered edges happens at
 * stroke commit time via `applySelectionMaskAlpha`.
 */
export function clipContextToSelectionMask(
  ctx: CanvasRenderingContext2D,
  mask: Selection,
  offsetX: number,
  offsetY: number
): void {
  const lw = ctx.canvas.width;
  const lh = ctx.canvas.height;
  const { width: mw, height: mh, data } = mask;
  ctx.save();
  ctx.beginPath();
  for (let ly = 0; ly < lh; ly++) {
    const docY = ly + offsetY;
    if (docY < 0 || docY >= mh) {
      continue;
    }
    const rowOff = docY * mw;
    let lx = 0;
    while (lx < lw) {
      const docX = lx + offsetX;
      if (docX < 0 || docX >= mw) {
        lx++;
        continue;
      }
      if (data[rowOff + docX] === 0) {
        lx++;
        continue;
      }
      let lx2 = lx + 1;
      while (lx2 < lw) {
        const dx = lx2 + offsetX;
        if (dx >= mw || data[rowOff + dx] === 0) {
          break;
        }
        lx2++;
      }
      ctx.rect(lx, ly, lx2 - lx, 1);
      lx = lx2;
    }
  }
  ctx.clip();
}

/**
 * Modulate canvas pixel alpha by the selection mask.
 * For each pixel, alpha is multiplied by `mask_value / 255`.
 * Fully selected pixels (255) are unchanged; feathered edges get proportionally
 * transparent; outside pixels (0) are erased.
 */
export function applySelectionMaskAlpha(
  canvas: HTMLCanvasElement,
  mask: Selection,
  offsetX: number,
  offsetY: number
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const cw = canvas.width;
  const ch = canvas.height;
  const { width: mw, height: mh, data: mdata } = mask;
  const imgData = ctx.getImageData(0, 0, cw, ch);
  const pixels = imgData.data;

  for (let ly = 0; ly < ch; ly++) {
    const docY = ly + offsetY;
    const inBounds = docY >= 0 && docY < mh;
    const rowOff = inBounds ? docY * mw : 0;
    for (let lx = 0; lx < cw; lx++) {
      const docX = lx + offsetX;
      let maskVal: number;
      if (inBounds && docX >= 0 && docX < mw) {
        maskVal = mdata[rowOff + docX];
      } else {
        maskVal = 0;
      }
      if (maskVal === 255) {
        continue;
      }
      const pi = (ly * cw + lx) * 4 + 3;
      if (maskVal === 0) {
        pixels[pi] = 0;
      } else {
        pixels[pi] = (pixels[pi] * maskVal + 127) / 255 | 0;
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

/**
 * Draw `buffer` into `targetCtx` (caller sets globalAlpha / compositeOp).
 * When `preview` is set and the mask has pixels, copies through a reusable
 * scratch canvas and runs `applySelectionMaskAlpha` so the preview matches commit.
 */
export function drawStrokeBufferForDisplayWithSelectionFeather(
  targetCtx: CanvasRenderingContext2D,
  buffer: HTMLCanvasElement,
  preview: { mask: Selection; offsetX: number; offsetY: number } | null | undefined,
  scratch: HTMLCanvasElement | null
): HTMLCanvasElement | null {
  const w = buffer.width;
  const h = buffer.height;
  const useFeather =
    preview != null &&
    preview.mask != null &&
    selectionHasAnyPixels(preview.mask);

  if (!useFeather) {
    targetCtx.drawImage(buffer, 0, 0);
    return scratch;
  }

  let sc = scratch;
  if (!sc || sc.width !== w || sc.height !== h) {
    sc = document.createElement("canvas");
    sc.width = w;
    sc.height = h;
  }
  const sctx = sc.getContext("2d");
  if (!sctx) {
    targetCtx.drawImage(buffer, 0, 0);
    return scratch;
  }
  sctx.clearRect(0, 0, w, h);
  sctx.drawImage(buffer, 0, 0);
  applySelectionMaskAlpha(sc, preview.mask, preview.offsetX, preview.offsetY);
  targetCtx.drawImage(sc, 0, 0);
  return sc;
}
