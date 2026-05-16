/**
 * Histogram computation for RGBA pixel data (used by LevelsBody).
 *
 * Each output channel is a 256-bin Uint32Array (count of pixels per
 * intensity). Luminance is Rec. 709 weights (0.2126 R + 0.7152 G + 0.0722 B).
 */

export interface ImageHistogram {
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  luminance: Uint32Array;
  pixelCount: number;
}

export function computeHistogramFromRgba(
  rgba: Uint8ClampedArray | Uint8Array
): ImageHistogram {
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  const luminance = new Uint32Array(256);
  const len = rgba.length;
  let pixels = 0;

  for (let i = 0; i < len; i += 4) {
    const cr = rgba[i];
    const cg = rgba[i + 1];
    const cb = rgba[i + 2];
    r[cr]++;
    g[cg]++;
    b[cb]++;
    const y = Math.round(0.2126 * cr + 0.7152 * cg + 0.0722 * cb);
    luminance[y > 255 ? 255 : y < 0 ? 0 : y]++;
    pixels++;
  }

  return { r, g, b, luminance, pixelCount: pixels };
}
