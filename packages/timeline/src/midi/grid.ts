/**
 * Bars, beats, and the tempo grid a ruler draws.
 *
 * Milliseconds stay the master clock, so everything here is a reading of a
 * time against the tempo rather than a second clock: `barsBeatsAt` answers
 * where a millisecond falls in the bar, and `tempoGridMs` answers which
 * milliseconds a grid line sits on. A beat is one `beatUnit` note — in 6/8 it
 * is an eighth — while a note division (`1/16`) always means the note value,
 * so a sixteenth grid is the same spacing in 4/4 and in 6/8.
 */

import { MAX_BEAT_GRID_POINTS } from "../beats.js";
import type { TimelineTempo } from "../types.js";
import { divisionToTicks, type QuantizeDivision } from "./edit.js";
import { MIDI_PPQ, ticksToMs } from "./ticks.js";

/** Where a time falls on the bar grid. `bar` and `beat` count from 1. */
export interface BarsBeats {
  bar: number;
  beat: number;
  /** Ticks into the beat, 0..MIDI_PPQ-1. */
  tick: number;
}

function assertTempo(tempo: TimelineTempo): void {
  if (!Number.isFinite(tempo.bpm) || tempo.bpm <= 0) {
    throw new Error(`bpm must be a positive number; got ${String(tempo.bpm)}.`);
  }
  const { beatsPerBar, beatUnit } = tempo.timeSignature;
  if (!Number.isFinite(beatsPerBar) || beatsPerBar <= 0) {
    throw new Error(
      `beatsPerBar must be a positive number; got ${String(beatsPerBar)}.`
    );
  }
  if (!Number.isFinite(beatUnit) || beatUnit <= 0) {
    throw new Error(
      `beatUnit must be a positive number; got ${String(beatUnit)}.`
    );
  }
}

/** How long one beat lasts. BPM counts quarter notes, so 6/8 halves it. */
export function beatDurationMs(tempo: TimelineTempo): number {
  assertTempo(tempo);
  return (60000 / tempo.bpm) * (4 / tempo.timeSignature.beatUnit);
}

/** How long one bar lasts. */
export function barDurationMs(tempo: TimelineTempo): number {
  return beatDurationMs(tempo) * tempo.timeSignature.beatsPerBar;
}

/** Where bar `bar` starts, in ms. Bar 1 starts at `tempo.offsetMs`. */
export function barStartMs(bar: number, tempo: TimelineTempo): number {
  return tempo.offsetMs + (bar - 1) * barDurationMs(tempo);
}

/**
 * Read a timeline time as bar, beat and tick.
 *
 * Times before `offsetMs` are not clamped — they read as bar 0 and downward,
 * which is what a ruler drawn to the left of beat one has to show.
 */
export function barsBeatsAt(ms: number, tempo: TimelineTempo): BarsBeats {
  const beatMs = beatDurationMs(tempo);
  const beatsPerBar = tempo.timeSignature.beatsPerBar;
  const relativeMs = ms - tempo.offsetMs;
  const beatIndex = Math.floor(relativeMs / beatMs);
  const intoBeatMs = relativeMs - beatIndex * beatMs;
  const tick = Math.min(
    MIDI_PPQ - 1,
    Math.max(0, Math.floor((intoBeatMs / beatMs) * MIDI_PPQ))
  );
  const barIndex = Math.floor(beatIndex / beatsPerBar);
  const beatInBar = beatIndex - barIndex * beatsPerBar;
  return { bar: barIndex + 1, beat: beatInBar + 1, tick };
}

/** `"3.2.480"` — bar, beat, tick. */
export function formatBarsBeats(ms: number, tempo: TimelineTempo): string {
  const { bar, beat, tick } = barsBeatsAt(ms, tempo);
  return `${bar}.${beat}.${tick}`;
}

/** A grid line every bar, every beat, or every note division. */
export type TempoGridDivision = QuantizeDivision | "bar" | "beat";

export interface TempoGridSpec {
  tempo: TimelineTempo;
  division: TempoGridDivision;
  fromMs: number;
  toMs: number;
}

/** How far apart `division`'s grid lines sit, in ms. */
function gridIntervalMs(
  tempo: TimelineTempo,
  division: TempoGridDivision
): number {
  if (division === "bar") return barDurationMs(tempo);
  if (division === "beat") return beatDurationMs(tempo);
  return ticksToMs(divisionToTicks(division), tempo.bpm);
}

/**
 * The grid times inside `[fromMs, toMs]`, ascending and inclusive of both ends.
 *
 * Each time is `offset + i * interval`, never an accumulated sum: a fractional
 * interval (140 BPM is 428.571… ms) drifts under accumulation and stops
 * landing on the boundaries a snap compares against.
 */
export function tempoGridMs(spec: TempoGridSpec): number[] {
  const interval = gridIntervalMs(spec.tempo, spec.division);
  if (!Number.isFinite(interval) || interval <= 0) {
    throw new Error(
      `A ${spec.division} grid has no positive interval at ${spec.tempo.bpm} BPM.`
    );
  }
  if (!Number.isFinite(spec.fromMs) || !Number.isFinite(spec.toMs)) {
    throw new Error("fromMs and toMs must both be times in ms.");
  }
  if (spec.toMs < spec.fromMs) return [];

  // A boundary that lands on a grid line must be included, so the index
  // arithmetic is nudged by a fraction of a tick rather than trusting the
  // division to come out exact.
  const epsilon = 1e-9;
  const firstIndex = Math.ceil(
    (spec.fromMs - spec.tempo.offsetMs) / interval - epsilon
  );
  const lastIndex = Math.floor(
    (spec.toMs - spec.tempo.offsetMs) / interval + epsilon
  );
  const count = lastIndex - firstIndex + 1;
  if (count <= 0) return [];
  if (count > MAX_BEAT_GRID_POINTS) {
    throw new Error(
      `A ${spec.division} grid over ${spec.fromMs}..${spec.toMs}ms holds ${count} lines; at most ${MAX_BEAT_GRID_POINTS}.`
    );
  }

  const times: number[] = [];
  for (let i = firstIndex; i <= lastIndex; i++) {
    times.push(spec.tempo.offsetMs + i * interval);
  }
  return times;
}
