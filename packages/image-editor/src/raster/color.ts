import { parseColorToRgba, type Rgba } from "../painting/types.js";
import type { RasterImageData } from "./types.js";

export function rgbaToHex({ r, g, b }: Rgba): string {
  const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;
}

export function rgbaBytes(color: string) {
  const parsed = parseColorToRgba(color);
  return {
    r: parsed.r,
    g: parsed.g,
    b: parsed.b,
    a: Math.round(Math.max(0, Math.min(1, parsed.a)) * 255)
  };
}

export interface SampledPixel {
  x: number;
  y: number;
  color: string;
  rgba: { r: number; g: number; b: number; a: number };
}

/** Sample one pixel. Out-of-bounds returns transparent black. */
export function pickPixel(
  image: RasterImageData,
  x: number,
  y: number
): SampledPixel {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= image.width || py >= image.height) {
    return {
      x: px,
      y: py,
      color: "#000000",
      rgba: { r: 0, g: 0, b: 0, a: 0 }
    };
  }
  const i = (py * image.width + px) * 4;
  const rgba = {
    r: image.data[i],
    g: image.data[i + 1],
    b: image.data[i + 2],
    a: image.data[i + 3]
  };
  return { x: px, y: py, color: rgbaToHex(rgba), rgba };
}
