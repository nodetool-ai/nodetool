/**
 * Per-pixel selection mask utilities for the Image Editor.
 *
 * A selection mask is a Uint8Array of width×height bytes where 0 = unselected
 * and 255 = fully selected.  Intermediate values represent partial selection
 * (used by feathering / smoothing).
 */

import type { Point, SelectionMode } from "./types";

/* ------------------------------------------------------------------ */
/*  Create / clear                                                      */
/* ------------------------------------------------------------------ */

/** Create an empty (all-zero) selection mask. */
export const createMask = (width: number, height: number): Uint8Array => {
  return new Uint8Array(width * height);
};

/** Create a fully-selected mask (all 255). */
export const createFullMask = (width: number, height: number): Uint8Array => {
  const mask = new Uint8Array(width * height);
  mask.fill(255);
  return mask;
};

/** Return true when every byte in the mask is 0. */
export const isMaskEmpty = (mask: Uint8Array): boolean => {
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== 0) {
      return false;
    }
  }
  return true;
};

/* ------------------------------------------------------------------ */
/*  Combine helpers (add / subtract / intersect / replace)              */
/* ------------------------------------------------------------------ */

/**
 * Combine `incoming` mask into `existing` mask using `mode`.
 * Returns a **new** Uint8Array – the originals are not mutated.
 */
export const combineMasks = (
  existing: Uint8Array,
  incoming: Uint8Array,
  mode: SelectionMode
): Uint8Array => {
  const len = existing.length;
  const out = new Uint8Array(len);

  switch (mode) {
    case "replace":
      out.set(incoming);
      break;

    case "add":
      for (let i = 0; i < len; i++) {
        out[i] = Math.min(255, existing[i] + incoming[i]);
      }
      break;

    case "subtract":
      for (let i = 0; i < len; i++) {
        out[i] = Math.max(0, existing[i] - incoming[i]);
      }
      break;

    case "intersect":
      for (let i = 0; i < len; i++) {
        out[i] = Math.min(existing[i], incoming[i]);
      }
      break;
  }

  return out;
};

/* ------------------------------------------------------------------ */
/*  Invert                                                              */
/* ------------------------------------------------------------------ */

/** Invert a mask in-place: selected ⟷ unselected. */
export const invertMask = (mask: Uint8Array): Uint8Array => {
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    out[i] = 255 - mask[i];
  }
  return out;
};

/* ------------------------------------------------------------------ */
/*  Rectangle fill                                                      */
/* ------------------------------------------------------------------ */

/** Fill an axis-aligned rectangle on a blank mask (image coords). */
export const fillRect = (
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): Uint8Array => {
  const mask = createMask(width, height);

  const minX = Math.max(0, Math.min(Math.floor(Math.min(x0, x1)), width - 1));
  const maxX = Math.max(0, Math.min(Math.floor(Math.max(x0, x1)), width - 1));
  const minY = Math.max(0, Math.min(Math.floor(Math.min(y0, y1)), height - 1));
  const maxY = Math.max(0, Math.min(Math.floor(Math.max(y0, y1)), height - 1));

  for (let y = minY; y <= maxY; y++) {
    const rowOff = y * width;
    for (let x = minX; x <= maxX; x++) {
      mask[rowOff + x] = 255;
    }
  }

  return mask;
};

/* ------------------------------------------------------------------ */
/*  Ellipse fill                                                        */
/* ------------------------------------------------------------------ */

/** Fill an axis-aligned ellipse on a blank mask (image coords). */
export const fillEllipse = (
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): Uint8Array => {
  const mask = createMask(width, height);

  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = Math.abs(x1 - x0) / 2;
  const ry = Math.abs(y1 - y0) / 2;

  if (rx === 0 || ry === 0) {
    return mask;
  }

  const minX = Math.max(0, Math.floor(cx - rx));
  const maxX = Math.min(width - 1, Math.ceil(cx + rx));
  const minY = Math.max(0, Math.floor(cy - ry));
  const maxY = Math.min(height - 1, Math.ceil(cy + ry));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) {
        mask[y * width + x] = 255;
      }
    }
  }

  return mask;
};

/* ------------------------------------------------------------------ */
/*  Lasso (polygon) fill – scanline                                     */
/* ------------------------------------------------------------------ */

/**
 * Fill the interior of a closed polygon on a blank mask.
 * Uses even-odd rule scanline fill.
 */
