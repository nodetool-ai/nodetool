import type { RasterContext2D, RasterImageData } from "./types.js";
import { readFullImage } from "./types.js";

export interface RasterAdjustments {
  /** Brightness delta in [-1, 1]. */
  brightness?: number;
  /** Contrast delta in [-1, 1]. */
  contrast?: number;
  /** Exposure in EV, typically [-2, 2]. */
  exposure?: number;
  /** Saturation delta in [-1, 1]. */
  saturation?: number;
  /** Hue rotation in degrees [-180, 180]. */
  hue?: number;
  /** Gaussian-ish box-blur radius in pixels. */
  blur?: number;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function rgbToHsl(
  r: number,
  g: number,
  b: number
): { h: number; s: number; l: number } {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) {
    return { h: 0, s: 0, l };
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rr) {
    h = (gg - bb) / d + (gg < bb ? 6 : 0);
  } else if (max === gg) {
    h = (bb - rr) / d + 2;
  } else {
    h = (rr - gg) / d + 4;
  }
  return { h: h / 6, s, l };
}

function hue2rgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) {
    tt += 1;
  }
  if (tt > 1) {
    tt -= 1;
  }
  if (tt < 1 / 6) {
    return p + (q - p) * 6 * tt;
  }
  if (tt < 1 / 2) {
    return q;
  }
  if (tt < 2 / 3) {
    return p + (q - p) * (2 / 3 - tt) * 6;
  }
  return p;
}

function hslToRgb(
  h: number,
  s: number,
  l: number
): { r: number; g: number; b: number } {
  if (s === 0) {
    const v = clampByte(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: clampByte(hue2rgb(p, q, h + 1 / 3) * 255),
    g: clampByte(hue2rgb(p, q, h) * 255),
    b: clampByte(hue2rgb(p, q, h - 1 / 3) * 255)
  };
}

function boxBlurChannel(
  src: Uint8ClampedArray,
  dest: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  channel: number
): void {
  const r = Math.max(1, Math.round(radius));
  const window = r * 2 + 1;
  // Horizontal
  const tmp = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    const row = y * width;
    for (let x = -r; x <= r; x += 1) {
      const xx = Math.max(0, Math.min(width - 1, x));
      sum += src[(row + xx) * 4 + channel];
    }
    for (let x = 0; x < width; x += 1) {
      tmp[row + x] = sum / window;
      const leave = Math.max(0, Math.min(width - 1, x - r));
      const enter = Math.max(0, Math.min(width - 1, x + r + 1));
      sum += src[(row + enter) * 4 + channel] - src[(row + leave) * 4 + channel];
    }
  }
  // Vertical
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = -r; y <= r; y += 1) {
      const yy = Math.max(0, Math.min(height - 1, y));
      sum += tmp[yy * width + x];
    }
    for (let y = 0; y < height; y += 1) {
      dest[(y * width + x) * 4 + channel] = clampByte(sum / window);
      const leave = Math.max(0, Math.min(height - 1, y - r));
      const enter = Math.max(0, Math.min(height - 1, y + r + 1));
      sum += tmp[enter * width + x] - tmp[leave * width + x];
    }
  }
}

/**
 * Apply tone / colour adjustments in place. Values match the agent tool
 * contract (normalized deltas), not the editor slider's ±100 range.
 */
export function adjustImage(
  image: RasterImageData,
  adjustments: RasterAdjustments
): void {
  const { data, width, height } = image;
  const brightness = adjustments.brightness ?? 0;
  const contrast = adjustments.contrast ?? 0;
  const exposure = adjustments.exposure ?? 0;
  const saturation = adjustments.saturation ?? 0;
  const hueDeg = adjustments.hue ?? 0;
  const blur = adjustments.blur ?? 0;

  const hasTone =
    brightness !== 0 ||
    contrast !== 0 ||
    exposure !== 0 ||
    saturation !== 0 ||
    hueDeg !== 0;

  if (hasTone) {
    const bAdd = brightness * 255;
    const cFactor = 1 + contrast;
    const ev = Math.pow(2, exposure);
    const hueShift = hueDeg / 360;
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];
      r = (r - 128) * cFactor + 128 + bAdd;
      g = (g - 128) * cFactor + 128 + bAdd;
      b = (b - 128) * cFactor + 128 + bAdd;
      r *= ev;
      g *= ev;
      b *= ev;
      if (saturation !== 0 || hueShift !== 0) {
        const hsl = rgbToHsl(
          clampByte(r),
          clampByte(g),
          clampByte(b)
        );
        hsl.s = Math.max(0, Math.min(1, hsl.s * (1 + saturation)));
        hsl.h = (hsl.h + hueShift) % 1;
        if (hsl.h < 0) {
          hsl.h += 1;
        }
        const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
        r = rgb.r;
        g = rgb.g;
        b = rgb.b;
      }
      data[i] = clampByte(r);
      data[i + 1] = clampByte(g);
      data[i + 2] = clampByte(b);
    }
  }

  if (blur > 0) {
    const dest = new Uint8ClampedArray(data);
    for (let c = 0; c < 4; c += 1) {
      boxBlurChannel(data, dest, width, height, blur, c);
    }
    data.set(dest);
  }
}

export function adjustOnContext(
  ctx: RasterContext2D,
  adjustments: RasterAdjustments
): void {
  const image = readFullImage(ctx);
  adjustImage(image, adjustments);
  ctx.putImageData(image, 0, 0);
}
