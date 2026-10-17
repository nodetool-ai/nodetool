/**
 * Chord-track ticks against the timeline's milliseconds, and the beat grid
 * chords snap to. Chord ticks count from `tempo.offsetMs`.
 */

import { MIDI_PPQ, msToTicks, ticksToMs } from "@nodetool-ai/timeline";
import type { TimelineTempo } from "@nodetool-ai/timeline";

import type { ChordSnap } from "./harmonyUIStore";

export const docTickToMs = (tick: number, tempo: TimelineTempo): number =>
  tempo.offsetMs + ticksToMs(tick, tempo.bpm);

export const msToDocTick = (ms: number, tempo: TimelineTempo): number =>
  msToTicks(ms - tempo.offsetMs, tempo.bpm);

export const beatTicks = (tempo: TimelineTempo): number =>
  (MIDI_PPQ * 4) / Math.max(1, tempo.timeSignature.beatUnit);

export const barTicks = (tempo: TimelineTempo): number =>
  beatTicks(tempo) * Math.max(1, tempo.timeSignature.beatsPerBar);

export function snapTicks(tempo: TimelineTempo, snap: ChordSnap): number {
  if (snap === "bar") return barTicks(tempo);
  if (snap === "beat") return beatTicks(tempo);
  return MIDI_PPQ / 4;
}

/** `tick` rounded down to the snap grid, never before tick 0. */
export const snapDown = (tick: number, step: number): number =>
  Math.max(0, Math.floor(tick / step + 1e-9) * step);

/** `tick` rounded to the nearest grid line, never before tick 0. */
export const snapNearest = (tick: number, step: number): number =>
  Math.max(0, Math.round(tick / step) * step);

/** Pitch-class hue FableSynth colours chords by. */
export const chordHue = (root: number): number => root * 30;
