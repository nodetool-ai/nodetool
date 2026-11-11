import type { ClipSecondaryColorEffect, CurvePoint } from "../types.js";

type Rgb = readonly [number, number, number];
export function secondaryNeutral(effect: ClipSecondaryColorEffect): boolean {
  return !(effect.hueShift || effect.lightness) && (effect.saturation ?? 1) === 1
    && (effect.hueCurve ?? []).every(point => point.y === 0.5)
    && (effect.saturationCurve ?? []).every(point => point.y === 0.5);
}
const clamp = (v: number): number => Math.max(0, Math.min(1, v));
const wrap = (v: number): number => v - Math.floor(v);
const smooth = (v: number): number => { const t = clamp(v); return t * t * (3 - 2 * t); };

/** Periodic piecewise-linear hue curves. Duplicate red endpoints share x=0. */
function cyclicCurve(points: readonly CurvePoint[] | undefined): (x: number) => number {
  const knots = new Map<number, number>();
  for (const p of points ?? []) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) { continue; }
    if (p.x === 1 && knots.has(0)) { continue; }
    knots.set(wrap(clamp(p.x)), clamp(p.y));
  }
  const ordered = [...knots].sort((a, b) => a[0] - b[0]);
  return (x) => {
    const first = ordered[0], last = ordered.at(-1);
    if (!first || !last) { return 0.5; }
    const h = wrap(x);
    let a = h < first[0] ? [last[0] - 1, last[1]] as const : last;
    let b = [first[0] + (h < first[0] ? 0 : 1), first[1]] as const;
    for (let i = 1; i < ordered.length; i++) {
      const previous = ordered[i - 1], next = ordered[i];
      if (previous && next && h >= previous[0] && h < next[0]) { a = previous; b = next; break; }
    }
    return a[1] + (b[1] - a[1]) * (h - a[0]) / (b[0] - a[0]);
  };
}

export function secondaryCurveTransfer(effect: ClipSecondaryColorEffect): Array<[number, number, number, number]> {
  const hue = cyclicCurve(effect.hueCurve), saturation = cyclicCurve(effect.saturationCurve);
  return Array.from({length: 256}, (_, i) => [hue(i / 255), saturation(i / 255), 0, 1]);
}

export function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const hi = Math.max(r, g, b), lo = Math.min(r, g, b), delta = hi - lo, lightness = (hi + lo) / 2;
  if (delta < 0.000001) { return [0, 0, lightness]; }
  const hue = hi === r ? (g - b) / delta : hi === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return [wrap(hue / 6), delta / Math.max(0.000001, 1 - Math.abs(2 * lightness - 1)), lightness];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const channel = (offset: number): number => l + chroma * (clamp(Math.abs(wrap(h + offset) * 6 - 3) - 1) - 0.5);
  return [channel(0), channel(2 / 3), channel(1 / 3)];
}

function range(v: number, low: number, high: number, soft: number): number {
  if (low > high) { return 0; }
  if (v >= low && v <= high) { return 1; }
  if (soft <= 0) { return 0; }
  return v < low ? smooth((v - low + soft) / soft) : smooth((high + soft - v) / soft);
}

export function secondaryCoverage(hsl: Rgb, effect: ClipSecondaryColorEffect): number {
  const [h, s, l] = hsl, width = effect.hueWidth ?? 180, softness = effect.rangeSoftness ?? 0.1;
  const distance = Math.abs(wrap(h - (effect.hueCenter ?? 0) / 360 + 0.5) - 0.5) * 360;
  const hue = width >= 180 ? 1 : range(distance, 0, width, effect.hueSoftness ?? 15) * smooth(s / 0.01);
  return hue * range(s, effect.saturationMin ?? 0, effect.saturationMax ?? 1, softness)
    * range(l, effect.lightnessMin ?? 0, effect.lightnessMax ?? 1, softness);
}

export function secondaryRgb(rgb: Rgb, effect: ClipSecondaryColorEffect, curve: readonly (readonly number[])[]): [number, number, number] {
  const hsl = rgbToHsl(rgb), mask = secondaryCoverage(hsl, effect);
  const at = hsl[0] * 255, lo = Math.floor(at), hi = Math.min(255, lo + 1), fraction = at - lo;
  const sample = (channel: number): number => {
    const a = curve[lo]?.[channel] ?? 0.5, b = curve[hi]?.[channel] ?? 0.5;
    return a + (b - a) * fraction;
  };
  const corrected = hslToRgb(wrap(hsl[0] + (effect.hueShift ?? 0) / 360 + sample(0) - 0.5),
    clamp(hsl[1] * (effect.saturation ?? 1) * 2 * sample(1)), clamp(hsl[2] + (effect.lightness ?? 0)));
  return [rgb[0] + (corrected[0] - rgb[0]) * mask, rgb[1] + (corrected[1] - rgb[1]) * mask,
    rgb[2] + (corrected[2] - rgb[2]) * mask];
}
