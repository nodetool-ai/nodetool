/**
 * What the lane under the piano roll grid can show, and the pixel math for
 * editing a curve in it.
 *
 * A lane is one of: the velocity bars, a controller lane of the clip (CC, pitch
 * bend, channel pressure), or one expression curve of the one selected note.
 * The controller and expression lanes share one curve editor, so both reduce
 * to a `LaneCurve`: points, a value range, and where tick 0 of the points sits
 * in clip content ticks.
 */

import {
  MIDI_EXPRESSION_SPEC,
  type MidiControllerTarget,
  type MidiExpressionKind
} from "@nodetool-ai/timeline";

import { tickToX, type PianoRollGeometry } from "./pianoRollGeometry";

export type LaneValue =
  | "velocity"
  | "pitchBend"
  | "cc1"
  | "cc7"
  | "cc10"
  | "cc11"
  | "cc64"
  | "channelPressure"
  | "otherCc"
  | "expr:pitch"
  | "expr:volume"
  | "expr:pan"
  | "expr:brightness";

/** The lanes that edit a clip's controller lanes, with their label keys. */
export const CONTROLLER_LANE_VALUES: ReadonlyArray<LaneValue> = [
  "pitchBend",
  "cc1",
  "cc7",
  "cc10",
  "cc11",
  "cc64",
  "channelPressure",
  "otherCc"
];

/** The lanes that edit the selected note's expression curves. */
export const EXPRESSION_LANE_VALUES: ReadonlyArray<LaneValue> = [
  "expr:pitch",
  "expr:volume",
  "expr:pan",
  "expr:brightness"
];

/** The controller lane a selection edits, or null for velocity and expression. */
export function laneTarget(
  value: LaneValue,
  otherCc: number
): MidiControllerTarget | null {
  if (value === "pitchBend") return { kind: "pitchBend" };
  if (value === "channelPressure") return { kind: "channelPressure" };
  if (value === "otherCc") return { kind: "cc", cc: otherCc };
  const preset = /^cc(\d+)$/.exec(value);
  return preset ? { kind: "cc", cc: Number(preset[1]) } : null;
}

/** The expression curve a selection edits, or null. */
export function laneExpressionKind(value: LaneValue): MidiExpressionKind | null {
  return value.startsWith("expr:")
    ? (value.slice("expr:".length) as MidiExpressionKind)
    : null;
}

/** One point of a curve. `tick` counts from the curve's origin. */
export interface CurvePoint {
  id: string;
  tick: number;
  value: number;
}

/** A curve to draw and edit. */
export interface LaneCurve {
  points: ReadonlyArray<CurvePoint>;
  min: number;
  max: number;
  /** The value before the first point (expression curves). */
  neutral: number | null;
  integer: boolean;
  step: boolean;
  /** Content tick the points' tick 0 sits at. */
  originTick: number;
  /** Largest point tick, or null for none (a controller lane). */
  maxTick: number | null;
}

export function expressionCurveRange(kind: MidiExpressionKind): {
  min: number;
  max: number;
  neutral: number;
} {
  return MIDI_EXPRESSION_SPEC[kind];
}

/** The y a value draws at in a lane `heightPx` tall, with a small margin. */
export function valueToY(
  value: number,
  curve: Pick<LaneCurve, "min" | "max">,
  heightPx: number
): number {
  const span = curve.max - curve.min || 1;
  const pad = LANE_PAD_PX;
  return pad + (1 - (value - curve.min) / span) * Math.max(1, heightPx - 2 * pad);
}

/** The value a y means, clamped to the curve's range. */
export function yToValue(
  y: number,
  curve: Pick<LaneCurve, "min" | "max" | "integer">,
  heightPx: number
): number {
  const span = curve.max - curve.min;
  const pad = LANE_PAD_PX;
  const ratio = 1 - (y - pad) / Math.max(1, heightPx - 2 * pad);
  const raw = curve.min + Math.min(1, Math.max(0, ratio)) * span;
  return curve.integer ? Math.round(raw) : Math.round(raw * 1000) / 1000;
}

/** Vertical margin so a point at the range's end is still fully visible. */
export const LANE_PAD_PX = 5;
/** How close a pointer must be to a point to grab it. */
export const LANE_POINT_HIT_PX = 8;

/** The id of the point under (x, y), nearest first, or null. */
export function hitTestCurvePoint(
  curve: LaneCurve,
  x: number,
  y: number,
  geometry: PianoRollGeometry,
  heightPx: number
): string | null {
  let best: { id: string; distance: number } | null = null;
  for (const point of curve.points) {
    const px = tickToX(curve.originTick + point.tick, geometry);
    const py = valueToY(point.value, curve, heightPx);
    const distance = Math.hypot(px - x, py - y);
    if (distance <= LANE_POINT_HIT_PX && (!best || distance <= best.distance)) {
      best = { id: point.id, distance };
    }
  }
  return best?.id ?? null;
}
