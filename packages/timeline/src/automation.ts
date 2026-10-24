/**
 * Track automation lanes: one curve per parameter, over document time, drawn
 * under the track the way Ableton and Cubase draw them.
 *
 * A lane's points use the clip keyframe model: each point carries the easing
 * of the segment that arrives at it, the value holds before the first point
 * and after the last, and {@link curveValueAtT} evaluates both. Values are in
 * the parameter's own unit, so a lane reads the same whether a mixer, a synth
 * or a renderer plays it.
 *
 * Hosts apply lanes by target kind:
 *   - `mixer` and `device` lanes are audio. The browser audio graph schedules
 *     them on the context clock ({@link automationBreakpoints}).
 *   - `clip` lanes are picture. {@link applyTrackAutomation} turns them into
 *     one clip-spanning animation per clip, so every renderer that samples
 *     clip animations plays them with no code of its own.
 *
 * These are pure functions; the store wraps the edits.
 */

import type { ClipAnimation } from "./animation/types.js";
import { ANIMATED_PROPERTY_FOLD, type AnimatedProperty } from "./animation/types.js";
import { ease } from "./animation/easing.js";
import { createTimeOrderedUuid } from "./defaults.js";
import { curveValueAtT } from "./keyframes.js";
import type {
  AutomationLane,
  AutomationPoint,
  AutomationTarget,
  TimelineClip,
  TimelineTrack
} from "./types.js";

/** The `deviceId` of a `device` target that names the track's instrument. */
export const INSTRUMENT_DEVICE_ID = "instrument";

/** The marker on an animation {@link applyTrackAutomation} synthesized. */
export const TRACK_AUTOMATION_PARAM = "trackAutomation";

/** Two points closer than this (ms) are the same point. */
const SAME_POINT_MS = 0.5;

/** One string per target, equal exactly when two targets drive the same control. */
export function automationTargetKey(target: AutomationTarget): string {
  switch (target.kind) {
    case "mixer":
      return `mixer:${target.param}`;
    case "device":
      return `device:${target.deviceId}:${target.param}`;
    case "clip":
      return `clip:${target.property}`;
  }
}

export function sameAutomationTarget(a: AutomationTarget, b: AutomationTarget): boolean {
  return automationTargetKey(a) === automationTargetKey(b);
}

/** Whether a lane plays: enabled and holding at least one point. */
export function isAutomationLaneActive(lane: AutomationLane): boolean {
  return lane.enabled !== false && lane.points.length > 0;
}

/** The track's lane for `target`, if it has one. */
export function findAutomationLane(
  track: Pick<TimelineTrack, "automation">,
  target: AutomationTarget
): AutomationLane | undefined {
  const key = automationTargetKey(target);
  return track.automation?.find((lane) => automationTargetKey(lane.target) === key);
}

/** A new lane with no points. */
export function createAutomationLane(target: AutomationTarget): AutomationLane {
  return { id: createTimeOrderedUuid(), target, points: [] };
}

function asKeyframes(points: readonly AutomationPoint[]) {
  return points.map((p) =>
    p.easing === undefined
      ? { t: p.timeMs, value: p.value }
      : { t: p.timeMs, value: p.value, easing: p.easing }
  );
}

/** The lane's value at `timeMs`, or `fallback` when it has no points. */
export function automationValueAt(
  points: readonly AutomationPoint[],
  timeMs: number,
  fallback = 0
): number {
  if (points.length === 0) return fallback;
  return curveValueAtT(asKeyframes(points), timeMs);
}

function sortPoints(points: AutomationPoint[]): AutomationPoint[] {
  return points.sort((a, b) => a.timeMs - b.timeMs);
}

function cleanPoint(point: AutomationPoint): AutomationPoint {
  const next: AutomationPoint = {
    timeMs: Math.max(0, point.timeMs),
    value: point.value
  };
  if (point.easing !== undefined && point.easing !== "linear") next.easing = point.easing;
  return next;
}

/**
 * Add a point, or replace the one already at its time. Returns the new points
 * and the index the point landed on.
 */
export function addAutomationPoint(
  points: readonly AutomationPoint[],
  point: AutomationPoint
): { points: AutomationPoint[]; index: number } {
  const clean = cleanPoint(point);
  const replaced = points.find((p) => Math.abs(p.timeMs - clean.timeMs) < SAME_POINT_MS);
  // Re-setting a point keeps the easing chosen for its segment.
  if (replaced?.easing !== undefined && point.easing === undefined) clean.easing = replaced.easing;
  const next = sortPoints([...points.filter((p) => p !== replaced), clean]);
  return { points: next, index: next.indexOf(clean) };
}

