/**
 * Pure functions of the Step Editor: lane sets, step grid maths and the
 * drawing rules for controller and note lanes. The web and the native editor
 * share these names, rules and test vectors.
 */

import type { MidiControllerLane, MidiControllerPoint, MidiNote } from "../types.js";

/** A GM drum lane: the pitch and its display name. */
export interface GmDrumLane {
  pitch: number;
  name: string;
}

/** The `GM Drums` lane set, in lane order. */
export const GM_DRUM_LANES: ReadonlyArray<GmDrumLane> = [
  { pitch: 36, name: "Kick" },
  { pitch: 38, name: "Snare" },
  { pitch: 40, name: "Snare 2" },
  { pitch: 37, name: "Side Stick" },
  { pitch: 39, name: "Clap" },
  { pitch: 42, name: "Closed Hi-Hat" },
  { pitch: 44, name: "Pedal Hi-Hat" },
  { pitch: 46, name: "Open Hi-Hat" },
  { pitch: 41, name: "Low Tom" },
  { pitch: 45, name: "Mid Tom" },
  { pitch: 48, name: "High Tom" },
  { pitch: 49, name: "Crash" },
  { pitch: 51, name: "Ride" },
  { pitch: 53, name: "Ride Bell" },
  { pitch: 54, name: "Tambourine" },
  { pitch: 56, name: "Cowbell" }
];

/** One lane of a lane set. */
export type StepLane =
  | { type: "note"; pitch: number }
  | { type: "controller"; laneId: string };

/**
 * The `Automatic` lane set: one note lane per used pitch, highest first, then
 * one lane per controller lane in list order.
 */
export function automaticLanes(
  notes: ReadonlyArray<Pick<MidiNote, "pitch">>,
  controllers: ReadonlyArray<Pick<MidiControllerLane, "id">> | undefined
): StepLane[] {
  const pitches = [...new Set(notes.map((n) => n.pitch))].sort((a, b) => b - a);
  return [
    ...pitches.map((pitch): StepLane => ({ type: "note", pitch })),
    ...(controllers ?? []).map(
      (lane): StepLane => ({ type: "controller", laneId: lane.id })
    )
  ];
}

/** The value under a pointer at `y` in a row `height` px tall. Never -0. */
export function valueFromY(
  y: number,
  height: number,
  min: number,
  max: number
): number {
  const raw = Math.round(min + (1 - y / height) * (max - min));
  const clamped = Math.min(max, Math.max(min, raw));
  return clamped === 0 ? 0 : clamped;
}

/** The start tick of the grid step that holds `tick`. */
export function stepStartTick(tick: number, step: number, phase: number): number {
  return phase + Math.floor((tick - phase) / step) * step;
}

/**
 * Set the value of the first point inside the step, or add a point at the step
 * start. The result is sorted by tick (stable).
 */
export function drawStep(
  points: ReadonlyArray<MidiControllerPoint>,
  stepStart: number,
  step: number,
  value: number,
  newId: () => string
): MidiControllerPoint[] {
  let hit = -1;
  points.forEach((p, i) => {
    if (p.tick < stepStart || p.tick >= stepStart + step) return;
    if (hit < 0 || p.tick < points[hit].tick) hit = i;
  });
  const next =
    hit >= 0
      ? points.map((p, i) => (i === hit ? { ...p, value } : { ...p }))
      : [...points.map((p) => ({ ...p })), { id: newId(), tick: stepStart, value }];
  return next
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p.tick - b.p.tick || a.i - b.i)
    .map((x) => x.p);
}

/**
 * Note-lane form of `drawStep`: set the velocity of the first note of `pitch`
 * that starts in the step, or append a new note. Velocity is clamped to 1..127.
 */
export function drawNoteStep(
  notes: ReadonlyArray<MidiNote>,
  pitch: number,
  stepStart: number,
  step: number,
  velocity: number,
  length: number,
  newId: () => string
): MidiNote[] {
  const v = Math.min(127, Math.max(1, Math.round(velocity)));
  let hit = -1;
  notes.forEach((n, i) => {
    if (n.pitch !== pitch) return;
    if (n.startTick < stepStart || n.startTick >= stepStart + step) return;
    if (hit < 0 || n.startTick < notes[hit].startTick) hit = i;
  });
  if (hit >= 0) return notes.map((n, i) => (i === hit ? { ...n, velocity: v } : n));
  return [
    ...notes,
    {
      id: newId(),
      pitch,
      startTick: stepStart,
      durationTick: length,
      velocity: v,
      channel: 0
    }
  ];
}

/** The step values along a line from (t0, v0) to (t1, v1). */
export function lineSteps(
  t0: number,
  v0: number,
  t1: number,
  v1: number,
  step: number,
  phase: number
): Array<{ tick: number; value: number }> {
  const first = stepStartTick(Math.min(t0, t1), step, phase);
  const last = stepStartTick(Math.max(t0, t1), step, phase);
  const out: Array<{ tick: number; value: number }> = [];
  for (let s = first; s <= last; s += step) {
    let value = v1;
    if (t0 !== t1) {
      const f = Math.min(1, Math.max(0, (s - t0) / (t1 - t0)));
      value = v0 + (v1 - v0) * f;
    }
    out.push({ tick: s, value: Math.round(value) });
  }
  return out;
}

/** Scale values around `min`. The caller clamps to the lane range. */
export function scaleValues(
  values: ReadonlyArray<number>,
  percent: number,
  min: number
): number[] {
  return values.map((v) => Math.round(min + ((v - min) * percent) / 100));
}

/** The ids to remove: every second id in tick order, starting with the second. */
export function thinOut(ids: ReadonlyArray<string>): string[] {
  return ids.filter((_, i) => i % 2 === 1);
}
