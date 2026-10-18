/**
 * Slide edit, Premiere's Slide tool (U): the clip moves along its track with
 * its source untouched, and the clips on either side trim to follow, so the
 * cut before it and the cut after it move together and the sequence length
 * stays the same. A side with no clip against it slides into the gap there.
 */

import { isGroupClip } from "./group.js";
import { sourceRate } from "./sourceRate.js";
import { hasTimeRemap } from "./timeRemap.js";
import { trimClip } from "./trimClip.js";
import type { TimelineClip } from "./types.js";

/** Within this many ms two edges touch. */
const TOUCH_MS = 1;
/** The shortest a neighbour may become. */
const MIN_NEIGHBOUR_MS = 1;

const endOf = (c: TimelineClip): number => c.startMs + c.durationMs;

interface SlidePlan {
  member: TimelineClip;
  before: TimelineClip | undefined;
  after: TimelineClip | undefined;
  minDeltaMs: number;
  maxDeltaMs: number;
}

function planMember(
  clips: readonly TimelineClip[],
  member: TimelineClip,
  sourceDurationMsFor: (clip: TimelineClip) => number | undefined
): SlidePlan {
  const others = clips.filter(
    (c) => c.trackId === member.trackId && c.id !== member.id && !isGroupClip(c)
  );
  const before = others.find(
    (c) => Math.abs(endOf(c) - member.startMs) <= TOUCH_MS
  );
  const after = others.find(
    (c) => Math.abs(c.startMs - endOf(member)) <= TOUCH_MS
  );
  let minDeltaMs = -Infinity;
  let maxDeltaMs = Infinity;
  if (before) {
    // Sliding left shortens the clip before; sliding right reveals its tail.
    minDeltaMs = Math.max(minDeltaMs, MIN_NEIGHBOUR_MS - before.durationMs);
    const sourceMs = sourceDurationMsFor(before);
    if (sourceMs !== undefined) {
      const out =
        before.outPointMs ??
        (before.inPointMs ?? 0) + before.durationMs * sourceRate(before);
      maxDeltaMs = Math.min(maxDeltaMs, (sourceMs - out) / sourceRate(before));
    }
  } else {
    const gapStartMs = others
      .filter((c) => endOf(c) <= member.startMs + TOUCH_MS)
      .reduce((end, c) => Math.max(end, endOf(c)), 0);
    minDeltaMs = Math.max(minDeltaMs, gapStartMs - member.startMs);
  }
  if (after) {
    // Sliding right shortens the clip after; sliding left reveals its head.
    maxDeltaMs = Math.min(maxDeltaMs, after.durationMs - MIN_NEIGHBOUR_MS);
    minDeltaMs = Math.max(
      minDeltaMs,
      -((after.inPointMs ?? 0) / sourceRate(after))
    );
  } else {
    const gapEndMs = others
      .filter((c) => c.startMs >= endOf(member) - TOUCH_MS)
      .reduce((start, c) => Math.min(start, c.startMs), Infinity);
    maxDeltaMs = Math.min(maxDeltaMs, gapEndMs - endOf(member));
  }
  return { member, before, after, minDeltaMs, maxDeltaMs };
}

/**
 * The delta `slideClips` would apply for a wanted `deltaMs`: clamped so no
 * neighbour runs out of length or source and no gap is overrun. Zero when
 * the members cannot slide (a group or a time-remapped clip among them).
 */
export function slideDeltaLimit(
  clips: readonly TimelineClip[],
  memberIds: ReadonlySet<string>,
  deltaMs: number,
  sourceDurationMsFor: (clip: TimelineClip) => number | undefined = () =>
    undefined
): number {
  const members = clips.filter((c) => memberIds.has(c.id));
  if (members.length === 0) return 0;
  const plans = members.map((m) => planMember(clips, m, sourceDurationMsFor));
  const neighbours = plans.flatMap((p) => [p.before, p.after]);
  if (
    members.some((m) => isGroupClip(m) || hasTimeRemap(m)) ||
    neighbours.some((n) => n !== undefined && hasTimeRemap(n))
  ) {
    return 0;
  }
  const minDeltaMs = Math.max(...plans.map((p) => p.minDeltaMs));
  const maxDeltaMs = Math.min(...plans.map((p) => p.maxDeltaMs));
  if (minDeltaMs > maxDeltaMs) return 0;
  return Math.min(maxDeltaMs, Math.max(minDeltaMs, deltaMs));
}

/**
 * Slide every clip in `memberIds` (a clip and its linked siblings) by
 * `deltaMs`, clamped by {@link slideDeltaLimit}, trimming the neighbours it
 * touches. Returns the same array when nothing can move.
 */
export function slideClips(
  clips: readonly TimelineClip[],
  memberIds: ReadonlySet<string>,
  deltaMs: number,
  sourceDurationMsFor: (clip: TimelineClip) => number | undefined = () =>
    undefined
): readonly TimelineClip[] {
  const delta = slideDeltaLimit(clips, memberIds, deltaMs, sourceDurationMsFor);
  if (delta === 0) return clips;
  const next = new Map<string, TimelineClip>();
  for (const member of clips.filter((c) => memberIds.has(c.id))) {
    const { before, after } = planMember(clips, member, sourceDurationMsFor);
    next.set(member.id, { ...member, startMs: member.startMs + delta });
    if (before) next.set(before.id, trimClip(before, "end", delta));
    if (after) next.set(after.id, trimClip(after, "start", -delta));
  }
  return clips.map((c) => next.get(c.id) ?? c);
}
