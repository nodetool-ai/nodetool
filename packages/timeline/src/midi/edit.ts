/**
 * Note-list edits: transpose, quantize, velocity scaling.
 *
 * Every function takes a note list and returns a new one with the same ids in
 * the same order — the caller replaces the clip's list wholesale, and an id
 * that survives is a note the editor's selection and undo still point at.
 * Nothing here reads the tempo: ticks are the grid, so a quantize is the same
 * arithmetic at 90 BPM and at 140.
 */

import type { MidiNote } from "../types.js";
import { MIDI_PPQ } from "./ticks.js";

/** The grids a quantize may snap to. `T` is a triplet: three in the space of two. */
export const QUANTIZE_DIVISIONS = [
  "1/4",
  "1/8",
  "1/16",
  "1/32",
  "1/8T",
  "1/16T"
] as const;

export type QuantizeDivision = (typeof QUANTIZE_DIVISIONS)[number];

const DIVISION_TICKS: Record<QuantizeDivision, number> = {
  "1/4": MIDI_PPQ,
  "1/8": MIDI_PPQ / 2,
  "1/16": MIDI_PPQ / 4,
  "1/32": MIDI_PPQ / 8,
  // A triplet division fits three notes where two of the plain division fit:
  // an eighth triplet is 2/3 of an eighth note.
  "1/8T": (MIDI_PPQ / 2) * (2 / 3),
  "1/16T": (MIDI_PPQ / 4) * (2 / 3)
};

/** How many ticks one grid step of `division` spans. */
export function divisionToTicks(division: QuantizeDivision): number {
  const ticks = DIVISION_TICKS[division];
  if (ticks === undefined) {
    throw new Error(
      `Unknown quantize division "${String(division)}"; expected one of ${QUANTIZE_DIVISIONS.join(", ")}.`
    );
  }
  return ticks;
}

/**
 * Move every note by `semitones`, clamping at the ends of the MIDI range.
 *
 * A note pushed past 127 is held there rather than dropped: the caller asked
 * to transpose a phrase, and losing its top note silently is worse than a
 * flattened octave the caller can see and undo.
 */
export function transposeNotes(
  notes: ReadonlyArray<MidiNote>,
  semitones: number
): MidiNote[] {
  if (!Number.isInteger(semitones)) {
    throw new Error(
      `semitones must be a whole number of semitones; got ${String(semitones)}.`
    );
  }
  return notes.map((note) => ({
    ...note,
    pitch: Math.min(127, Math.max(0, note.pitch + semitones))
  }));
}

/** What a quantize moves: onsets only, or onsets and held lengths. */
export type QuantizeTarget = "start" | "start_and_length";

export interface QuantizeOptions {
  division: QuantizeDivision;
  /** How far toward the grid each note travels, 0..1. Default 1 (all the way). */
  strength?: number;
  /** Default `"start"`. */
  target?: QuantizeTarget;
}

/**
 * Snap onsets to the grid.
 *
 * `strength` interpolates between where the note is and where the grid wants
 * it, so a partly-quantized part keeps its feel; at 0 nothing moves at all.
 * With `start_and_length` the held length is rounded to whole grid steps, but
 * the rounded target is never zero — a note quantized out of existence is a
 * note the document cannot store.
 */
export function quantizeNotes(
  notes: ReadonlyArray<MidiNote>,
  options: QuantizeOptions
): MidiNote[] {
  const grid = divisionToTicks(options.division);
  const strength = options.strength ?? 1;
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) {
    throw new Error(`strength must be between 0 and 1; got ${String(strength)}.`);
  }
  const target = options.target ?? "start";

  return notes.map((note) => {
    const startTarget = Math.round(note.startTick / grid) * grid;
    const startTick = Math.max(
      0,
      Math.round(note.startTick + (startTarget - note.startTick) * strength)
    );
    if (target === "start") return { ...note, startTick };

    const lengthTarget = Math.max(
      grid,
      Math.round(note.durationTick / grid) * grid
    );
    const durationTick = Math.max(
      1,
      Math.round(note.durationTick + (lengthTarget - note.durationTick) * strength)
    );
    return { ...note, startTick, durationTick };
  });
}

/**
 * Scale every velocity, clamped to the 1..127 the document stores. A note is
 * never scaled to silence — velocity 0 is a note-off in MIDI, not a quiet note.
 */
export function scaleVelocity(
  notes: ReadonlyArray<MidiNote>,
  factor: number
): MidiNote[] {
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new Error(`factor must be a positive number; got ${String(factor)}.`);
  }
  return notes.map((note) => ({
    ...note,
    velocity: Math.min(127, Math.max(1, Math.round(note.velocity * factor)))
  }));
}
