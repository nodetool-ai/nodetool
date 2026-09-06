/**
 * The piano roll's pixel math: ticks ↔ x, pitch ↔ y, and what sits under a
 * pointer.
 *
 * Kept out of the component for the same reason `tempoGrid.ts` is: a hit test
 * that is only exercised through a canvas is a hit test nobody tests. Every
 * function here takes a `PianoRollGeometry` — the viewport's scroll and zoom —
 * so the drawing code, the pointer handlers and the tests all read the same
 * mapping.
 *
 * y counts down from `topPitch`, the pitch drawn on the first row, because
 * that is how a canvas and a keyboard both run: high notes at the top.
 */

import type { MidiNote } from "@nodetool-ai/timeline";

/** How wide the grab zone on a note's right edge is. */
export const NOTE_END_GRIP_PX = 8;

export interface PianoRollGeometry {
  /** Horizontal zoom. */
  pxPerTick: number;
  /** The tick drawn at x = 0. */
  scrollTick: number;
  /** Height of one semitone row. */
  rowHeightPx: number;
  /** The pitch drawn on the top row. */
  topPitch: number;
}

/** Where a tick sits, in grid-local pixels. */
export function tickToX(tick: number, geometry: PianoRollGeometry): number {
  return (tick - geometry.scrollTick) * geometry.pxPerTick;
}

/** Which tick a grid-local x is over. Fractional — snap at the caller. */
export function xToTick(x: number, geometry: PianoRollGeometry): number {
  if (geometry.pxPerTick <= 0) return geometry.scrollTick;
  return geometry.scrollTick + x / geometry.pxPerTick;
}

/** The top edge of a pitch's row, in grid-local pixels. */
export function pitchToY(pitch: number, geometry: PianoRollGeometry): number {
  return (geometry.topPitch - pitch) * geometry.rowHeightPx;
}

/** Which pitch a grid-local y is over. Not clamped — the caller decides. */
export function yToPitch(y: number, geometry: PianoRollGeometry): number {
  if (geometry.rowHeightPx <= 0) return geometry.topPitch;
  return geometry.topPitch - Math.floor(y / geometry.rowHeightPx);
}

/** A note's rectangle in grid-local pixels. */
export interface NotePixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where a note draws. The width has a one-pixel floor so a very short note at
 * a very low zoom is still visible and still clickable.
 */
export function noteRect(
  note: MidiNote,
  geometry: PianoRollGeometry
): NotePixelRect {
  const x = tickToX(note.startTick, geometry);
  return {
    x,
    y: pitchToY(note.pitch, geometry),
    width: Math.max(1, note.durationTick * geometry.pxPerTick),
    height: geometry.rowHeightPx
  };
}

/** Which part of a note a pointer landed on. */
export type NoteHitEdge = "body" | "end";

export interface NoteHit {
  note: MidiNote;
  edge: NoteHitEdge;
}

/**
 * The note under a grid-local point, or null.
 *
 * Later notes win, so the one drawn on top of an overlap is the one a click
 * takes. The last `NOTE_END_GRIP_PX` of a note is its resize grip, capped at
 * half the note's width — otherwise a note narrower than the grip could only
 * ever be resized, never moved.
 */
export function hitTestNote(
  notes: ReadonlyArray<MidiNote>,
  x: number,
  y: number,
  geometry: PianoRollGeometry
): NoteHit | null {
  for (let i = notes.length - 1; i >= 0; i--) {
    const note = notes[i]!;
    const rect = noteRect(note, geometry);
    if (x < rect.x || x >= rect.x + rect.width) continue;
    if (y < rect.y || y >= rect.y + rect.height) continue;
    const grip = Math.min(NOTE_END_GRIP_PX, rect.width / 2);
    const edge: NoteHitEdge =
      x >= rect.x + rect.width - grip ? "end" : "body";
    return { note, edge };
  }
  return null;
}

/** The black keys of an octave, as semitone offsets from C. */
const BLACK_KEY_OFFSETS = new Set([1, 3, 6, 8, 10]);

/** Whether a pitch is a black key — C♯, D♯, F♯, G♯, A♯. */
export function isBlackKey(pitch: number): boolean {
  return BLACK_KEY_OFFSETS.has(((pitch % 12) + 12) % 12);
}

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B"
] as const;

/** A pitch's name in scientific pitch notation, with middle C (60) as `C4`. */
export function pitchName(pitch: number): string {
  const semitone = ((pitch % 12) + 12) % 12;
  const octave = Math.floor(pitch / 12) - 1;
  return `${NOTE_NAMES[semitone]}${octave}`;
}

/** Middle C. */
export const MIDDLE_C = 60;
/** C3 — the bottom of the default view. */
export const DEFAULT_LOW_PITCH = 48;
/** C5 — the top of the default view. */
export const DEFAULT_HIGH_PITCH = 72;

/**
 * The pitch to draw on the top row so a clip's notes land in the middle of a
 * `visibleRows`-tall view. An empty clip opens on C3..C5, which is where a
 * part gets written before it is written.
 */
export function initialTopPitch(
  notes: ReadonlyArray<MidiNote>,
  visibleRows: number
): number {
  const rows = Math.max(1, Math.floor(visibleRows));
  const low = notes.length > 0
    ? Math.min(...notes.map((note) => note.pitch))
    : DEFAULT_LOW_PITCH;
  const high = notes.length > 0
    ? Math.max(...notes.map((note) => note.pitch))
    : DEFAULT_HIGH_PITCH;
  const centre = (low + high) / 2;
  const top = Math.round(centre + rows / 2);
  // The view never runs off either end of the MIDI range: 127 is the highest
  // pitch there is a row for, and a view shorter than the range must keep its
  // bottom row at or above 0.
  return Math.min(127, Math.max(rows - 1, top));
}
