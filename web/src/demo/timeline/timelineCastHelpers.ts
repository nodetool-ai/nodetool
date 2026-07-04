/**
 * Builders for authoring synthetic timeline demo casts — cuts the per-cast
 * boilerplate down to the parts that differ, mirroring `../castHelpers.ts`.
 */
import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";
import type { TimelineCastEvent } from "./timelineCastTypes";

export const track = (overrides: Partial<TimelineTrack>): TimelineTrack =>
  makeTrack(overrides);

export const clip = (overrides: Partial<TimelineClip>): TimelineClip =>
  makeClip({ status: "generated", ...overrides });

export const addClip = (t: number, c: TimelineClip): TimelineCastEvent => ({
  t,
  payload: { kind: "addClip", clip: c },
});

export const patchClip = (
  t: number,
  clipId: string,
  patch: Partial<TimelineClip>
): TimelineCastEvent => ({ t, payload: { kind: "patchClip", clipId, patch } });

export const selectClips = (t: number, clipIds: string[]): TimelineCastEvent => ({
  t,
  payload: { kind: "select", clipIds },
});

export const zoom = (t: number, msPerPx: number): TimelineCastEvent => ({
  t,
  payload: { kind: "zoom", msPerPx },
});

export const seek = (t: number, timeMs: number): TimelineCastEvent => ({
  t,
  payload: { kind: "seek", timeMs },
});

/** Smoothly ramp the playhead from `fromMs` to `toMs` over `rampMs` starting at `t`. */
export const playRange = (
  t: number,
  fromMs: number,
  toMs: number,
  rampMs: number
): TimelineCastEvent => ({ t, payload: { kind: "playRange", fromMs, toMs, rampMs } });
