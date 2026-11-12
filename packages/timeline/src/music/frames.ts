/**
 * Musical time in 48 kHz frames (MUSIC-MODE.md MD8, MT-4).
 *
 * Milliseconds stay the stored clock. Every position music mode writes is a
 * whole frame at `MUSIC_SAMPLE_RATE`, and a bar or beat line is computed from
 * its number each time, never by adding bar lengths, so bar 10000 lands on
 * the same frame as a direct computation does. BPM counts quarter notes in
 * every signature, as in `midi/grid.ts`: a 6/8 beat is an eighth note.
 *
 * `native/timeline/src/music/MusicTime.cpp` is the port. The music oracle in
 * `native/timeline/src/music/music-oracle.test.ts` holds it to these values.
 */

import { MUSIC_SAMPLE_RATE } from "@nodetool-ai/protocol";
import type { TimelineTempo } from "../types.js";

export { MUSIC_SAMPLE_RATE };

/** The tempo fields frame math reads. */
export type MusicTempo = Pick<TimelineTempo, "bpm" | "offsetMs" | "timeSignature">;

/** A grid a range edge snaps to (MT-3). */
export type MusicGridDivision = "bar" | "beat";

/** Frames per millisecond. A clip start is `frame / 48` ms (MD8). */
const FRAMES_PER_MS = MUSIC_SAMPLE_RATE / 1000;

function assertMusicTempo(tempo: MusicTempo): void {
  if (!Number.isFinite(tempo.bpm) || tempo.bpm <= 0) {
    throw new Error(`bpm must be a positive number; got ${String(tempo.bpm)}.`);
  }
  const { beatsPerBar, beatUnit } = tempo.timeSignature;
  if (!Number.isFinite(beatsPerBar) || beatsPerBar <= 0) {
    throw new Error(`beatsPerBar must be a positive number; got ${String(beatsPerBar)}.`);
  }
  if (!Number.isFinite(beatUnit) || beatUnit <= 0) {
    throw new Error(`beatUnit must be a positive number; got ${String(beatUnit)}.`);
  }
  if (!Number.isFinite(tempo.offsetMs)) {
    throw new Error(`offsetMs must be a finite number; got ${String(tempo.offsetMs)}.`);
  }
}

/**
 * The first frame of bar `bar`, counted from 1 at `tempo.offsetMs`:
 * `round((offsetMs / 1000 + (bar - 1) * beatsPerBar * (4 / beatUnit) * 60 / bpm) * 48000)`.
 * Bars before beat one (0 and below) give earlier, possibly negative frames.
 */
export function barStartFrame(bar: number, tempo: MusicTempo): number {
  assertMusicTempo(tempo);
  const { beatsPerBar, beatUnit } = tempo.timeSignature;
  return Math.round(
    (tempo.offsetMs / 1000 + (bar - 1) * beatsPerBar * (4 / beatUnit) * 60 / tempo.bpm) *
      MUSIC_SAMPLE_RATE
  );
}

/**
 * The first frame of beat `beat`, counted from 1 at `tempo.offsetMs` across
 * bars: beat `(bar - 1) * beatsPerBar + 1` starts on `barStartFrame(bar)`.
 */
export function beatStartFrame(beat: number, tempo: MusicTempo): number {
  assertMusicTempo(tempo);
  return Math.round(
    (tempo.offsetMs / 1000 + (beat - 1) * (4 / tempo.timeSignature.beatUnit) * 60 / tempo.bpm) *
      MUSIC_SAMPLE_RATE
  );
}

/** One beat in frames, rounded once. */
export function beatLengthFrames(tempo: MusicTempo): number {
  assertMusicTempo(tempo);
  return Math.round((4 / tempo.timeSignature.beatUnit) * 60 / tempo.bpm * MUSIC_SAMPLE_RATE);
}

/** A frame as stored milliseconds. */
export function frameToMs(frame: number): number {
  return frame / FRAMES_PER_MS;
}

/** The nearest frame to a stored millisecond value. */
export function msToFrame(ms: number): number {
  return Math.round(ms * FRAMES_PER_MS);
}

function lineFrame(n: number, tempo: MusicTempo, division: MusicGridDivision): number {
  return division === "bar" ? barStartFrame(n, tempo) : beatStartFrame(n, tempo);
}

function lineSeconds(tempo: MusicTempo, division: MusicGridDivision): number {
  const beat = (4 / tempo.timeSignature.beatUnit) * 60 / tempo.bpm;
  return division === "bar" ? beat * tempo.timeSignature.beatsPerBar : beat;
}

function assertFrame(frame: number): void {
  if (!Number.isFinite(frame)) {
    throw new Error(`frame must be a finite number; got ${String(frame)}.`);
  }
}

/**
 * The number of the last bar or beat line at or before `frame`. The estimate
 * from the line length is corrected against the rounded line frames, so the
 * answer agrees with `barStartFrame` and `beatStartFrame` exactly.
 */
export function gridLineAtOrBefore(
  frame: number,
  tempo: MusicTempo,
  division: MusicGridDivision
): number {
  assertMusicTempo(tempo);
  assertFrame(frame);
  let n =
    Math.floor((frame / MUSIC_SAMPLE_RATE - tempo.offsetMs / 1000) / lineSeconds(tempo, division)) + 1;
  while (lineFrame(n, tempo, division) > frame) n -= 1;
  while (lineFrame(n + 1, tempo, division) <= frame) n += 1;
  return n;
}

/** The number of the first bar or beat line at or after `frame`. */
export function gridLineAtOrAfter(
  frame: number,
  tempo: MusicTempo,
  division: MusicGridDivision
): number {
  const n = gridLineAtOrBefore(frame, tempo, division);
  return lineFrame(n, tempo, division) === frame ? n : n + 1;
}

/**
 * The frame of the bar or beat line nearest `frame` (MT-3). A tie goes to the
 * earlier line. Lines before frame 0 are skipped, so the result is never negative.
 */
export function snapFrameToGrid(
  frame: number,
  tempo: MusicTempo,
  division: MusicGridDivision
): number {
  const n = gridLineAtOrBefore(frame, tempo, division);
  const before = lineFrame(n, tempo, division);
  const after = lineFrame(n + 1, tempo, division);
  if (before < 0) return after;
  return frame - before <= after - frame ? before : after;
}
