import {
  isClipDenoiseEffect,
  type ClipDenoiseEffect,
  type ClipEffect,
  type TimelineClip
} from "../types.js";
import { clipSourceWindowMs } from "../generatedMatte.js";

export interface TemporalSources<T> {
  before: T;
  after: T;
}
export const hasTemporalDenoise = (
  effects: readonly ClipEffect[] | undefined
): boolean =>
  !!effects?.some(
    (effect) =>
      effect.enabled &&
      isClipDenoiseEffect(effect) &&
      (effect.temporalStrength ?? 0) > 0
  );
export function denoiseSourceTimes(
  clip: TimelineClip,
  sourceMs: number
): TemporalSources<number> {
  const range = clipSourceWindowMs(clip),
    last = Math.max(range.fromMs, range.toMs - 0.001);
  return {
    before: Math.max(range.fromMs, Math.min(last, sourceMs - 1000 / 30)),
    after: Math.max(range.fromMs, Math.min(last, sourceMs + 1000 / 30))
  };
}
const clamp = (value: number, low = 0, high = 1): number =>
  Math.max(low, Math.min(high, value));
const smooth = (low: number, high: number, value: number): number => {
  const x = clamp((value - low) / (high - low));
  return x * x * (3 - 2 * x);
};
type Color = [number, number, number, number];
function ycc(r: number, g: number, b: number, a: number): Color {
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [y, (b - y) / 1.8556, (r - y) / 1.5748, a];
}
function rgb(y: number, cb: number, cr: number): [number, number, number] {
  const r = y + 1.5748 * cr,
    b = y + 1.8556 * cb;
  return [r, (y - 0.2126 * r - 0.0722 * b) / 0.7152, b];
}
function sample(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  premultiplied: boolean
): Color {
  const i = (clamp(y, 0, height - 1) * width + clamp(x, 0, width - 1)) * 4,
    a = data[i + 3]! / 255;
  if (!a) {
    return [0, 0, 0, 0];
  }
  const divisor = premultiplied ? Math.max(data[i + 3]!, 1) : 255;
  return ycc(
    data[i]! / divisor,
    data[i + 1]! / divisor,
    data[i + 2]! / divisor,
    a
  );
}
function write(
  target: Uint8ClampedArray,
  at: number,
  color: readonly number[],
  alpha: number
): void {
  target[at + 3] = Math.round(clamp(alpha) * 255);
  for (let c = 0; c < 3; c++) {
    target[at + c] = Math.round(clamp(color[c]!) * alpha * 255);
  }
}
/** Spatial bilateral filtering in encoded Rec.709 luma/chroma, preserving center alpha. */
export function denoiseSpatial(
  source: Uint8ClampedArray,
  target: Uint8ClampedArray,
  width: number,
  height: number,
  effect: ClipDenoiseEffect
): void {
  const luma = clamp(effect.lumaStrength ?? 0),
    chroma = clamp(effect.chromaStrength ?? 0),
    radius = Math.round(clamp(effect.radius ?? 2, 1, 4));
  if (!luma && !chroma) {
    target.set(source);
    return;
  }
  const sigmaY = 0.01 + 0.08 * luma,
    sigmaC = 0.01 + 0.08 * chroma;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const center = sample(source, width, height, x, y, true),
        at = (y * width + x) * 4;
      if (!center[3]) {
        target.fill(0, at, at + 4);
        continue;
      }
      let sy = 0,
        scb = 0,
        scr = 0,
        wy = 0,
        wc = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const c = sample(source, width, height, x + dx, y + dy, true),
            dY = c[0] - center[0],
            dC = (c[1] - center[1]) ** 2 + (c[2] - center[2]) ** 2;
          const space =
            Math.exp(-(dx * dx + dy * dy) / (2 * radius * radius)) * c[3];
          const a =
            space * Math.exp((-dY * dY) / (2 * sigmaY * sigmaY) - dC / 0.02);
          const b =
            space * Math.exp(-dC / (2 * sigmaC * sigmaC) - (dY * dY) / 0.0072);
          sy += c[0] * a;
          wy += a;
          scb += c[1] * b;
          scr += c[2] * b;
          wc += b;
        }
      }
      write(
        target,
        at,
        rgb(
          center[0] + luma * (sy / wy - center[0]),
          center[1] + chroma * (scb / wc - center[1]),
          center[2] + chroma * (scr / wc - center[2])
        ),
        center[3]
      );
    }
  }
}
const patch = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1]
] as const;
function meanColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  premultiplied: boolean
): Color {
  const sum: Color = [0, 0, 0, 0];
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const jitter = (((x * 13 + y * 7) % 11) - 5) * 0.04;
      const c = sample(
        data,
        width,
        height,
        Math.floor(((x + 0.5 + jitter) * width) / 4),
        Math.floor(((y + 0.5 - jitter) * height) / 4),
        premultiplied
      );
      for (let channel = 0; channel < 3; channel++) {
        sum[channel]! += (c[channel]! * c[3]) / 16;
      }
      sum[3] += c[3] / 16;
    }
  }
  return [
    sum[0] / Math.max(sum[3], 1 / 255),
    sum[1] / Math.max(sum[3], 1 / 255),
    sum[2] / Math.max(sum[3], 1 / 255),
    sum[3]
  ];
}
function sceneMatches(a: Color, b: Color): boolean {
  return (
    Math.abs(a[0] - b[0]) +
      0.5 *
        (Math.abs(a[1] - b[1]) +
          Math.abs(a[2] - b[2]) +
          Math.abs(a[3] - b[3])) <
    0.08
  );
}
/** Neighbors are straight RGBA. No playback history is used or retained. */
export function denoiseTemporal(
  source: Uint8ClampedArray,
  target: Uint8ClampedArray,
  width: number,
  height: number,
  neighbors: TemporalSources<Uint8ClampedArray | null>,
  strength: number
): void {
  strength = clamp(strength);
  if (!strength) {
    target.set(source);
    return;
  }
  const centerMean = meanColor(source, width, height, true);
  const candidates = [neighbors.before, neighbors.after].filter(
    (frame): frame is Uint8ClampedArray =>
      frame !== null &&
      sceneMatches(centerMean, meanColor(frame, width, height, false))
  );
  if (!candidates.length) {
    target.set(source);
    return;
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4,
        center = sample(source, width, height, x, y, true);
      if (!center[3]) {
        target.fill(0, at, at + 4);
        continue;
      }
      const reference = patch.map(([dx, dy]) =>
        sample(source, width, height, x + dx, y + dy, true)
      );
      const sum = rgb(center[0], center[1], center[2]);
      let total = 1;
      for (const neighbor of candidates) {
        const error = (dx: number, dy: number): number => {
          let score = 0;
          for (let i = 0; i < patch.length; i++) {
            const c = sample(
                neighbor,
                width,
                height,
                x + dx + patch[i]![0],
                y + dy + patch[i]![1],
                false
              ),
              r = reference[i]!;
            score +=
              ((c[0] - r[0]) ** 2 +
                0.25 * ((c[1] - r[1]) ** 2 + (c[2] - r[2]) ** 2) +
                0.25 * (c[3] - r[3]) ** 2) /
              5;
          }
          return score;
        };
        let bx = 0,
          by = 0,
          best = error(0, 0);
        for (const step of [4, 2, 1]) {
          const originX = bx,
            originY = by;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const sx = clamp(originX + dx * step, -4, 4),
                sy = clamp(originY + dy * step, -4, 4),
                cost = error(sx, sy) + 0.00001 * (sx * sx + sy * sy);
              if (cost < best) {
                bx = sx;
                by = sy;
                best = cost;
              }
            }
          }
        }
        const c = sample(neighbor, width, height, x + bx, y + by, false),
          difference = Math.max(
            Math.abs(c[0] - center[0]),
            Math.abs(c[1] - center[1]),
            Math.abs(c[2] - center[2])
          );
        const weight =
          strength *
          (1 - smooth(0.03, 0.12, Math.sqrt(error(bx, by)))) *
          (1 - smooth(0.08, 0.2, difference)) *
          (1 - smooth(0.02, 0.1, Math.abs(c[3] - center[3])));
        const color = rgb(c[0], c[1], c[2]);
        for (let channel = 0; channel < 3; channel++) {
          sum[channel]! += color[channel]! * weight;
        }
        total += weight;
      }
      write(
        target,
        at,
        sum.map((value) => value / total),
        center[3]
      );
    }
  }
}
