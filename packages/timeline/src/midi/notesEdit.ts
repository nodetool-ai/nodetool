/**
 * The note-list edits a piano roll performs: add, remove, move, resize, set a
 * velocity, duplicate, and pick what a marquee covers.
 *
 * Like `edit.ts`, everything here is a pure function over a note list and
 * nothing reads the tempo — ticks are the grid, so a drag one sixteenth to the
 * right is the same arithmetic at 90 BPM and at 140. Ids survive every edit
 * that does not mint a note, which is what lets the panel keep its selection
 * and the undo stack keep pointing at the same notes.
 *
 * A move clamps as a **group**: the selection's lowest onset and its pitch
 * extremes bound the delta, so dragging a chord into the left wall squashes
 * nothing — the whole chord stops together and its spacing survives.
 */

import { createTimeOrderedUuid } from "../defaults.js";
import type { MidiNote } from "../types.js";
import { DEFAULT_MIDI_VELOCITY } from "./notes.js";

/** The lowest pitch MIDI stores. */
export const MIN_MIDI_PITCH = 0;
/** The highest pitch MIDI stores. */
export const MAX_MIDI_PITCH = 127;
/** The quietest velocity the document stores — 0 is a note-off, not a note. */
export const MIN_MIDI_VELOCITY = 1;
/** The loudest velocity the document stores. */
export const MAX_MIDI_VELOCITY = 127;

