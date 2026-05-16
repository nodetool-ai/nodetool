/**
 * Per-pixel selection mask utilities (document space).
 * Most masks are canvas-sized with implicit origin (0,0); moved selections may
 * use `originX` / `originY` so buffer pixels keep stable indices.
 */

import type { Point, Selection } from "../types";

const THRESH = 128;
export const MAX_SELECTION_FEATHER_RADIUS = 32;

const ANT_ON = "#aaa";
const ANT_OFF = "#000";

/** Below this zoom (zoomed out), ant stroke uses 2 CSS px width instead of 1. */
const ANTS_WIDE_BELOW_ZOOM = 1;

/**
 * Set up stroke style for marching ants on a screen-resolution canvas.
 * The context already has a document→screen transform applied (scale = zoom).
 * Line width and dash lengths are specified in document coordinates so that
 * after the transform they appear as ~1 (or ~2 when zoomed out) screen pixels
 * wide with ~4px dashes.
 */
function setupScreenAnts(
  ctx: CanvasRenderingContext2D,
  phase: number,
  zoom: number
): { dashLen: number; offset: number } {
  const z = Math.max(0.02, zoom);
  const screenPx = zoom < ANTS_WIDE_BELOW_ZOOM ? 2 : 1;
  const lw = screenPx / z;
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
  offset: number,
  path?: Path2D | null
): void {
  ctx.strokeStyle = ANT_ON;
  ctx.lineDashOffset = offset;
  if (path) {
    ctx.stroke(path);
  } else {
    ctx.stroke();
  }
  ctx.strokeStyle = ANT_OFF;
  ctx.lineDashOffset = offset + dashLen;
  if (path) {
    ctx.stroke(path);
  } else {
    ctx.stroke();
  }
}

/**
 * Wide, solid, semi-transparent strokes on the current path (same edge as ants).
 * Renders in screen space via line widths in document units (÷ zoom).
 * Draw before {@link strokeDualAnts} so the dashed outline stays the true pixel edge.
 */
function strokeSoftOuterSelectionHalo(
  ctx: CanvasRenderingContext2D,
  zoom: number,
  path?: Path2D | null
): void {
  const z = Math.max(0.02, zoom);
  ctx.save();
  ctx.setLineDash([]);
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  const layers: readonly [screenPx: number, rgba: string][] = [
    [10, "rgba(255, 255, 255, 0.05)"],
    [6, "rgba(255, 255, 255, 0.08)"],
    [3, "rgba(30, 30, 38, 0.045)"]
  ];
  for (const [screenPx, rgba] of layers) {
    ctx.lineWidth = screenPx / z;
    ctx.strokeStyle = rgba;
    if (path) {
      ctx.stroke(path);
    } else {
      ctx.stroke();
    }
  }
  ctx.restore();
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
  const out: Selection = {
    width: src.width,
    height: src.height,
    data: new Uint8ClampedArray(src.data)
  };
  if (src.originX != null) {
    out.originX = src.originX;
  }
  if (src.originY != null) {
    out.originY = src.originY;
  }
  return out;
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
    if (sel.data[i] > 0) {
      return true;
    }
  }
  return false;
}

export function selectionHasSoftEdges(sel: Selection | null): boolean {
  if (!validateSelectionMask(sel)) {
    return false;
  }
  for (let i = 0; i < sel.data.length; i++) {
    const value = sel.data[i];
    if (value > 0 && value < 255) {
      return true;
    }
  }
  return false;
}

export function sampleMask(sel: Selection, docX: number, docY: number): number {
  const ox = sel.originX ?? 0;
  const oy = sel.originY ?? 0;
  const bx = docX - ox;
  const by = docY - oy;
  if (bx < 0 || by < 0 || bx >= sel.width || by >= sel.height) {
    return 0;
  }
  return sel.data[by * sel.width + bx];
}

export function selectionHitTest(
  sel: Selection,
  docX: number,
  docY: number
): boolean {
  return sampleMask(sel, Math.floor(docX), Math.floor(docY)) > 0;
}

