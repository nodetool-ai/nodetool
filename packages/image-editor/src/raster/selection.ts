/**
 * Pixel selection masks. Origins may sit off (0, 0) so a small overlay
 * can combine with a canvas-sized base.
 */

export interface RasterSelection {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  originX?: number;
  originY?: number;
}

export type SelectionCombineMode = "replace" | "add" | "subtract" | "intersect";

export function emptySelection(width: number, height: number): RasterSelection {
  return { width, height, data: new Uint8ClampedArray(width * height) };
}

export function rectSelection(
  canvasW: number,
  canvasH: number,
  x: number,
  y: number,
  w: number,
  h: number
): RasterSelection {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(canvasW, Math.ceil(x + w));
  const y1 = Math.min(canvasH, Math.ceil(y + h));
  const mw = x1 - x0;
  const mh = y1 - y0;
  if (mw <= 0 || mh <= 0) {
    return emptySelection(1, 1);
  }
  const data = new Uint8ClampedArray(mw * mh);
  data.fill(255);
  return { width: mw, height: mh, data, originX: x0, originY: y0 };
}

export function ellipseSelection(
  canvasW: number,
  canvasH: number,
  x: number,
  y: number,
  w: number,
  h: number
): RasterSelection {
  if (w < 1 || h < 1) {
    return emptySelection(canvasW, canvasH);
  }
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const bx0 = Math.max(0, Math.floor(x));
  const by0 = Math.max(0, Math.floor(y));
  const bx1 = Math.min(canvasW, Math.ceil(x + w));
  const by1 = Math.min(canvasH, Math.ceil(y + h));
  const mw = bx1 - bx0;
  const mh = by1 - by0;
  if (mw <= 0 || mh <= 0) {
    return emptySelection(1, 1);
  }
  const data = new Uint8ClampedArray(mw * mh);
  for (let py = by0; py < by1; py += 1) {
    const row = (py - by0) * mw;
    for (let px = bx0; px < bx1; px += 1) {
      const nx = (px + 0.5 - cx) / rx;
      const ny = (py + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1) {
        data[row + (px - bx0)] = 255;
      }
    }
  }
  return { width: mw, height: mh, data, originX: bx0, originY: by0 };
}

function pointInPolygon(
  x: number,
  y: number,
  points: ReadonlyArray<{ x: number; y: number }>
): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    if (yi === yj) {
      continue;
    }
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

export function polygonSelection(
  canvasW: number,
  canvasH: number,
  points: ReadonlyArray<{ x: number; y: number }>
): RasterSelection {
  if (points.length < 3) {
    return emptySelection(1, 1);
  }
  let minX = canvasW;
  let minY = canvasH;
  let maxX = 0;
  let maxY = 0;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const x0 = Math.max(0, Math.floor(minX));
  const y0 = Math.max(0, Math.floor(minY));
  const x1 = Math.min(canvasW, Math.ceil(maxX));
  const y1 = Math.min(canvasH, Math.ceil(maxY));
  const mw = x1 - x0;
  const mh = y1 - y0;
  if (mw <= 0 || mh <= 0) {
    return emptySelection(1, 1);
  }
  const data = new Uint8ClampedArray(mw * mh);
  for (let py = y0; py < y1; py += 1) {
    const row = (py - y0) * mw;
    for (let px = x0; px < x1; px += 1) {
      if (pointInPolygon(px + 0.5, py + 0.5, points)) {
        data[row + (px - x0)] = 255;
      }
    }
  }
  return { width: mw, height: mh, data, originX: x0, originY: y0 };
}

export function hasSelectionPixels(sel: RasterSelection | null): boolean {
  if (!sel) {
    return false;
  }
  for (let i = 0; i < sel.data.length; i += 1) {
    if (sel.data[i] >= 128) {
      return true;
    }
  }
  return false;
}

