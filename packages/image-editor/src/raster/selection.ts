/**
 * Pixel selection masks. Origins may sit off (0, 0) so a small overlay
 * can combine with a canvas-sized base, and an ellipse mask may extend past
 * the canvas so its outline draws as a curve rather than a clipped edge.
 *
 * These are the editor's own bodies, shared so an agent's `select_region`
 * produces the same mask as the user's marquee.
 */

export interface RasterSelection {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  originX?: number;
  originY?: number;
}

export type SelectionCombineMode = "replace" | "add" | "subtract" | "intersect";

/** Feather radii above this wash the selection out; the editor's slider caps here. */
export const MAX_SELECTION_FEATHER_RADIUS = 32;

export function emptySelection(width: number, height: number): RasterSelection {
  return { width, height, data: new Uint8ClampedArray(width * height) };
}

export function cloneSelection(src: RasterSelection): RasterSelection {
  const out: RasterSelection = {
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

export function isValidSelection(
  sel: RasterSelection | null
): sel is RasterSelection {
  if (!sel) {
    return false;
  }
  return (
    sel.width > 0 && sel.height > 0 && sel.data.length === sel.width * sel.height
  );
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

/**
 * Filled axis-aligned ellipse. The mask deliberately keeps the full ellipse
 * bounding box even where it leaves the canvas, so the marching-ants outline
 * renders the curve instead of a straight clipped edge; `originX`/`originY`
 * carry the offset.
 */
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
  const bx0 = Math.floor(x);
  const by0 = Math.floor(y);
  const bx1 = Math.ceil(x + w);
  const by1 = Math.ceil(y + h);
  const mw = bx1 - bx0;
  const mh = by1 - by0;
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

/**
 * Scanline polygon fill. Unlike the editor's `polygonToBinaryMask` this needs
 * no canvas, so it also runs in the headless host.
 */
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
  if (!isValidSelection(sel)) {
    return false;
  }
  for (let i = 0; i < sel.data.length; i += 1) {
    if (sel.data[i] > 0) {
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
  if (mode === "replace" || !base || !isValidSelection(base)) {
    return cloneSelection(overlay);
  }

  const oox = overlay.originX ?? 0;
  const ooy = overlay.originY ?? 0;
  const box = base.originX ?? 0;
  const boy = base.originY ?? 0;

  // Fast path: same dimensions and origin — the common case (canvas-sized
  // selections at 0,0). Operate on the typed arrays with no union buffer.
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
    if (mode === "add") {
      for (let i = 0; i < n; i += 1) {
        out[i] = Math.min(255, bd[i] + od[i]);
      }
    } else if (mode === "subtract") {
      for (let i = 0; i < n; i += 1) {
        out[i] = Math.max(0, bd[i] - od[i]);
      }
    } else {
      for (let i = 0; i < n; i += 1) {
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

  // General path: union bounding box of both masks (an ellipse may extend
  // past the canvas, so sizes and origins differ).
  const uMinX = Math.min(oox, box);
  const uMinY = Math.min(ooy, boy);
  const uMaxX = Math.max(oox + overlay.width, box + base.width);
  const uMaxY = Math.max(ooy + overlay.height, boy + base.height);
  const uW = uMaxX - uMinX;
  const uH = uMaxY - uMinY;

  const out = emptySelection(uW, uH);

  const baseDx = box - uMinX;
  const baseDy = boy - uMinY;

  // For intersect, skip copying base — pixels outside overlay must end up
  // zero. For add/subtract, seed the union buffer so overlay pixels mix in.
  if (mode !== "intersect") {
    for (let by = 0; by < base.height; by += 1) {
      const dy = baseDy + by;
      if (dy < 0 || dy >= uH) {
        continue;
      }
      const srcOff = by * base.width;
      const dstOff = dy * uW + baseDx;
      if (baseDx >= 0 && baseDx + base.width <= uW) {
        out.data.set(base.data.subarray(srcOff, srcOff + base.width), dstOff);
      } else {
        for (let bx = 0; bx < base.width; bx += 1) {
          const dx = baseDx + bx;
          if (dx >= 0 && dx < uW) {
            out.data[dy * uW + dx] = base.data[srcOff + bx];
          }
        }
      }
    }
  }

  const overlayDx = oox - uMinX;
  const overlayDy = ooy - uMinY;
  for (let oy = 0; oy < overlay.height; oy += 1) {
    const dy = overlayDy + oy;
    if (dy < 0 || dy >= uH) {
      continue;
    }
    const srcRow = oy * overlay.width;
    const dstRow = dy * uW;
    for (let ox = 0; ox < overlay.width; ox += 1) {
      const dx = overlayDx + ox;
      if (dx < 0 || dx >= uW) {
        continue;
      }
      const idx = dstRow + dx;
      const o = overlay.data[srcRow + ox];
      let v = 0;
      if (mode === "add") {
        v = Math.min(255, out.data[idx] + o);
      } else if (mode === "subtract") {
        v = Math.max(0, out.data[idx] - o);
      } else {
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

function horizontalBoxBlurFloat(
  src: Float32Array,
  dst: Float32Array,
  w: number,
  h: number,
  r: number
): void {
  const diam = r * 2 + 1;
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    let sum = 0;
    for (let x = -r; x <= r; x += 1) {
      if (x >= 0 && x < w) {
        sum += src[row + x];
      }
    }
    for (let x = 0; x < w; x += 1) {
      dst[row + x] = sum / diam;
      const xOut = x - r;
      const xIn = x + r + 1;
      const vOut = xOut < 0 || xOut >= w ? 0 : src[row + xOut];
      const vIn = xIn < 0 || xIn >= w ? 0 : src[row + xIn];
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
  for (let x = 0; x < w; x += 1) {
    let sum = 0;
    for (let y = -r; y <= r; y += 1) {
      if (y >= 0 && y < h) {
        sum += src[y * w + x];
      }
    }
    for (let y = 0; y < h; y += 1) {
      dst[y * w + x] = sum / diam;
      const yOut = y - r;
      const yIn = y + r + 1;
      const vOut = yOut < 0 || yOut >= h ? 0 : src[yOut * w + x];
      const vIn = yIn < 0 || yIn >= h ? 0 : src[yIn * w + x];
      sum += vIn - vOut;
    }
  }
}

/**
 * Approximate Gaussian feather via three box blurs, in place. Values are
 * clamped without peak renormalization (Photoshop-like: thin selections stay
 * softer in the middle instead of being contrast-stretched). The per-pass
 * radius is halved because repeated box blurs compound, which keeps the
 * visible feather close to the requested radius.
 */
export function featherSelectionInPlace(
  sel: RasterSelection,
  radiusPx: number
): void {
  const requestedRadius = Math.max(
    0,
    Math.min(MAX_SELECTION_FEATHER_RADIUS, Math.round(radiusPx))
  );
  if (requestedRadius <= 0) {
    return;
  }
  const passes = 3;
  const blurRadius = Math.max(1, Math.round(requestedRadius / 2));
  const { width: w, height: h, data } = sel;
  const n = w * h;
  const tmp = new Float32Array(n);
  const cur = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    cur[i] = data[i];
  }
  for (let p = 0; p < passes; p += 1) {
    horizontalBoxBlurFloat(cur, tmp, w, h, blurRadius);
    verticalBoxBlurFloat(tmp, cur, w, h, blurRadius);
  }
  for (let i = 0; i < n; i += 1) {
    data[i] = Math.max(0, Math.min(255, Math.round(cur[i])));
  }
}

/** {@link featherSelectionInPlace} on a copy. */
export function featherSelection(
  sel: RasterSelection,
  radius: number
): RasterSelection {
  const out = cloneSelection(sel);
  featherSelectionInPlace(out, radius);
  return out;
}