export const fillPolygon = (
  width: number,
  height: number,
  points: Point[]
): Uint8Array => {
  const mask = createMask(width, height);

  if (points.length < 3) {
    return mask;
  }

  // Find bounding box
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.y < minY) { minY = p.y; }
    if (p.y > maxY) { maxY = p.y; }
  }

  minY = Math.max(0, Math.floor(minY));
  maxY = Math.min(height - 1, Math.ceil(maxY));

  for (let y = minY; y <= maxY; y++) {
    // Build sorted list of x-intersections with the scanline
    const intersections: number[] = [];
    const n = points.length;

    for (let i = 0; i < n; i++) {
      const a = points[i];
      const b = points[(i + 1) % n];

      // Skip horizontal edges
      if (a.y === b.y) { continue; }

      // Check if scanline intersects this edge
      const yMin = Math.min(a.y, b.y);
      const yMax = Math.max(a.y, b.y);
      if (y < yMin || y >= yMax) { continue; }

      // Calculate x intersection
      const t = (y - a.y) / (b.y - a.y);
      const xIntersect = a.x + t * (b.x - a.x);
      intersections.push(xIntersect);
    }

    intersections.sort((a, b) => a - b);

    // Fill between pairs (even-odd rule)
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const xStart = Math.max(0, Math.ceil(intersections[i]));
      const xEnd = Math.min(width - 1, Math.floor(intersections[i + 1]));
      const rowOff = y * width;
      for (let x = xStart; x <= xEnd; x++) {
        mask[rowOff + x] = 255;
      }
    }
  }

  return mask;
};

/* ------------------------------------------------------------------ */
/*  Magic wand (flood-fill selection by colour similarity)              */
/* ------------------------------------------------------------------ */

/**
 * Flood-fill select all contiguous pixels whose color is within
 * `tolerance` of the seed pixel's color.
 */
export const magicWandSelect = (
  imageData: ImageData,
  startX: number,
  startY: number,
  tolerance: number
): Uint8Array => {
  const { width, height, data } = imageData;
  const mask = createMask(width, height);

  const sx = Math.floor(startX);
  const sy = Math.floor(startY);

  if (sx < 0 || sx >= width || sy < 0 || sy >= height) {
    return mask;
  }

  const seedIdx = (sy * width + sx) * 4;
  const seedR = data[seedIdx];
  const seedG = data[seedIdx + 1];
  const seedB = data[seedIdx + 2];
  const seedA = data[seedIdx + 3];

  const visited = new Uint8Array(width * height);
  const stack: number[] = [sx, sy];

  while (stack.length > 0) {
    const cy = stack.pop()!;
    const cx = stack.pop()!;

    if (cx < 0 || cx >= width || cy < 0 || cy >= height) {
      continue;
    }

    const key = cy * width + cx;
    if (visited[key]) {
      continue;
    }
    visited[key] = 1;

    const idx = key * 4;
    const dr = Math.abs(data[idx] - seedR);
    const dg = Math.abs(data[idx + 1] - seedG);
    const db = Math.abs(data[idx + 2] - seedB);
    const da = Math.abs(data[idx + 3] - seedA);

    if (dr <= tolerance && dg <= tolerance && db <= tolerance && da <= tolerance) {
      mask[key] = 255;
      stack.push(cx + 1, cy);
      stack.push(cx - 1, cy);
      stack.push(cx, cy + 1);
      stack.push(cx, cy - 1);
    }
  }

  return mask;
};

/* ------------------------------------------------------------------ */
/*  Gaussian blur (box-blur approximation for smoothing / feathering)   */
/* ------------------------------------------------------------------ */

/**
 * Apply a box-blur approximation of gaussian blur to a mask.
 * Three passes of horizontal+vertical box blur approximate a gaussian.
 * `radius` is in pixels; 0 means no-op.
 */
export const blurMask = (
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number
): Uint8Array => {
  if (radius <= 0) {
    return new Uint8Array(mask);
  }

  // Work with float for precision then clamp at the end
  let src = new Float32Array(mask);
  let dst = new Float32Array(mask.length);

  const passes = 3; // three-pass box blur ≈ gaussian
  const r = Math.ceil(radius);

  for (let pass = 0; pass < passes; pass++) {
    // Horizontal pass
    for (let y = 0; y < height; y++) {
      const rowOff = y * width;
      let sum = 0;
      let count = 0;

      // Initial window
      for (let dx = 0; dx <= r && dx < width; dx++) {
        sum += src[rowOff + dx];
        count++;
      }

      for (let x = 0; x < width; x++) {
        dst[rowOff + x] = sum / count;

        // Slide window
        const addX = x + r + 1;
        const removeX = x - r;

        if (addX < width) {
          sum += src[rowOff + addX];
          count++;
        }
        if (removeX >= 0) {
          sum -= src[rowOff + removeX];
          count--;
        }
      }
    }

    // Swap
    [src, dst] = [dst, src];

    // Vertical pass
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;

      for (let dy = 0; dy <= r && dy < height; dy++) {
        sum += src[dy * width + x];
        count++;
      }

      for (let y = 0; y < height; y++) {
        dst[y * width + x] = sum / count;

        const addY = y + r + 1;
        const removeY = y - r;

        if (addY < height) {
          sum += src[addY * width + x];
          count++;
        }
        if (removeY >= 0) {
          sum -= src[removeY * width + x];
          count--;
        }
      }
    }

    [src, dst] = [dst, src];
  }

  // Clamp back to Uint8
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    out[i] = Math.min(255, Math.max(0, Math.round(src[i])));
  }
  return out;
};

