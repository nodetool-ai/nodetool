/**
 * Ticks ↔ milliseconds.
 *
 * Milliseconds are the timeline's stored master clock; ticks are how a note
 * says where it sits inside its clip's content. The conversion is the only
 * place the two meet, so a tempo change is a rescale of stored milliseconds
 * (`tempo.ts`) rather than a reinterpretation of every note.
 */

import type { MidiNote } from "../types.js";

/** Ticks per quarter note. */
export const MIDI_PPQ = 960;

/** Milliseconds one quarter note lasts at `bpm`. */
function msPerQuarter(bpm: number): number {
  return 60000 / bpm;
}

/** How long `ticks` last at `bpm`, in milliseconds. */
export function ticksToMs(ticks: number, bpm: number): number {
  return (ticks / MIDI_PPQ) * msPerQuarter(bpm);
}

/** How many ticks fit in `ms` at `bpm`. Fractional — round at the caller. */
export function msToTicks(ms: number, bpm: number): number {
  return (ms / msPerQuarter(bpm)) * MIDI_PPQ;
}

/**
 * A note's window in milliseconds, relative to the clip's *content* start —
 * not to the clip's window. Compare against `[inPointMs, inPointMs +
 * durationMs)` to decide whether the clip plays it.
 */
export function noteWindowMs(
  note: Pick<MidiNote, "startTick" | "durationTick">,
  bpm: number
): { startMs: number; endMs: number } {
  const startMs = ticksToMs(note.startTick, bpm);
  return {
    startMs,
    endMs: startMs + ticksToMs(note.durationTick, bpm)
  };
}