/** What `addNote` needs to mint one. Velocity defaults to 100. */
export interface NewNoteSpec {
  pitch: number;
  startTick: number;
  durationTick: number;
  velocity?: number;
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

/**
 * Append one note.
 *
 * The pitch, onset and length are clamped to what the document can store, so a
 * click on the top row of the keyboard adds a note at 127 rather than one the
 * validator refuses.
 */
export function addNote(
  notes: ReadonlyArray<MidiNote>,
  spec: NewNoteSpec
): MidiNote[] {
  return [
    ...notes,
    {
      id: createTimeOrderedUuid(),
      pitch: Math.round(clamp(spec.pitch, MIN_MIDI_PITCH, MAX_MIDI_PITCH)),
      velocity: Math.round(
        clamp(
          spec.velocity ?? DEFAULT_MIDI_VELOCITY,
          MIN_MIDI_VELOCITY,
          MAX_MIDI_VELOCITY
        )
      ),
      startTick: Math.max(0, Math.round(spec.startTick)),
      durationTick: Math.max(1, Math.round(spec.durationTick))
    }
  ];
}

/** Drop every note whose id is listed. Ids that name nothing are ignored. */
export function removeNotes(
  notes: ReadonlyArray<MidiNote>,
  ids: Iterable<string>
): MidiNote[] {
  const drop = new Set(ids);
  if (drop.size === 0) return [...notes];
  return notes.filter((note) => !drop.has(note.id));
}

/** How far a move shifts the selection, in ticks and semitones. */
export interface NoteMoveDelta {
  deltaTick: number;
  deltaPitch: number;
}

/**
 * Move the named notes by a delta the *group* can afford.
 *
 * The applied delta is clamped once, against the selection's minimum onset and
 * its lowest and highest pitch, and then applied to every selected note — so
 * the notes keep their relative spacing however far the pointer travels past
 * the edge. Unselected notes are returned untouched, in place.
 */
export function moveNotes(
  notes: ReadonlyArray<MidiNote>,
  ids: Iterable<string>,
  delta: NoteMoveDelta
): MidiNote[] {
  const moving = new Set(ids);
  if (moving.size === 0) return [...notes];
  const selected = notes.filter((note) => moving.has(note.id));
  if (selected.length === 0) return [...notes];

  const minStart = Math.min(...selected.map((note) => note.startTick));
  const minPitch = Math.min(...selected.map((note) => note.pitch));
  const maxPitch = Math.max(...selected.map((note) => note.pitch));

  const tickShift = Math.max(Math.round(delta.deltaTick), -minStart);
  const pitchShift = clamp(
    Math.round(delta.deltaPitch),
    MIN_MIDI_PITCH - minPitch,
    MAX_MIDI_PITCH - maxPitch
  );

  if (tickShift === 0 && pitchShift === 0) return [...notes];

  return notes.map((note) =>
    moving.has(note.id)
      ? {
          ...note,
          startTick: note.startTick + tickShift,
          pitch: note.pitch + pitchShift
        }
      : note
  );
}

/**
 * Lengthen or shorten the named notes by `deltaTick`, holding their onsets.
 *
 * Each note stops at `minDurationTick` on its own: dragging a mixed-length
 * selection shorter collapses the short ones onto the minimum while the long
 * ones keep shrinking, which is what a DAW does and what keeps a one-note drag
 * from being bounded by some other note in the selection.
 */
export function resizeNotes(
  notes: ReadonlyArray<MidiNote>,
  ids: Iterable<string>,
  deltaTick: number,
  minDurationTick: number
): MidiNote[] {
  const resizing = new Set(ids);
  if (resizing.size === 0) return [...notes];
  const floor = Math.max(1, Math.round(minDurationTick));
  const shift = Math.round(deltaTick);
  return notes.map((note) =>
    resizing.has(note.id)
      ? {
          ...note,
          durationTick: Math.max(floor, note.durationTick + shift)
        }
      : note
  );
}

/** Set one velocity on every named note, clamped to 1..127. */
export function setVelocity(
  notes: ReadonlyArray<MidiNote>,
  ids: Iterable<string>,
  velocity: number
): MidiNote[] {
  const target = new Set(ids);
  if (target.size === 0) return [...notes];
  const value = Math.round(
    clamp(velocity, MIN_MIDI_VELOCITY, MAX_MIDI_VELOCITY)
  );
  return notes.map((note) =>
    target.has(note.id) ? { ...note, velocity: value } : note
  );
}

/**
 * Copy the named notes `offsetTick` later, appended after the originals.
 *
 * The copies get fresh ids — a duplicate that reused them would collide with
 * its source in the same list, and `validateNotes` reports that as a duplicate
 * id rather than storing it.
 */
export function duplicateNotes(
  notes: ReadonlyArray<MidiNote>,
  ids: Iterable<string>,
  offsetTick: number
): MidiNote[] {
  const source = new Set(ids);
  if (source.size === 0) return [...notes];
  const shift = Math.round(offsetTick);
  const copies = notes
    .filter((note) => source.has(note.id))
    .map((note) => ({
      ...note,
      id: createTimeOrderedUuid(),
      startTick: Math.max(0, note.startTick + shift)
    }));
  return [...notes, ...copies];
}

/** A marquee, in the piano roll's own units. Both pitch bounds are inclusive. */
export interface NoteRect {
  fromTick: number;
  toTick: number;
  minPitch: number;
  maxPitch: number;
}

/**
 * The notes a rectangle touches — **overlap**, not containment.
 *
 * A marquee dragged across the middle of a long note selects it; requiring the
 * whole note to be inside would make a held chord unselectable at any zoom
 * where it does not fit on screen.
 */
export function notesInRect(
  notes: ReadonlyArray<MidiNote>,
  rect: NoteRect
): MidiNote[] {
  const fromTick = Math.min(rect.fromTick, rect.toTick);
  const toTick = Math.max(rect.fromTick, rect.toTick);
  const lowPitch = Math.min(rect.minPitch, rect.maxPitch);
  const highPitch = Math.max(rect.minPitch, rect.maxPitch);
  return notes.filter(
    (note) =>
      note.pitch >= lowPitch &&
      note.pitch <= highPitch &&
      note.startTick + note.durationTick > fromTick &&
      note.startTick < toTick
  );
}

/**
 * The nearest grid tick at or after zero. A non-positive grid means "no grid",
 * and the tick comes back rounded but unmoved.
 */
export function snapTick(tick: number, gridTicks: number): number {
  if (!Number.isFinite(gridTicks) || gridTicks <= 0) {
    return Math.max(0, Math.round(tick));
  }
  return Math.max(0, Math.round(tick / gridTicks) * gridTicks);
}