/* ------------------------------------------------------------------ */
/*  Feather (blur only the edge region of a hard mask)                  */
/* ------------------------------------------------------------------ */

/**
 * Feather the edges of a hard selection mask.
 * Equivalent to blurring the entire mask.
 */
export const featherMask = (
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number
): Uint8Array => {
  return blurMask(mask, width, height, radius);
};

/* ------------------------------------------------------------------ */
/*  Smooth borders (alias, same blur but semantically different)        */
/* ------------------------------------------------------------------ */

/**
 * Smooth the borders of a selection mask by blurring and re-thresholding
 * to keep a hard edge but remove jagged pixels.
 */
export const smoothMaskBorders = (
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number
): Uint8Array => {
  if (radius <= 0) {
    return new Uint8Array(mask);
  }

  const blurred = blurMask(mask, width, height, radius);

  // Re-threshold at 128 so edges stay hard but are smoothed
  const out = new Uint8Array(blurred.length);
  for (let i = 0; i < blurred.length; i++) {
    out[i] = blurred[i] >= 128 ? 255 : 0;
  }
  return out;
};

/* ------------------------------------------------------------------ */
/*  Select-all                                                          */
/* ------------------------------------------------------------------ */

export const selectAll = (width: number, height: number): Uint8Array => {
  return createFullMask(width, height);
};

/* ------------------------------------------------------------------ */
/*  Marching-ants overlay rendering                                     */
/* ------------------------------------------------------------------ */

/**
 * Draw a marching-ants outline for the selection mask on an overlay canvas.
 * `offset` is animated externally (0..dashLen) to produce the marching effect.
 */
export const drawSelectionOverlay = (
  ctx: CanvasRenderingContext2D,
  mask: Uint8Array,
  imgWidth: number,
  imgHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  zoom: number,
  pan: Point,
  offset: number
): void => {
  // We'll walk every pixel on the mask boundary (where a selected pixel
  // neighbours an unselected one) and draw a dashed line on the overlay.

  const scaledWidth = imgWidth * zoom;
  const scaledHeight = imgHeight * zoom;
  const ox = (canvasWidth - scaledWidth) / 2 + pan.x;
  const oy = (canvasHeight - scaledHeight) / 2 + pan.y;

  ctx.save();
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.lineDashOffset = -offset;

  // First pass: white dashes
  ctx.strokeStyle = "#ffffff";
  traceBoundary(ctx, mask, imgWidth, imgHeight, zoom, ox, oy);

  // Second pass: black dashes offset by half for contrast
  ctx.lineDashOffset = -(offset + 4);
  ctx.strokeStyle = "#000000";
  traceBoundary(ctx, mask, imgWidth, imgHeight, zoom, ox, oy);

  ctx.setLineDash([]);
  ctx.restore();
};

/**
 * Trace the boundary of the mask as small line segments.
 */
const traceBoundary = (
  ctx: CanvasRenderingContext2D,
  mask: Uint8Array,
  w: number,
  h: number,
  zoom: number,
  ox: number,
  oy: number
): void => {
  ctx.beginPath();

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] < 128) {
        continue;
      }

      // Check 4-connected neighbours; draw edge segment where neighbour is outside
      // Top edge
      if (y === 0 || mask[(y - 1) * w + x] < 128) {
        const sx = ox + x * zoom;
        const sy = oy + y * zoom;
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + zoom, sy);
      }
      // Bottom edge
      if (y === h - 1 || mask[(y + 1) * w + x] < 128) {
        const sx = ox + x * zoom;
        const sy = oy + (y + 1) * zoom;
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + zoom, sy);
      }
      // Left edge
      if (x === 0 || mask[y * w + (x - 1)] < 128) {
        const sx = ox + x * zoom;
        const sy = oy + y * zoom;
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx, sy + zoom);
      }
      // Right edge
      if (x === w - 1 || mask[y * w + (x + 1)] < 128) {
        const sx = ox + (x + 1) * zoom;
        const sy = oy + y * zoom;
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx, sy + zoom);
      }
    }
  }

  ctx.stroke();
};