/**
 * Move the point at `index` to a new time and value. It cannot pass its
 * neighbours, so the indices of every other point stay where they were.
 */
export function moveAutomationPoint(
  points: readonly AutomationPoint[],
  index: number,
  timeMs: number,
  value: number
): AutomationPoint[] {
  const current = points[index];
  if (!current) return [...points];
  const lo = index > 0 ? points[index - 1].timeMs : 0;
  const hi = index < points.length - 1 ? points[index + 1].timeMs : Number.POSITIVE_INFINITY;
  const next = [...points];
  next[index] = { ...current, timeMs: Math.min(hi, Math.max(lo, timeMs)), value };
  return next;
}

/** Remove the points at `indices`. */
export function removeAutomationPoints(
  points: readonly AutomationPoint[],
  indices: Iterable<number>
): AutomationPoint[] {
  const drop = new Set(indices);
  return points.filter((_, i) => !drop.has(i));
}

/** Set the easing of the segment arriving at the point at `index`. */
export function setAutomationPointEasing(
  points: readonly AutomationPoint[],
  index: number,
  easing: string
): AutomationPoint[] {
  return points.map((p, i) => (i === index ? cleanPoint({ ...p, easing }) : p));
}

/** The point indices with `fromMs <= timeMs <= toMs`. */
export function automationPointsInRange(
  points: readonly AutomationPoint[],
  fromMs: number,
  toMs: number
): number[] {
  const out: number[] = [];
  points.forEach((p, i) => {
    if (p.timeMs >= fromMs && p.timeMs <= toMs) out.push(i);
  });
  return out;
}

export interface AutomationBreakpoint {
  timeMs: number;
  value: number;
}

export interface AutomationBreakpointOptions {
  /**
   * Longest straight piece an eased segment is cut into, in ms. Linear
   * segments stay one piece unless `subdivideLinear` is set.
   */
  maxStepMs?: number;
  /**
   * Cut linear segments too: for a host that ramps in another unit than the
   * lane's (a dB lane ramped as linear gain).
   */
  subdivideLinear?: boolean;
}

const DEFAULT_STEP_MS = 10;
const MAX_STEPS_PER_SEGMENT = 512;

/**
 * The lane as straight ramps from `fromMs` on: the value at `fromMs`, then
 * every point after it, with eased segments cut into pieces no longer than
 * `maxStepMs`. A host plays it by setting the first value and ramping
 * linearly to each next one. A `hold` segment comes out as two breakpoints
 * at the same time, the jump. Empty without points.
 */
export function automationBreakpoints(
  points: readonly AutomationPoint[],
  fromMs: number,
  options: AutomationBreakpointOptions = {}
): AutomationBreakpoint[] {
  if (points.length === 0) return [];
  const step = Math.max(1, options.maxStepMs ?? DEFAULT_STEP_MS);
  const out: AutomationBreakpoint[] = [
    { timeMs: fromMs, value: automationValueAt(points, fromMs) }
  ];
  for (let i = 0; i < points.length; i++) {
    const b = points[i];
    if (b.timeMs <= fromMs) continue;
    const a = out[out.length - 1];
    const easing = b.easing ?? "linear";
    const span = b.timeMs - a.timeMs;
    if (easing === "hold") {
      out.push({ timeMs: b.timeMs, value: a.value }, { timeMs: b.timeMs, value: b.value });
      continue;
    }
    const curved = easing !== "linear" || options.subdivideLinear === true;
    if (curved && span > step) {
      // The segment started at the previous point, which may lie before
      // `fromMs`: its easing runs over the whole segment, not the visible part.
      const segStart = i > 0 ? Math.min(points[i - 1].timeMs, a.timeMs) : a.timeMs;
      const segValue = i > 0 && points[i - 1].timeMs <= fromMs ? points[i - 1].value : a.value;
      const segSpan = b.timeMs - segStart;
      const steps = Math.min(MAX_STEPS_PER_SEGMENT, Math.ceil(span / step));
      for (let s = 1; s < steps; s++) {
        const t = a.timeMs + (span * s) / steps;
        const f = segSpan > 0 ? ease(easing, (t - segStart) / segSpan) : 1;
        out.push({ timeMs: t, value: segValue + (b.value - segValue) * f });
      }
    }
    out.push({ timeMs: b.timeMs, value: b.value });
  }
  return out;
}

// ── Picture lanes ───────────────────────────────────────────────────────────

/** Track types whose clips draw picture, and so take `clip` lanes. */
const PICTURE_TRACK_TYPES: ReadonlySet<string> = new Set(["video", "overlay"]);