export function combineSelections(
  base: RasterSelection | null,
  overlay: RasterSelection,
  mode: SelectionCombineMode
): RasterSelection {
  if (mode === "replace" || !base) {
    return {
      width: overlay.width,
      height: overlay.height,
      data: new Uint8ClampedArray(overlay.data),
      originX: overlay.originX,
      originY: overlay.originY
    };
  }
  const box = base.originX ?? 0;
  const boy = base.originY ?? 0;
  const oox = overlay.originX ?? 0;
  const ooy = overlay.originY ?? 0;
  const uMinX = Math.min(box, oox);
  const uMinY = Math.min(boy, ooy);
  const uMaxX = Math.max(box + base.width, oox + overlay.width);
  const uMaxY = Math.max(boy + base.height, ooy + overlay.height);
  const uW = uMaxX - uMinX;
  const uH = uMaxY - uMinY;
  const out = emptySelection(uW, uH);
  out.originX = uMinX;
  out.originY = uMinY;

  const sample = (
    sel: RasterSelection,
    ox: number,
    oy: number,
    x: number,
    y: number
  ): number => {
    const lx = x - ox;
    const ly = y - oy;
    if (lx < 0 || ly < 0 || lx >= sel.width || ly >= sel.height) {
      return 0;
    }
    return sel.data[ly * sel.width + lx];
  };

  for (let y = 0; y < uH; y += 1) {
    for (let x = 0; x < uW; x += 1) {
      const gx = uMinX + x;
      const gy = uMinY + y;
      const b = sample(base, box, boy, gx, gy);
      const o = sample(overlay, oox, ooy, gx, gy);
      let v = 0;
      if (mode === "add") {
        v = Math.min(255, b + o);
      } else if (mode === "subtract") {
        v = Math.max(0, b - o);
      } else {
        v = Math.min(b, o);
      }
      out.data[y * uW + x] = v;
    }
  }
  return out;
}

/** Cheap box-blur feather on a mask. Radius 0 is a no-op. */
export function featherSelection(
  sel: RasterSelection,
  radius: number
): RasterSelection {
  const r = Math.max(0, Math.round(radius));
  if (r === 0) {
    return {
      width: sel.width,
      height: sel.height,
      data: new Uint8ClampedArray(sel.data),
      originX: sel.originX,
      originY: sel.originY
    };
  }
  const pad = r;
  const w = sel.width + pad * 2;
  const h = sel.height + pad * 2;
  const src = new Uint8ClampedArray(w * h);
  for (let y = 0; y < sel.height; y += 1) {
    src.set(
      sel.data.subarray(y * sel.width, (y + 1) * sel.width),
      (y + pad) * w + pad
    );
  }
  const dest = new Uint8ClampedArray(w * h);
  const window = r * 2 + 1;
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    let sum = 0;
    const row = y * w;
    for (let x = -r; x <= r; x += 1) {
      sum += src[row + Math.max(0, Math.min(w - 1, x))];
    }
    for (let x = 0; x < w; x += 1) {
      tmp[row + x] = sum / window;
      const leave = Math.max(0, Math.min(w - 1, x - r));
      const enter = Math.max(0, Math.min(w - 1, x + r + 1));
      sum += src[row + enter] - src[row + leave];
    }
  }
  for (let x = 0; x < w; x += 1) {
    let sum = 0;
    for (let y = -r; y <= r; y += 1) {
      sum += tmp[Math.max(0, Math.min(h - 1, y)) * w + x];
    }
    for (let y = 0; y < h; y += 1) {
      dest[y * w + x] = Math.max(0, Math.min(255, Math.round(sum / window)));
      const leave = Math.max(0, Math.min(h - 1, y - r));
      const enter = Math.max(0, Math.min(h - 1, y + r + 1));
      sum += tmp[enter * w + x] - tmp[leave * w + x];
    }
  }
  return {
    width: w,
    height: h,
    data: dest,
    originX: (sel.originX ?? 0) - pad,
    originY: (sel.originY ?? 0) - pad
  };
}
