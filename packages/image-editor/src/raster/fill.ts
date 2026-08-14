import type { RasterContext2D, RasterImageData } from "./types.js";
import { readFullImage } from "./types.js";
import { rgbaBytes } from "./color.js";

export interface FillRegionOptions {
  color: string;
  /** Per-channel colour distance, 0–255. Default 16. */
  tolerance?: number;
  /** True fills only connected pixels. False replaces every matching pixel. */
  contiguous?: boolean;
}

/**
 * Flood-fill or global colour-replace on an ImageData buffer.
 *
 * Colour match uses the same luminance-weighted distance as the editor's
 * Fill tool so a given tolerance paints the same pixels in both hosts.
 *
 * Returns true when at least one pixel changed.
 */
export function fillRegion(
  image: RasterImageData,
  startX: number,
  startY: number,
  options: FillRegionOptions
): boolean {
  const { width, height, data } = image;
  const sx = Math.round(startX);
  const sy = Math.round(startY);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) {
    return false;
  }

  const fill = rgbaBytes(options.color);
  const idx0 = (sy * width + sx) * 4;
  const targetR = data[idx0];
  const targetG = data[idx0 + 1];
  const targetB = data[idx0 + 2];
  const targetA = data[idx0 + 3];

  if (
    targetR === fill.r &&
    targetG === fill.g &&
    targetB === fill.b &&
    targetA === fill.a
  ) {
    return false;
  }

  const tol = options.tolerance ?? 16;
  const tol2 = tol * tol;
  const colorMatches = (i: number): boolean => {
    const dr = data[i] - targetR;
    const dg = data[i + 1] - targetG;
    const db = data[i + 2] - targetB;
    const da = data[i + 3] - targetA;
    return (
      dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114 + da * da * 0.5 <=
      tol2
    );
  };

  const write = (i: number): void => {
    data[i] = fill.r;
    data[i + 1] = fill.g;
    data[i + 2] = fill.b;
    data[i + 3] = fill.a;
  };

  if (options.contiguous === false) {
    let changed = false;
    for (let i = 0; i < data.length; i += 4) {
      if (!colorMatches(i)) {
        continue;
      }
      write(i);
      changed = true;
    }
    return changed;
  }

  const filled = new Uint8Array(width * height);
  const stack: number[] = [sx, sy];
  let changed = false;

  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    if (filled[y * width + x]) {
      continue;
    }
    if (!colorMatches((y * width + x) * 4)) {
      continue;
    }

    let x1 = x;
    while (
      x1 > 0 &&
      !filled[y * width + x1 - 1] &&
      colorMatches((y * width + x1 - 1) * 4)
    ) {
      x1 -= 1;
    }
    let x2 = x;
    while (
      x2 < width - 1 &&
      !filled[y * width + x2 + 1] &&
      colorMatches((y * width + x2 + 1) * 4)
    ) {
      x2 += 1;
    }

    const rowBase = y * width;
    for (let xi = x1; xi <= x2; xi += 1) {
      filled[rowBase + xi] = 1;
      write((rowBase + xi) * 4);
      changed = true;
    }

    if (y > 0) {
      let inSpan = false;
      for (let xi = x1; xi <= x2; xi += 1) {
        const pi = (y - 1) * width + xi;
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
    if (y < height - 1) {
      let inSpan = false;
      for (let xi = x1; xi <= x2; xi += 1) {
        const pi = (y + 1) * width + xi;
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

  return changed;
}

/** Flood-fill a canvas. Returns true when at least one pixel changed. */
export function fillOnContext(
  ctx: RasterContext2D,
  startX: number,
  startY: number,
  options: FillRegionOptions
): boolean {
  const image = readFullImage(ctx);
  const changed = fillRegion(image, startX, startY, options);
  if (changed) {
    ctx.putImageData(image, 0, 0);
  }
  return changed;
}
