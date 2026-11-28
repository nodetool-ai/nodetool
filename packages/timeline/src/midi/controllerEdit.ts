/**
 * Lane-list edits for a piano roll's controller lanes and per-note expression.
 *
 * Pure functions over a lane list. A lane exists only while it has points:
 * `setLanePoints` creates it with the first point and removes it with the
 * last, so a clip never carries an empty lane.
 */

import { createTimeOrderedUuid } from "../defaults.js";
import type {
  MidiControllerLane,
  MidiControllerPoint,
  MidiExpressionPoint,
  MidiNote,
  MidiNoteExpression
} from "../types.js";
import {
  MIDI_EXPRESSION_SPEC,
  MIDI_MAX_CONTROLLER_LANES_PER_CLIP,
  MIDI_MAX_EXPRESSION_POINTS_PER_NOTE,
  MIDI_MAX_POINTS_PER_LANE,
  controllerLaneKey,
  controllerValueRange,
  type MidiExpressionKind
} from "./controllers.js";

/** What names a lane within a clip. */
export type MidiControllerTarget = Pick<
  MidiControllerLane,
  "kind" | "cc" | "pitch" | "channel"
>;

/** Find the lane a target names. */
export function findControllerLane(
  lanes: ReadonlyArray<MidiControllerLane>,
  target: MidiControllerTarget
): MidiControllerLane | undefined {
  const key = controllerLaneKey(target);
  return lanes.find((lane) => controllerLaneKey(lane) === key);
}

/** Clamp a point to what its lane can store and give it an id. */
export function clampControllerPoint(
  kind: MidiControllerLane["kind"],
  point: { id?: string; tick: number; value: number }
): MidiControllerPoint {
  const { min, max } = controllerValueRange(kind);
  return {
    id: point.id ?? createTimeOrderedUuid(),
    tick: Math.max(0, Math.round(point.tick)),
    value: Math.min(max, Math.max(min, Math.round(point.value)))
  };
}

/**
 * Replace the points of the lane `target` names. The points are clamped and
 * sorted by tick (a stable sort, so equal ticks keep their order). An empty
 * list removes the lane, a first point creates it. A new lane is appended, and
 * a lane past the 32-lane cap is refused by returning the list unchanged.
 */
export function setLanePoints(
  lanes: ReadonlyArray<MidiControllerLane>,
  target: MidiControllerTarget,
  points: ReadonlyArray<{ id?: string; tick: number; value: number }>,
  interpolation?: MidiControllerLane["interpolation"]
): MidiControllerLane[] {
  const key = controllerLaneKey(target);
  if (points.length > MIDI_MAX_POINTS_PER_LANE) return [...lanes];
  const clamped = points
    .map((p) => clampControllerPoint(target.kind, p))
    .sort((a, b) => a.tick - b.tick);
  const existing = lanes.find((lane) => controllerLaneKey(lane) === key);
  if (!existing) {
    if (clamped.length === 0) return [...lanes];
    if (lanes.length >= MIDI_MAX_CONTROLLER_LANES_PER_CLIP) return [...lanes];
    const lane: MidiControllerLane = {
      id: createTimeOrderedUuid(),
      kind: target.kind,
      points: clamped
    };
    if (target.kind === "cc") lane.cc = target.cc;
    if (target.kind === "polyPressure") lane.pitch = target.pitch;
    if (target.channel) lane.channel = target.channel;
    if (interpolation) lane.interpolation = interpolation;
    return [...lanes, lane];
  }
  if (clamped.length === 0) return lanes.filter((lane) => lane !== existing);
  return lanes.map((lane) => {
    if (lane !== existing) return lane;
    const edited: MidiControllerLane = { ...lane, points: clamped };
    if (interpolation) edited.interpolation = interpolation;
    return edited;
  });
}

/** Set a lane's interpolation. A lane that does not exist is left alone. */
export function setLaneInterpolation(
  lanes: ReadonlyArray<MidiControllerLane>,
  target: MidiControllerTarget,
  interpolation: "linear" | "step"
): MidiControllerLane[] {
  const key = controllerLaneKey(target);
  return lanes.map((lane) =>
    controllerLaneKey(lane) === key ? { ...lane, interpolation } : lane
  );
}

/** Replace one expression curve of a note. An empty list removes the curve. */
export function setExpressionPoints(
  note: MidiNote,
  kind: MidiExpressionKind,
  points: ReadonlyArray<MidiExpressionPoint>
): MidiNote {
  const { min, max } = MIDI_EXPRESSION_SPEC[kind];
  if (points.length > MIDI_MAX_EXPRESSION_POINTS_PER_NOTE) return note;
  const clean = points
    .map((p) => ({
      tick: Math.min(note.durationTick, Math.max(0, Math.round(p.tick))),
      value: Math.min(max, Math.max(min, p.value))
    }))
    .sort((a, b) => a.tick - b.tick);
  const expression: MidiNoteExpression = { ...note.expression };
  if (clean.length === 0) delete expression[kind];
  else expression[kind] = clean;
  const { expression: _drop, ...rest } = note;
  void _drop;
  return Object.keys(expression).length > 0 ? { ...rest, expression } : rest;
}
