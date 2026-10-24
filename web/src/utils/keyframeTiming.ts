/**
 * Geometry for the keyframe timing strip on a keyframe model node: where a
 * keyframe sits on the strip and which time a drag position means.
 */

import type { NodeMetadata, Property } from "../stores/ApiTypes";

/** Node type of the node whose output a `list[keyframe]` input collects. */
export const KEYFRAME_NODE_TYPE = "nodetool.video.Keyframe";

/** Drag positions snap to this many seconds. */
export const KEYFRAME_TIME_STEP = 0.1;

/** The node's `list[keyframe]` property, if it has one. */
export function keyframeProperty(
  metadata: NodeMetadata
): Property | undefined {
  return (metadata.properties ?? []).find(
    (property) =>
      property.type.type === "list" &&
      property.type.type_args?.[0]?.type === "keyframe"
  );
}

/**
 * The clip length the strip spans, in seconds: the node's `duration`
 * property, else its default, else the latest keyframe time (at least 1 s).
 */
export function stripDuration(
  durationValue: unknown,
  durationDefault: unknown,
  keyframeTimes: readonly number[]
): number {
  for (const candidate of [durationValue, durationDefault]) {
    const seconds = Number(candidate);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds;
    }
  }
  return Math.max(1, ...keyframeTimes.map((time) => Math.ceil(time)));
}

/** Left offset of a keyframe on the strip, 0 to 1. */
export function keyframePosition(time: number, duration: number): number {
  if (!(duration > 0)) {
    return 0;
  }
  return Math.min(1, Math.max(0, time / duration));
}

/** The time a pointer at `ratio` (0 to 1) across the strip means, snapped. */
export function timeAtPosition(ratio: number, duration: number): number {
  const clamped = Math.min(1, Math.max(0, ratio));
  const snapped =
    Math.round((clamped * duration) / KEYFRAME_TIME_STEP) * KEYFRAME_TIME_STEP;
  return Number(snapped.toFixed(2));
}

/** A keyframe time as the strip labels it. */
export function formatKeyframeTime(time: number): string {
  return `${Number(time.toFixed(2))} s`;
}
