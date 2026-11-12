import type { ClipHueSatCurvesEffect, CurvePoint } from "../types.js";
import { cyclicCurve, hslToRgb, rgbToHsl } from "./secondaryColor.js";

type Rgb = readonly [number, number, number];
const clamp = (v: number): number => Math.max(0, Math.min(1, v));
const wrap = (v: number): number => v - Math.floor(v);
const CURVE_KEYS = ["hueVsSat", "hueVsHue", "hueVsLuma", "lumaVsSat", "satVsSat"] as const;

export function hueSatCurvesNeutral(effect: ClipHueSatCurvesEffect): boolean {
  return CURVE_KEYS.every(key => (effect[key] ?? []).every(point => point.y === 0.5));
}

/** Piecewise-linear curve held flat past its end points. No points is the neutral 0.5. */
function linearCurve(points: readonly CurvePoint[] | undefined): (x: number) => number {
  const ordered = (points ?? []).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
    .map(p => [clamp(p.x), clamp(p.y)] as const).sort((a, b) => a[0] - b[0]);
  return (x) => {
    const first = ordered[0], last = ordered.at(-1);
    if (!first || !last) { return 0.5; }
    if (x <= first[0]) { return first[1]; }
    if (x >= last[0]) { return last[1]; }
    for (let i = 1; i < ordered.length; i++) {
      const a = ordered[i - 1]!, b = ordered[i]!;
      if (x <= b[0]) { return b[0] > a[0] ? a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]) : b[1]; }
    }
    return last[1];
  };
}

/**
 * 512 rows: 0..255 are indexed by hue and hold (hue vs hue, hue vs sat, hue vs luma),
 * 256..511 are indexed by lightness or saturation and hold (luma vs sat, sat vs sat).
 */
export function hueSatCurvesTransfer(effect: ClipHueSatCurvesEffect): Array<[number, number, number, number]> {
  const hueHue = cyclicCurve(effect.hueVsHue), hueSat = cyclicCurve(effect.hueVsSat), hueLuma = cyclicCurve(effect.hueVsLuma);
  const lumaSat = linearCurve(effect.lumaVsSat), satSat = linearCurve(effect.satVsSat);
  const hue = Array.from({length: 256}, (_, i): [number, number, number, number] => [hueHue(i / 255), hueSat(i / 255), hueLuma(i / 255), 1]);
  const value = Array.from({length: 256}, (_, i): [number, number, number, number] => [lumaSat(i / 255), satSat(i / 255), 0, 1]);
  return [...hue, ...value];
}

function sample(table: readonly (readonly number[])[], offset: number, at: number, channel: number): number {
  const position = clamp(at) * 255, lo = Math.floor(position), hi = Math.min(255, lo + 1), fraction = position - lo;
  const a = table[offset + lo]?.[channel] ?? 0.5, b = table[offset + hi]?.[channel] ?? 0.5;
  return a + (b - a) * fraction;
}

export function hueSatCurvesRgb(rgb: Rgb, table: readonly (readonly number[])[]): [number, number, number] {
  const [h, s, l] = rgbToHsl(rgb);
  const hue = wrap(h + sample(table, 0, h, 0) - 0.5);
  const saturation = clamp(s * 2 * sample(table, 0, h, 1) * 2 * sample(table, 256, l, 0) * 2 * sample(table, 256, s, 1));
  const lightness = clamp(l + (sample(table, 0, h, 2) - 0.5) * s);
  return hslToRgb(hue, saturation, lightness);
}
