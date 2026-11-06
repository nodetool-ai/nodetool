import type { ClipDebandEffect } from "../types.js";

const DIRECTIONS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const;
const clamp = (v: number): number => Math.max(0, Math.min(1, v));

function hash01(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 1597334677) ^ Math.imul(y, 3812015801) ^ Math.imul(seed, 2798796415)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return (h >>> 8) / 16777216;
}

/** Reads premultiplied pixels and writes a separate buffer, retaining center alpha. */
export function debandImage(source: Uint8ClampedArray, target: Uint8ClampedArray, width: number, height: number, effect: ClipDebandEffect): void {
  const strength = clamp(effect.strength ?? 0), radius = Math.round(Math.max(1, Math.min(64, effect.range ?? 16)));
  const threshold = Math.max(0, Math.min(0.1, effect.threshold ?? 0.02)), dither = clamp(effect.dither ?? 0.5);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4, alpha = source[at + 3] ?? 0;
      target[at + 3] = alpha;
      if (!alpha) { target[at] = 0; target[at + 1] = 0; target[at + 2] = 0; continue; }
      const r = (source[at] ?? 0) / alpha, g = (source[at + 1] ?? 0) / alpha, b = (source[at + 2] ?? 0) / alpha;
      let weight = alpha / 255, red = r * weight, green = g * weight, blue = b * weight;
      for (let ring = 1; ring <= 2; ring++) {
        const distance = 1 + Math.floor(Math.fround(hash01(x, y, ring * 1669) * radius));
        for (const [dx, dy] of DIRECTIONS) {
          const sx = Math.max(0, Math.min(width - 1, x + dx * distance)), sy = Math.max(0, Math.min(height - 1, y + dy * distance));
          const index = (sy * width + sx) * 4, a = source[index + 3] ?? 0;
          if (!a || threshold <= 0) { continue; }
          const sr = (source[index] ?? 0) / a, sg = (source[index + 1] ?? 0) / a, sb = (source[index + 2] ?? 0) / a;
          const difference = Math.max(Math.abs(sr - r), Math.abs(sg - g), Math.abs(sb - b));
          const t = clamp((difference - threshold * 0.5) / (threshold * 0.5));
          const w = a / 255 * (1 - t * t * (3 - 2 * t));
          red += sr * w; green += sg * w; blue += sb * w; weight += w;
        }
      }
      const grain = (hash01(x, y, 907) - 0.5) * dither / 255;
      target[at] = Math.round(clamp(r + strength * (red / weight - r + grain)) * alpha);
      target[at + 1] = Math.round(clamp(g + strength * (green / weight - g + grain)) * alpha);
      target[at + 2] = Math.round(clamp(b + strength * (blue / weight - b + grain)) * alpha);
    }
  }
}
