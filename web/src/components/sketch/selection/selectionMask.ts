/**
 * Per-pixel selection mask utilities (document space, same size as sketch canvas).
 */

import type { Point, Selection } from "../types";

const THRESH = 128;

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
    const ob = o >= THRESH ? 255 : 0;
    const bb = b >= THRESH ? 255 : 0;
    let v = 0;
    if (op === "add") {
      v = Math.min(255, bb | ob);
    } else if (op === "subtract") {
      v = ob >= THRESH ? 0 : bb;
    } else {
      v = Math.min(bb, ob);
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
  if (targetA < THRESH) {
    return out;
  }
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
 * Clip layer-space context to document selection (offset = document coord of layer 0,0).
 * Uses horizontal span rects per scanline (only within layer canvas).
 */
/**
 * Marching-ants outline on mask edges. `zoom` is the canvas CSS scale so we can
 * draw thicker dashes in document space (~constant size on screen when zoomed out).
 */
export function drawSelectionMaskOutline(
  ctx: CanvasRenderingContext2D,
  mask: Selection,
  phase: number,
  zoom = 1
): void {
  const { width: w, height: h, data } = mask;
  const z = Math.max(0.02, Math.min(zoom, 64));
  const cell = Math.max(1, Math.min(16, Math.ceil(1 / z)));

  if (cell <= 1) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const idx = row + x;
        if (data[idx] < THRESH) {
          continue;
        }
        const edge =
          x === 0 ||
          y === 0 ||
          x === w - 1 ||
          y === h - 1 ||
          data[idx - 1] < THRESH ||
          data[idx + 1] < THRESH ||
          (y > 0 && data[idx - w] < THRESH) ||
          (y < h - 1 && data[idx + w] < THRESH);
        if (!edge) {
          continue;
        }
        const on = ((x + y + phase) >> 2) % 2 === 0;
        ctx.fillStyle = on ? "#ffffff" : "#000000";
        ctx.fillRect(x, y, 1, 1);
      }
    }
    return;
  }

  const drawn = new Set<string>();
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const idx = row + x;
      if (data[idx] < THRESH) {
        continue;
      }
      const edge =
        x === 0 ||
        y === 0 ||
        x === w - 1 ||
        y === h - 1 ||
        data[idx - 1] < THRESH ||
        data[idx + 1] < THRESH ||
        (y > 0 && data[idx - w] < THRESH) ||
        (y < h - 1 && data[idx + w] < THRESH);
      if (!edge) {
        continue;
      }
      const qx = Math.floor(x / cell);
      const qy = Math.floor(y / cell);
      const key = `${qx},${qy}`;
      if (drawn.has(key)) {
        continue;
      }
      drawn.add(key);
      const on = ((qx + qy + phase) & 1) === 0;
      ctx.fillStyle = on ? "#ffffff" : "#000000";
      ctx.fillRect(qx * cell, qy * cell, cell, cell);
    }
  }
}

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
      if (data[rowOff + docX] < THRESH) {
        lx++;
        continue;
      }
      let lx2 = lx + 1;
      while (lx2 < lw) {
        const dx = lx2 + offsetX;
        if (dx >= mw || data[rowOff + dx] < THRESH) {
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