/** Axis-aligned bounds of pixels with any mask alpha (includes feather tails). */
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
      if (data[row + x] > 0) {
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
  const ox = sel.originX ?? 0;
  const oy = sel.originY ?? 0;
  return {
    x: minX + ox,
    y: minY + oy,
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

/** New mask covering a solid rectangle (rest zero). Uses a sub-rect buffer. */
export function rectSelectionMask(
  canvasW: number,
  canvasH: number,
  x: number,
  y: number,
  rw: number,
  rh: number
): Selection {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(canvasW, Math.ceil(x + rw));
  const y1 = Math.min(canvasH, Math.ceil(y + rh));
  const maskW = x1 - x0;
  const maskH = y1 - y0;
  if (maskW <= 0 || maskH <= 0) {
    return createEmptyMask(1, 1);
  }
  const data = new Uint8ClampedArray(maskW * maskH);
  data.fill(255);
  return { width: maskW, height: maskH, data, originX: x0, originY: y0 };
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

/**
 * Adjust marquee corners from anchor + pointer using standard marquee behavior.
 * - `fromCenter`: first point is the center; pointer is a corner (Alt/Option while dragging).
 * - `constrainSquare`: square / circle bounding box (Shift while dragging).
 */
export function marqueeAdjustedDocPoints(
  anchor: Point,
  pointer: Point,
  opts: { fromCenter: boolean; constrainSquare: boolean }
): { start: Point; end: Point } {
  if (opts.fromCenter) {
    let hx = Math.abs(pointer.x - anchor.x);
    let hy = Math.abs(pointer.y - anchor.y);
    if (opts.constrainSquare) {
      const s = Math.max(hx, hy);
      hx = s;
      hy = s;
    }
    const cx = anchor.x;
    const cy = anchor.y;
    return {
      start: { x: cx - hx, y: cy - hy },
      end: { x: cx + hx, y: cy + hy }
    };
  }
  let ex = pointer.x;
  let ey = pointer.y;
  if (opts.constrainSquare) {
    const dx = ex - anchor.x;
    const dy = ey - anchor.y;
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    const sx = dx >= 0 ? 1 : -1;
    const sy = dy >= 0 ? 1 : -1;
    ex = anchor.x + sx * side;
    ey = anchor.y + sy * side;
  }
  return { start: anchor, end: { x: ex, y: ey } };
}

/** Filled axis-aligned ellipse inside pixel bounds [x,x+rw)×[y,y+rh).
 *  The mask may extend beyond canvas bounds so the marching-ants outline
 *  renders the full ellipse curve instead of clipping to straight edges.
 */
export function ellipseSelectionMask(
  canvasW: number,
  canvasH: number,
  x: number,
  y: number,
  rw: number,
  rh: number
): Selection {
  if (rw < 1 || rh < 1) {
    return createEmptyMask(canvasW, canvasH);
  }
  const cx = x + rw / 2;
  const cy = y + rh / 2;
  const rx = rw / 2;
  const ry = rh / 2;

  // Use the full ellipse bounding box so the outline is not clipped at
  // canvas edges.  originX / originY shift the grid so indices stay positive.
  const bx0 = Math.floor(x);
  const by0 = Math.floor(y);
  const bx1 = Math.ceil(x + rw);
  const by1 = Math.ceil(y + rh);

  const maskW = bx1 - bx0;
  const maskH = by1 - by0;
  const n = maskW * maskH;
  const data = new Uint8ClampedArray(n);

  for (let py = by0; py < by1; py++) {
    const row = (py - by0) * maskW;
    for (let px = bx0; px < bx1; px++) {
      const nx = (px + 0.5 - cx) / rx;
      const ny = (py + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1) {
        data[row + (px - bx0)] = 255;
      }
    }
  }

  return { width: maskW, height: maskH, data, originX: bx0, originY: by0 };
}

export type SelectionCombineOp = "replace" | "add" | "subtract" | "intersect";

/**
 * Rasterize `sel` into a `docW×docH` mask with top-left at document (0,0).
 * Pixels outside the canvas are dropped (combine / invert work on the image).
 */
export function selectionToDocumentAligned(
  sel: Selection,
  docW: number,
  docH: number
): Selection {
  const ox = sel.originX ?? 0;
  const oy = sel.originY ?? 0;
  const out = createEmptyMask(docW, docH);
  const { width: w, height: h, data: s } = sel;
  for (let by = 0; by < h; by++) {
    const dy = oy + by;
    if (dy < 0 || dy >= docH) {
      continue;
    }
    const rowOut = dy * docW;
    const rowS = by * w;
    for (let bx = 0; bx < w; bx++) {
      const v = s[rowS + bx];
      if (v === 0) {
        continue;
      }
      const dx = ox + bx;
      if (dx < 0 || dx >= docW) {
        continue;
      }
      const i = rowOut + dx;
      out.data[i] = Math.max(out.data[i], v);
    }
  }
  return out;
}

export function combineMasks(
  base: Selection | null,
  overlay: Selection,
  op: SelectionCombineOp
): Selection {
  if (op === "replace" || !base || !validateSelectionMask(base)) {
    return cloneSelectionMask(overlay);
  }

  const oox = overlay.originX ?? 0;
  const ooy = overlay.originY ?? 0;
  const box = base.originX ?? 0;
  const boy = base.originY ?? 0;

  // ── Fast path: both masks share the same dimensions and origin ──
  // This is the common case (canvas-sized selections at origin 0,0).
  // Operate directly on typed arrays without union-buffer allocation.
  if (
    box === oox &&
    boy === ooy &&
    base.width === overlay.width &&
    base.height === overlay.height
  ) {
    const n = base.width * base.height;
    const out = new Uint8ClampedArray(n);
    const bd = base.data;
    const od = overlay.data;
    if (op === "add") {
      for (let i = 0; i < n; i++) {
        out[i] = Math.min(255, bd[i] + od[i]);
      }
    } else if (op === "subtract") {
      for (let i = 0; i < n; i++) {
        out[i] = Math.max(0, bd[i] - od[i]);
      }
    } else {
      // intersect
      for (let i = 0; i < n; i++) {
        out[i] = Math.min(bd[i], od[i]);
      }
    }
    return {
      width: base.width,
      height: base.height,
      data: out,
      originX: box,
      originY: boy
    };
  }

  // ── General path: masks may differ in size/origin ──
  // Compute the union bounding box of both masks (they may have different
  // dimensions and origins, e.g. an ellipse that extends beyond canvas).
  const uMinX = Math.min(oox, box);
  const uMinY = Math.min(ooy, boy);
  const uMaxX = Math.max(oox + overlay.width, box + base.width);
  const uMaxY = Math.max(ooy + overlay.height, boy + base.height);
  const uW = uMaxX - uMinX;
  const uH = uMaxY - uMinY;

  const out = createEmptyMask(uW, uH);

  const baseDx = box - uMinX;
  const baseDy = boy - uMinY;

  // For intersect, skip copying base — pixels outside overlay must end up zero.
  // For add/subtract, seed the union buffer with base so overlay pixels mix in.
  if (op !== "intersect") {
    for (let by = 0; by < base.height; by++) {
      const dy = baseDy + by;
      if (dy < 0 || dy >= uH) {
        continue;
      }
      const srcOff = by * base.width;
      const dstOff = dy * uW + baseDx;
      if (baseDx >= 0 && baseDx + base.width <= uW) {
        out.data.set(base.data.subarray(srcOff, srcOff + base.width), dstOff);
      } else {
        for (let bx = 0; bx < base.width; bx++) {
          const dx = baseDx + bx;
          if (dx >= 0 && dx < uW) {
            out.data[dy * uW + dx] = base.data[srcOff + bx];
          }
        }
      }
    }
  }

  // Combine overlay into the union buffer — only iterate overlay rows/cols
  const overlayDx = oox - uMinX;
  const overlayDy = ooy - uMinY;
  for (let oy = 0; oy < overlay.height; oy++) {
    const dy = overlayDy + oy;
    if (dy < 0 || dy >= uH) {
      continue;
    }
    const srcRow = oy * overlay.width;
    const dstRow = dy * uW;
    for (let ox = 0; ox < overlay.width; ox++) {
      const dx = overlayDx + ox;
      if (dx < 0 || dx >= uW) {
        continue;
      }
      const idx = dstRow + dx;
      const o = overlay.data[srcRow + ox];
      let v = 0;
      if (op === "add") {
        v = Math.min(255, out.data[idx] + o);
      } else if (op === "subtract") {
        v = Math.max(0, out.data[idx] - o);
      } else {
        // intersect: sample base directly since we didn't seed it
        const bbx = dx - baseDx;
        const bby = dy - baseDy;
        const bv =
          bbx >= 0 && bbx < base.width && bby >= 0 && bby < base.height
            ? base.data[bby * base.width + bbx]
            : 0;
        v = Math.min(bv, o);
      }
      out.data[idx] = v;
    }
  }

  return {
    width: uW,
    height: uH,
    data: out.data,
    originX: uMinX,
    originY: uMinY
  };
}

/**
 * Trim a selection mask down to the smallest bounding box that still contains
 * any nonzero alpha (including feather tails). Returns `null` when the mask has
 * no active pixels. The trimmed result preserves document placement by adding the
 * trimmed offset to `originX` / `originY`.
 */
export function trimSelectionMask(sel: Selection | null): Selection | null {
  if (!validateSelectionMask(sel) || !selectionHasAnyPixels(sel)) {
    return null;
  }
  const { width, height, data } = sel;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (data[row + x] === 0) {
        continue;
      }
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

  if (maxX < minX || maxY < minY) {
    return null;
  }

  const trimmedWidth = maxX - minX + 1;
  const trimmedHeight = maxY - minY + 1;
  const trimmed = new Uint8ClampedArray(trimmedWidth * trimmedHeight);
  for (let y = 0; y < trimmedHeight; y++) {
    const srcOffset = (minY + y) * width + minX;
    const dstOffset = y * trimmedWidth;
    trimmed.set(data.subarray(srcOffset, srcOffset + trimmedWidth), dstOffset);
  }

  return {
    width: trimmedWidth,
    height: trimmedHeight,
    data: trimmed,
    originX: (sel.originX ?? 0) + minX,
    originY: (sel.originY ?? 0) + minY
  };
}

export function invertMaskInPlace(mask: Selection): void {
  for (let i = 0; i < mask.data.length; i++) {
    mask.data[i] = 255 - mask.data[i];
  }
}

/**
 * Shift mask pixels inside a fixed buffer; anything that falls outside is lost.
 * For moving the user’s selection, prefer {@link offsetSelectionByDocumentDelta}.
 */
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
 * Move the selection in document space without rewriting `data` (preserves
 * regions that extend past the canvas edges).
 */
export function offsetSelectionByDocumentDelta(
  src: Selection,
  dx: number,
  dy: number
): Selection {
  return {
    width: src.width,
    height: src.height,
    data: new Uint8ClampedArray(src.data),
    originX: (src.originX ?? 0) + dx,
    originY: (src.originY ?? 0) + dy
  };
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

/**
 * Non-contiguous magic wand: selects ALL pixels whose color is within tolerance of
 * the seed pixel, regardless of adjacency. Uses the same perceptual distance as
 * `magicWandFromRgba`. Returns binary mask (0 / 255), same dimensions as imageData.
 */
export function magicWandNonContiguousFromRgba(
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
  const n = w * h;
  for (let i = 0; i < n; i++) {
    const pi = i * 4;
    const dr = d[pi] - targetR;
    const dg = d[pi + 1] - targetG;
    const db = d[pi + 2] - targetB;
    const da = d[pi + 3] - targetA;
    if (dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114 + da * da * 0.5 <= tol2) {
      out[i] = 255;
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
  const ctx = c.getContext("2d", { willReadFrequently: true });
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

/**
 * Approximate Gaussian feather via repeated box blur.
 * Values are clamped to 0–255 without peak renormalization (Photoshop-like:
 * thin selections stay softer in the middle instead of being contrast-stretched).
 */
export function featherMaskAlpha(mask: Selection, radiusPx: number): void {
  const requestedRadius = Math.max(
    0,
    Math.min(MAX_SELECTION_FEATHER_RADIUS, Math.round(radiusPx))
  );
  if (requestedRadius <= 0) {
    return;
  }
  const passes = 3;
  // Repeated box blurs compound quickly; a smaller per-pass radius keeps the
  // visible feather closer to the slider value instead of washing far outward.
  const blurRadius = Math.max(1, Math.round(requestedRadius / 2));
  const { width: w, height: h, data } = mask;
  const n = w * h;
  const tmp = new Float32Array(n);
  const cur = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    cur[i] = data[i];
  }
  for (let p = 0; p < passes; p++) {
    horizontalBoxBlurFloat(cur, tmp, w, h, blurRadius);
    verticalBoxBlurFloat(tmp, cur, w, h, blurRadius);
  }
  for (let i = 0; i < n; i++) {
    data[i] = Math.max(0, Math.min(255, Math.round(cur[i])));
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
      if (x >= 0 && x < w) {
        sum += src[row + x];
      }
    }
    for (let x = 0; x < w; x++) {
      dst[row + x] = sum / diam;
      const xOut = x - r;
      const xIn = x + r + 1;
      const vOut =
        xOut < 0 || xOut >= w ? 0 : src[row + xOut];
      const vIn =
        xIn < 0 || xIn >= w ? 0 : src[row + xIn];
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
      if (y >= 0 && y < h) {
        sum += src[y * w + x];
      }
    }
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = sum / diam;
      const yOut = y - r;
      const yIn = y + r + 1;
      const vOut =
        yOut < 0 || yOut >= h ? 0 : src[yOut * w + x];
      const vIn =
        yIn < 0 || yIn >= h ? 0 : src[yIn * w + x];
      sum += vIn - vOut;
    }
  }
}

/**
 * Grow (expand) the selection by `radiusPx` pixels using a two-pass sliding
 * maximum (Chebyshev / square structuring element — close to circular for
 * radii ≤ 20px and fast regardless of canvas size).
 * Mutates `mask` in place.
 */
export function expandSelectionMask(mask: Selection, radiusPx: number): void {
  const r = Math.max(0, Math.round(radiusPx));
  if (r <= 0) return;
  const { width: w, height: h, data } = mask;
  const tmp = new Uint8ClampedArray(w * h);

  // Horizontal sliding max
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let maxVal = 0;
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      for (let xx = x0; xx <= x1; xx++) {
        const v = data[row + xx];
        if (v > maxVal) maxVal = v;
        if (maxVal === 255) break;
      }
      tmp[row + x] = maxVal;
    }
  }
  // Vertical sliding max
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let maxVal = 0;
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(h - 1, y + r);
      for (let yy = y0; yy <= y1; yy++) {
        const v = tmp[yy * w + x];
        if (v > maxVal) maxVal = v;
        if (maxVal === 255) break;
      }
      data[y * w + x] = maxVal;
    }
  }
}