/** Whether `track` can hold a lane for `target`. */
export function trackAcceptsAutomationTarget(
  track: Pick<TimelineTrack, "type" | "effects">,
  target: AutomationTarget
): boolean {
  if (target.kind === "clip") return PICTURE_TRACK_TYPES.has(track.type);
  if (target.kind === "mixer") return track.type === "audio" || track.type === "midi";
  if (target.deviceId === INSTRUMENT_DEVICE_ID) return track.type === "midi";
  return track.effects?.some((effect) => effect.id === target.deviceId) ?? false;
}

/** The value a picture lane starts at: the one that changes nothing. */
export function clipAutomationIdentity(property: string): number {
  return ANIMATED_PROPERTY_FOLD[property as AnimatedProperty] === "multiply" ? 1 : 0;
}

/**
 * One clip-spanning custom animation that plays a track's picture lanes over
 * `clip`: each lane cut to the clip's window, with an interpolated keyframe on
 * each edge, in the clip's 0..1 `t`.
 */
function clipAutomationAnimation(
  track: TimelineTrack,
  lanes: readonly AutomationLane[],
  clip: TimelineClip
): ClipAnimation | null {
  const start = clip.startMs;
  const end = clip.startMs + clip.durationMs;
  if (clip.durationMs <= 0) return null;
  const curves: { property: string; keyframes: { t: number; value: number; easing?: string }[] }[] = [];
  for (const lane of lanes) {
    if (lane.target.kind !== "clip") continue;
    const toT = (ms: number) => (ms - start) / clip.durationMs;
    const keyframes: { t: number; value: number; easing?: string }[] = [
      { t: 0, value: automationValueAt(lane.points, start) }
    ];
    for (const p of lane.points) {
      if (p.timeMs <= start || p.timeMs >= end) continue;
      keyframes.push(
        p.easing === undefined
          ? { t: toT(p.timeMs), value: p.value }
          : { t: toT(p.timeMs), value: p.value, easing: p.easing }
      );
    }
    const tail: { t: number; value: number; easing?: string } = {
      t: 1,
      value: automationValueAt(lane.points, end)
    };
    const after = lane.points.find((p) => p.timeMs >= end);
    if (after?.easing !== undefined) tail.easing = after.easing;
    keyframes.push(tail);
    curves.push({ property: lane.target.property, keyframes });
  }
  if (curves.length === 0) return null;
  return {
    id: `automation:${track.id}`,
    role: "emphasis",
    preset: "custom",
    durationMs: clip.durationMs,
    delayMs: 0,
    enabled: true,
    params: { [TRACK_AUTOMATION_PARAM]: true },
    custom: { curves }
  };
}

const automatedCache = new WeakMap<
  readonly TimelineTrack[],
  WeakMap<readonly TimelineClip[], TimelineClip[]>
>();

/**
 * `clips` with every picture track's `clip` lanes added to each clip on that
 * track as one more animation. Clips on tracks without such lanes are
 * returned as they are, and so is `clips` itself when no track has any.
 *
 * Cached by the identity of both arrays, which a document replaces rather than
 * edits, so the scene model's per-clip caches keep hitting between frames.
 */
export function applyTrackAutomation(
  tracks: readonly TimelineTrack[],
  clips: readonly TimelineClip[]
): readonly TimelineClip[] {
  let byClips = automatedCache.get(tracks);
  const hit = byClips?.get(clips);
  if (hit) return hit;
  const lanesByTrack = new Map<string, { track: TimelineTrack; lanes: AutomationLane[] }>();
  for (const track of tracks) {
    if (!PICTURE_TRACK_TYPES.has(track.type)) continue;
    const lanes = (track.automation ?? []).filter(
      (lane) => lane.target.kind === "clip" && isAutomationLaneActive(lane)
    );
    if (lanes.length > 0) lanesByTrack.set(track.id, { track, lanes });
  }
  if (lanesByTrack.size === 0) return clips;
  const result = clips.map((clip) => {
    const entry = lanesByTrack.get(clip.trackId);
    if (!entry || clip.mediaType === "group" || clip.mediaType === "audio" || clip.mediaType === "midi") {
      return clip;
    }
    const animation = clipAutomationAnimation(entry.track, entry.lanes, clip);
    return animation ? { ...clip, animations: [...(clip.animations ?? []), animation] } : clip;
  });
  if (!byClips) {
    byClips = new WeakMap();
    automatedCache.set(tracks, byClips);
  }
  byClips.set(clips, result);
  return result;
}
