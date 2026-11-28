/**
 * Cutting curves of midi content: the value in force at a tick, and a note's
 * expression curve ended at a given length. Split and region loop share them.
 */

import type { MidiExpressionPoint, MidiNote } from "../types.js";

/** Value of a curve at `tick`: linear between points, held outside. */
export function curveValueAt(
  points: ReadonlyArray<{ tick: number; value: number }>,
  tick: number,
  step = false
): number | undefined {
  let prev: { tick: number; value: number } | undefined;
  for (const p of points) {
    if (p.tick <= tick) {
      prev = p;
      continue;
    }
    if (!prev) return undefined;
    if (step) return prev.value;
    return (
      prev.value +
      ((p.value - prev.value) * (tick - prev.tick)) / (p.tick - prev.tick)
    );
  }
  return prev?.value;
}

/**
 * A note's expression curves ended at `length` ticks from the note start.
 * Points past the end are dropped and an interpolated point lands on the end,
 * so a ramp that crosses the cut ends at the cut instead of the prior key.
 */
export function expressionUpTo(
  expression: NonNullable<MidiNote["expression"]>,
  length: number
): MidiNote["expression"] | undefined {
  const out: NonNullable<MidiNote["expression"]> = {};
  for (const key of ["pitch", "volume", "pan", "brightness"] as const) {
    const points = expression[key];
    if (!points?.length) continue;
    const kept: MidiExpressionPoint[] = points.filter((p) => p.tick <= length);
    const lastKept = kept[kept.length - 1];
    if (kept.length < points.length && (!lastKept || lastKept.tick < length)) {
      const value = curveValueAt(points, length);
      if (value !== undefined && lastKept) kept.push({ tick: length, value });
    }
    if (kept.length > 0) out[key] = kept;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