/**
 * Shrink (contract) the selection by `radiusPx` pixels using a two-pass
 * sliding minimum.  Mutates `mask` in place.
 */
export function contractSelectionMask(mask: Selection, radiusPx: number): void {
  const r = Math.max(0, Math.round(radiusPx));
  if (r <= 0) return;
  const { width: w, height: h, data } = mask;
  const tmp = new Uint8ClampedArray(w * h);

  // Horizontal sliding min
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let minVal = 255;
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      for (let xx = x0; xx <= x1; xx++) {
        const v = data[row + xx];
        if (v < minVal) minVal = v;
        if (minVal === 0) break;
      }
      tmp[row + x] = minVal;
    }
  }
  // Vertical sliding min
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let minVal = 255;
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(h - 1, y + r);
      for (let yy = y0; yy <= y1; yy++) {
        const v = tmp[yy * w + x];
        if (v < minVal) minVal = v;
        if (minVal === 0) break;
      }
      data[y * w + x] = minVal;
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
 * Marching ants ellipse outline for live preview (not clipped to canvas).
 * Draws directly as a canvas path so the ellipse can extend beyond document
 * bounds — unlike ellipseSelectionMask which clips to canvas dimensions.
 * Expects a context with a document→screen transform already applied.
 */
export function drawSelectionEllipseOutline(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  phase: number,
  zoom = 1
): void {
  if (w < 1 || h < 1) {
    return;
  }
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  strokeSoftOuterSelectionHalo(ctx, zoom, null);
  const { dashLen, offset } = setupScreenAnts(ctx, phase, zoom);
  strokeDualAnts(ctx, dashLen, offset, null);
  ctx.restore();
}

