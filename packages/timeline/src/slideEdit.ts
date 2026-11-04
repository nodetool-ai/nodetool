/**
 * Slide edit, Premiere's Slide tool (U): the clip moves along its track with
 * its source untouched, and the clips on either side trim to follow, so the
 * cut before it and the cut after it move together and the sequence length
 * stays the same. A side with no clip against it slides into the gap there.
 */

import { resliceSourceAnimations } from "./animation/sourceCurves.js";
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
  memberIds: ReadonlySet<string>
): SlidePlan {
  const others = clips.filter(
    (c) => c.trackId === member.trackId && !memberIds.has(c.id) && !isGroupClip(c)
  );
  const before = others.find(
    (c) => Math.abs(endOf(c) - member.startMs) <= TOUCH_MS
  );
  const after = others.find(
    (c) => Math.abs(c.startMs - endOf(member)) <= TOUCH_MS
  );
  let minDeltaMs = -Infinity;
  let maxDeltaMs = Infinity;
  if (!before) {
    const gapStartMs = others
      .filter((c) => endOf(c) <= member.startMs + TOUCH_MS)
      .reduce((end, c) => Math.max(end, endOf(c)), 0);
    minDeltaMs = Math.max(minDeltaMs, gapStartMs - member.startMs);
  }
  if (!after) {
    const gapEndMs = others
      .filter((c) => c.startMs >= endOf(member) - TOUCH_MS)
      .reduce((start, c) => Math.min(start, c.startMs), Infinity);
    maxDeltaMs = Math.min(maxDeltaMs, gapEndMs - endOf(member));
  }
  return { member, before, after, minDeltaMs, maxDeltaMs };
}

interface NeighbourEdit {
  clip: TimelineClip;
  head: boolean;
  tail: boolean;
}

function neighbourEdits(plans: readonly SlidePlan[]): NeighbourEdit[] {
  const edits = new Map<string, NeighbourEdit>();
  for (const { before, after } of plans) {
    if (before) {
      const edit = edits.get(before.id) ?? { clip: before, head: false, tail: false };
      edit.tail = true;
      edits.set(before.id, edit);
    }
    if (after) {
      const edit = edits.get(after.id) ?? { clip: after, head: false, tail: false };
      edit.head = true;
      edits.set(after.id, edit);
    }
  }
  return [...edits.values()];
}

function trimNeighbour(edit: NeighbourEdit, delta: number): TimelineClip {
  const { clip, head, tail } = edit;
  if (!head) return trimClip(clip, "end", delta);
  if (!tail) return trimClip(clip, "start", -delta);

  // Grow first so a shared neighbour can move farther than its own length.
  // Slice animations once from the original curve, never an intermediate window.
  const { animations, ...withoutAnimations } = clip;
  const grown = trimClip(
    withoutAnimations,
    delta > 0 ? "end" : "start",
    Math.abs(delta)
  );
  const trimmed = trimClip(grown, delta > 0 ? "start" : "end", -Math.abs(delta));
  if (animations) {
    trimmed.animations = resliceSourceAnimations(
      animations,
      trimmed.inPointMs ?? 0,
      trimmed.outPointMs ?? (trimmed.inPointMs ?? 0) + trimmed.durationMs * sourceRate(trimmed),
      trimmed.durationMs
    );
  }
  return trimmed;
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
  const plans = members.map((m) => planMember(clips, m, memberIds));
  const neighbours = plans.flatMap((p) => [p.before, p.after]);
  if (
    members.some((m) => isGroupClip(m) || hasTimeRemap(m)) ||
    neighbours.some((n) => n !== undefined && hasTimeRemap(n))
  ) {
    return 0;
  }
  let minDeltaMs = Math.max(...plans.map((p) => p.minDeltaMs));
  let maxDeltaMs = Math.min(...plans.map((p) => p.maxDeltaMs));
  for (const { clip, head, tail } of neighbourEdits(plans)) {
    const rate = sourceRate(clip);
    if (head) {
      minDeltaMs = Math.max(minDeltaMs, -(clip.inPointMs ?? 0) / rate, -clip.startMs);
      if (!tail) {
        maxDeltaMs = Math.min(maxDeltaMs, clip.durationMs - MIN_NEIGHBOUR_MS);
      }
    }
    if (tail) {
      if (!head) {
        minDeltaMs = Math.max(minDeltaMs, MIN_NEIGHBOUR_MS - clip.durationMs);
      }
      const sourceMs = sourceDurationMsFor(clip);
      if (sourceMs !== undefined) {
        const out = clip.outPointMs ?? (clip.inPointMs ?? 0) + clip.durationMs * rate;
        maxDeltaMs = Math.min(maxDeltaMs, (sourceMs - out) / rate);
      }
    }
  }
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
  const members = clips.filter((c) => memberIds.has(c.id));
  const plans = members.map((member) => planMember(clips, member, memberIds));
  for (const member of members) {
    next.set(member.id, { ...member, startMs: member.startMs + delta });
  }
  for (const edit of neighbourEdits(plans)) {
    next.set(edit.clip.id, trimNeighbour(edit, delta));
  }
  return clips.map((c) => next.get(c.id) ?? c);
}
