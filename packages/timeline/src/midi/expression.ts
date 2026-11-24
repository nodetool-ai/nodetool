/**
 * Per-note expression curves: the kinds, their neutral values and ranges, and
 * the value of a curve at a tick. Kept apart from `controllers.ts` so note
 * editing can read them without importing loop expansion.
 */

import type { MidiExpressionPoint, MidiNote, MidiNoteExpression } from "../types.js";

/** Most points one expression curve of one note may carry. */
export const MIDI_MAX_EXPRESSION_POINTS_PER_NOTE = 256;

export type MidiExpressionKind = keyof MidiNoteExpression;
export const MIDI_EXPRESSION_KINDS: ReadonlyArray<MidiExpressionKind> = [
  "pitch",
  "volume",
  "pan",
  "brightness"
];

/** The value before a curve's first point, and the range it may take. */
export const MIDI_EXPRESSION_SPEC: Record<
  MidiExpressionKind,
  { neutral: number; min: number; max: number }
> = {
  pitch: { neutral: 0, min: -48, max: 48 },
  volume: { neutral: 1, min: 0, max: 4 },
  pan: { neutral: 0, min: -1, max: 1 },
  brightness: { neutral: 0.5, min: 0, max: 1 }
};

/**
 * An expression curve's value at `tick` (from the note's start): the neutral
 * value before the first point, a linear blend between points, the last value
 * after the last point.
 */
export function expressionValueAt(
  points: ReadonlyArray<MidiExpressionPoint> | undefined,
  tick: number,
  neutral: number
): number {
  if (!points || points.length === 0 || tick < points[0].tick) return neutral;
  const last = points[points.length - 1];
  if (tick >= last.tick) return last.value;
  for (let i = 1; i < points.length; i++) {
    const b = points[i];
    if (tick < b.tick) {
      const a = points[i - 1];
      const span = b.tick - a.tick;
      return span <= 0 ? b.value : a.value + ((b.value - a.value) * (tick - a.tick)) / span;
    }
  }
  return last.value;
}

/** Problems with a note's expression curves. Called by `validateNotes`. */
export function expressionProblems(note: MidiNote): string[] {
  const out: string[] = [];
  if (!note.expression) return out;
  for (const kind of MIDI_EXPRESSION_KINDS) {
    const points = note.expression[kind];
    if (!points) continue;
    const { min, max } = MIDI_EXPRESSION_SPEC[kind];
    if (points.length > MIDI_MAX_EXPRESSION_POINTS_PER_NOTE) {
      out.push(
        `expression.${kind} has ${points.length} points; the limit is ${MIDI_MAX_EXPRESSION_POINTS_PER_NOTE}.`
      );
    }
    points.forEach((p, i) => {
      if (!Number.isInteger(p.tick) || p.tick < 0 || p.tick > note.durationTick) {
        out.push(
          `expression.${kind} tick must be an integer 0..${note.durationTick}, got ${p.tick}.`
        );
      }
      if (!Number.isFinite(p.value) || p.value < min || p.value > max) {
        out.push(`expression.${kind} value must be ${min}..${max}, got ${p.value}.`);
      }
      if (i > 0 && p.tick < points[i - 1].tick) {
        out.push(`expression.${kind} points must be sorted by tick.`);
      }
    });
  }
  return out;
}