/**
 * Marching ants rectangular outline for live marquee preview (cheap path;
 * avoids scanning a full-document binary mask).
 */
export function drawSelectionRectOutline(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  phase: number,
  zoom = 1
): void {
  if (w < 1 || h < 1) {
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  strokeSoftOuterSelectionHalo(ctx, zoom, null);
  const { dashLen, offset } = setupScreenAnts(ctx, phase, zoom);
  strokeDualAnts(ctx, dashLen, offset, null);
  ctx.restore();
}

/**
 * Marching ants along an open polyline (lasso in progress).
 * Expects a context with a document→screen transform already applied so that
 * strokes render at screen resolution (~1px, ~2px when zoomed out), with a soft
 * outer halo behind the dashed outline.
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
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  strokeSoftOuterSelectionHalo(ctx, zoom);
  const { dashLen, offset } = setupScreenAnts(ctx, phase, zoom);
  strokeDualAnts(ctx, dashLen, offset);
  ctx.restore();
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
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return;
  }
  const cw = canvas.width;
  const ch = canvas.height;
  const { width: mw, height: mh, data: mdata } = mask;
  const mox = mask.originX ?? 0;
  const moy = mask.originY ?? 0;
  const imgData = ctx.getImageData(0, 0, cw, ch);
  const pixels = imgData.data;

  for (let ly = 0; ly < ch; ly++) {
    const docY = ly + offsetY;
    const by = docY - moy;
    const inY = by >= 0 && by < mh;
    const rowOff = inY ? by * mw : 0;
    for (let lx = 0; lx < cw; lx++) {
      const docX = lx + offsetX;
      const bx = docX - mox;
      let maskVal: number;
      if (inY && bx >= 0 && bx < mw) {
        maskVal = mdata[rowOff + bx];
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
 * Blend the current canvas pixels with `originalData` using `mask` as a lerp.
 * Pixels outside the selection are restored to their original values; pixels
 * inside are kept as modified. Used for destructive tools (blur, clone stamp)
 * that alter existing pixel colors rather than compositing new paint on top.
 */
export function applySelectionBlendRestore(
  canvas: HTMLCanvasElement,
  originalData: ImageData,
  mask: Selection,
  offsetX: number,
  offsetY: number
): void {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return;
  }
  const cw = canvas.width;
  const ch = canvas.height;
  const { data: mdata, width: mw, height: mh } = mask;
  const mox = mask.originX ?? 0;
  const moy = mask.originY ?? 0;
  const imgData = ctx.getImageData(0, 0, cw, ch);
  const m = imgData.data;
  const o = originalData.data;

  for (let ly = 0; ly < ch; ly++) {
    const by = ly + offsetY - moy;
    const inY = by >= 0 && by < mh;
    const rowOff = inY ? by * mw : 0;
    for (let lx = 0; lx < cw; lx++) {
      const bx = lx + offsetX - mox;
      let maskVal = 0;
      if (inY && bx >= 0 && bx < mw) {
        maskVal = mdata[rowOff + bx];
      }
      if (maskVal === 255) continue;
      const pi = (ly * cw + lx) * 4;
      if (maskVal === 0) {
        m[pi]     = o[pi];
        m[pi + 1] = o[pi + 1];
        m[pi + 2] = o[pi + 2];
        m[pi + 3] = o[pi + 3];
      } else {
        // Premultiplied-alpha lerp. A straight-RGBA lerp produces dark
        // fringes wherever one side is transparent: at a feather edge with
        // `o` = transparent (0,0,0,0) and `m` = fully-opaque stroke
        // (R,G,B,255) the straight lerp at t=0.5 yields (R/2, G/2, B/2, 128),
        // i.e. half-bright color at half opacity → composited result is
        // visibly darker than the intended "stroke at 50% opacity". Lerping
        // in premultiplied space (then un-premultiplying) keeps the color
        // intensity correct and only blends opacity through the feather.
        const t = maskVal / 255;
        const t1 = 1 - t;
        const ma = m[pi + 3];
        const oa = o[pi + 3];
        const mpr = m[pi]     * ma;
        const mpg = m[pi + 1] * ma;
        const mpb = m[pi + 2] * ma;
        const opr = o[pi]     * oa;
        const opg = o[pi + 1] * oa;
        const opb = o[pi + 2] * oa;
        const ra = ma * t + oa * t1;
        const rpr = mpr * t + opr * t1;
        const rpg = mpg * t + opg * t1;
        const rpb = mpb * t + opb * t1;
        if (ra > 0) {
          m[pi]     = (rpr / ra + 0.5) | 0;
          m[pi + 1] = (rpg / ra + 0.5) | 0;
          m[pi + 2] = (rpb / ra + 0.5) | 0;
        } else {
          m[pi]     = 0;
          m[pi + 1] = 0;
          m[pi + 2] = 0;
        }
        m[pi + 3] = (ra + 0.5) | 0;
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

function binaryDilateOnce8(
  width: number,
  height: number,
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (src[i] >= THRESH) {
        dst[i] = 255;
        continue;
      }
      let on = false;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) {
          continue;
        }
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) {
            continue;
          }
          if (src[yy * width + xx] >= THRESH) {
            on = true;
            break;
          }
        }
        if (on) {
          break;
        }
      }
      dst[i] = on ? 255 : 0;
    }
  }
}

