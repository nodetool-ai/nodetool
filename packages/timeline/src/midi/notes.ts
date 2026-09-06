/**
 * Note list helpers: minting, ordering, checking, and deciding which notes a
 * clip's window actually plays.
 *
 * `validateNotes` reports rather than throws, so an agent tool and the editor
 * can both show every problem in one pass instead of stopping at the first.
 */

import { createTimeOrderedUuid } from "../defaults.js";
import type { MidiNote, TimelineClip } from "../types.js";
import { noteWindowMs } from "./ticks.js";

/**
 * How many notes one midi clip may carry. Spelled out here rather than
 * imported: the package root has no runtime dependencies, and
 * `@nodetool-ai/protocol` is a value import once the constant comes from its
 * Zod module. The two are pinned equal by `tests/midi.protocolCompat.test.ts`.
 */
export const MIDI_MAX_NOTES_PER_CLIP = 4096;

/** Velocity a note gets when the caller does not say. */
export const DEFAULT_MIDI_VELOCITY = 100;

/** One problem found in a note list. `noteId` is absent when the list itself
 * is the problem (over the cap). */
export interface MidiNoteProblem {
  code:
    | "pitch_out_of_range"
    | "velocity_out_of_range"
    | "non_integer_tick"
    | "non_positive_duration"
    | "duplicate_id"
    | "too_many_notes";
  message: string;
  noteId?: string;
  index?: number;
}

/**
 * Mint a note, assigning an id and the default velocity when they are absent.
 * Ticks are content-relative and taken as given — `validateNotes` is where a
 * bad one is reported.
 */
export function createMidiNote(
  partial: Pick<MidiNote, "pitch" | "startTick" | "durationTick"> &
    Partial<MidiNote>
): MidiNote {
  return {
    id: partial.id ?? createTimeOrderedUuid(),
    pitch: partial.pitch,
    velocity: partial.velocity ?? DEFAULT_MIDI_VELOCITY,
    startTick: partial.startTick,
    durationTick: partial.durationTick
  };
}

/**
 * Notes in playback order — by onset, then by pitch so a chord's order is
 * stable across renders (the cache key and the mixdown both depend on it).
 */
export function sortNotes(notes: ReadonlyArray<MidiNote>): MidiNote[] {
  return [...notes].sort(
    (a, b) =>
      a.startTick - b.startTick || a.pitch - b.pitch || a.id.localeCompare(b.id)
  );
}

/** Every problem in a note list. An empty array means the list is storable. */
export function validateNotes(
  notes: ReadonlyArray<MidiNote>
): MidiNoteProblem[] {
  const problems: MidiNoteProblem[] = [];
  if (notes.length > MIDI_MAX_NOTES_PER_CLIP) {
    problems.push({
      code: "too_many_notes",
      message: `A clip carries at most ${MIDI_MAX_NOTES_PER_CLIP} notes; this list has ${notes.length}.`
    });
  }
  const seen = new Set<string>();
  notes.forEach((note, index) => {
    if (!Number.isInteger(note.pitch) || note.pitch < 0 || note.pitch > 127) {
      problems.push({
        code: "pitch_out_of_range",
        message: `pitch must be an integer 0..127, got ${note.pitch}.`,
        noteId: note.id,
        index
      });
    }
    if (
      !Number.isInteger(note.velocity) ||
      note.velocity < 1 ||
      note.velocity > 127
    ) {
      problems.push({
        code: "velocity_out_of_range",
        message: `velocity must be an integer 1..127, got ${note.velocity}.`,
        noteId: note.id,
        index
      });
    }
    if (!Number.isInteger(note.startTick) || note.startTick < 0) {
      problems.push({
        code: "non_integer_tick",
        message: `startTick must be an integer >= 0, got ${note.startTick}.`,
        noteId: note.id,
        index
      });
    }
    if (!Number.isInteger(note.durationTick)) {
      problems.push({
        code: "non_integer_tick",
        message: `durationTick must be an integer, got ${note.durationTick}.`,
        noteId: note.id,
        index
      });
    } else if (note.durationTick <= 0) {
      problems.push({
        code: "non_positive_duration",
        message: `durationTick must be > 0, got ${note.durationTick}.`,
        noteId: note.id,
        index
      });
    }
    if (seen.has(note.id)) {
      problems.push({
        code: "duplicate_id",
        message: `Two notes share the id "${note.id}".`,
        noteId: note.id,
        index
      });
    }
    seen.add(note.id);
  });
  return problems;
}

/**
 * The notes a clip's window triggers: those whose onset — in ms from the
 * content start — falls inside `[inPointMs, inPointMs + durationMs)`. A note
 * that started before the window is not re-triggered part way through (D3),
 * and one that runs past the window end is kept: the renderer gates it there.
 */
export function visibleNotes(
  clip: Pick<TimelineClip, "notes" | "inPointMs" | "durationMs">,
  bpm: number
): MidiNote[] {
  if (!clip.notes || clip.notes.length === 0) return [];
  const windowStartMs = clip.inPointMs ?? 0;
  const windowEndMs = windowStartMs + clip.durationMs;
  return sortNotes(clip.notes).filter((note) => {
    const { startMs } = noteWindowMs(note, bpm);
    return startMs >= windowStartMs && startMs < windowEndMs;
  });
}
