import type { ClipCurvesEffect, CurvePoint } from "../types.js";

function sorted(points: readonly CurvePoint[] | undefined): CurvePoint[] {
  return (points ?? []).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
    .slice().sort((a, b) => a.x - b.x);
}

function sample(points: readonly CurvePoint[], x: number): number {
  const first = points[0], last = points[points.length - 1];
  if (!first || !last) { return x; }
  if (x <= first.x) { return first.y; }
  if (x >= last.x) { return last.y; }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    if (x <= b.x) { return b.x <= a.x ? b.y : a.y + (x - a.x) / (b.x - a.x) * (b.y - a.y); }
  }
  return last.y;
}

/** Encoded RGB transfer samples, composed master first, then each channel. */
export function curveTransfer(effect: ClipCurvesEffect): Array<[number, number, number, number]> {
  const master = sorted(effect.master), channels = [sorted(effect.r), sorted(effect.g), sorted(effect.b)];
  return Array.from({length: 256}, (_, i): [number, number, number, number] => {
    const x = Math.max(0, Math.min(1, sample(master, i / 255)));
    const values = channels.map(points => Math.max(0, Math.min(1, sample(points, x))));
    return [values[0]!, values[1]!, values[2]!, 1];
  });
}

export function sampleTransfer(table: readonly (readonly number[])[], value: number, channel: number): number {
  const at = Math.max(0, Math.min(1, value)) * 255, lo = Math.floor(at), hi = Math.min(255, lo + 1);
  return table[lo]![channel]! + (table[hi]![channel]! - table[lo]![channel]!) * (at - lo);
}