function binaryErodeOnce8(
  width: number,
  height: number,
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (src[i] < THRESH) {
        dst[i] = 0;
        continue;
      }
      let all = true;
      outer: for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) {
          all = false;
          break;
        }
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width || src[yy * width + xx] < THRESH) {
            all = false;
            break outer;
          }
        }
      }
      dst[i] = all ? 255 : 0;
    }
  }
}

function morphBinary8(
  width: number,
  height: number,
  srcBinary: Uint8ClampedArray,
  iterations: number,
  mode: "dilate" | "erode"
): Uint8ClampedArray {
  const n = width * height;
  let read = new Uint8ClampedArray(srcBinary);
  if (iterations <= 0) {
    return read;
  }
  let write = new Uint8ClampedArray(n);
  const op = mode === "dilate" ? binaryDilateOnce8 : binaryErodeOnce8;
  for (let k = 0; k < iterations; k++) {
    op(width, height, read, write);
    const tmp = read;
    read = write;
    write = tmp;
  }
  return read;
}

/**
 * Ring mask along the selection boundary (~`strokeWidthPx` wide, morphological
 * dilate/erode band). Document space; same dimensions as `sel`. Use as the new
 * selection so only the outline is selected, or for other mask ops. Returns null if empty.
 */
export function buildSelectionBorderStrokeMask(
  sel: Selection,
  strokeWidthPx: number
): Selection | null {
  if (!validateSelectionMask(sel) || !selectionHasAnyPixels(sel)) {
    return null;
  }
  const wPx = Math.max(1, Math.min(64, Math.round(strokeWidthPx)));
  const { width: w, height: h, data } = sel;
  const n = w * h;
  const orig = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    orig[i] = data[i] >= THRESH ? 255 : 0;
  }
  const rOut = Math.ceil(wPx / 2);
  const rIn = Math.floor(wPx / 2);
  const outer = morphBinary8(w, h, orig, rOut, "dilate");
  const inner = morphBinary8(w, h, orig, rIn, "erode");
  const strokeData = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    strokeData[i] = outer[i] >= THRESH && inner[i] < THRESH ? 255 : 0;
  }
  if (!selectionHasAnyPixels({ width: w, height: h, data: strokeData })) {
    return null;
  }
  const ring: Selection = { width: w, height: h, data: strokeData };
  if (sel.originX != null) {
    ring.originX = sel.originX;
  }
  if (sel.originY != null) {
    ring.originY = sel.originY;
  }
  return ring;
}
