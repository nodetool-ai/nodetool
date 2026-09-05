/**
 * Ripple and roll edits: the trims and deletes that keep a cut gap-free.
 *
 * A plain trim moves one edge and leaves everything else where it was, so
 * shortening a clip opens a hole. The operations here close it the way
 * Premiere and Final Cut do: a ripple moves every later clip by the amount the
 * edit added or removed, a roll moves a cut between two neighbours without
 * changing anything downstream, and a ripple delete or close-gap pulls the
 * rest of the sequence left.
 *
 * Every function is pure over the clip array so the web store, the agent
 * bridge and a test all get the same answer. Downstream means every clip on an
 * unlocked track that starts at or after the edit point, on every track: the
 * timeline is a multi-track document where a voiceover and a caption sit
 * against a shot, and a ripple that only moved one track would pull them out
 * of sync.
 */

import { trimClip } from "./trimClip.js";
import type { TimelineClip } from "./types.js";

export interface RippleOptions {
  /** Tracks whose clips never move. */
  lockedTrackIds?: ReadonlySet<string>;
  /** Linked siblings follow the edited clip (default). Off, only it moves. */
  followLinks?: boolean;
}

const clipEndMs = (c: TimelineClip): number => c.startMs + c.durationMs;

/** Every clip sharing `clip`'s link group, the clip itself included. */
function linkGroupIds(
  clips: readonly TimelineClip[],
  clip: TimelineClip,
  followLinks = true
): Set<string> {
  const ids = new Set([clip.id]);
  if (followLinks && clip.linkId !== undefined) {
    for (const c of clips) {
      if (c.linkId === clip.linkId) ids.add(c.id);
    }
  }
  return ids;
}

/**
 * Move every clip that starts at or after `fromMs` by `deltaMs`, skipping
 * `excludeIds` and clips on locked tracks. A negative delta never pushes a
 * clip before zero. Children of a group carry their own `startMs`, so a
 * group and its children each shift on their own start.
 */
export function shiftClipsFrom(
  clips: readonly TimelineClip[],
  fromMs: number,
  deltaMs: number,
  excludeIds: ReadonlySet<string> = new Set(),
  options: RippleOptions = {}
): TimelineClip[] {
  if (deltaMs === 0) return [...clips];
  const locked = options.lockedTrackIds;
  return clips.map((c) => {
    if (excludeIds.has(c.id) || locked?.has(c.trackId)) return c;
    if (c.startMs < fromMs) return c;
    return { ...c, startMs: Math.max(0, c.startMs + deltaMs) };
  });
}

/**
 * Trim one edge of `clip` (and its linked siblings) with `trimClip`'s delta
 * convention, then ripple: everything that started at or after the clip's old
 * end moves by the change in its duration. Trimming the start edge keeps the
 * clip parked at its `startMs` (the in-point moves, the picture on the
 * timeline does not), which is what ripple-trimming a head means in every
 * editor. Throws when the trim itself is invalid.
 */
export function rippleTrim(
  clips: readonly TimelineClip[],
  clipId: string,
  edge: "start" | "end",
  deltaMs: number,
  options: RippleOptions & { maxSourceDurationMs?: number } = {}
): TimelineClip[] {
  const clip = clips.find((c) => c.id === clipId);
  if (!clip) throw new Error(`rippleTrim: clip ${clipId} not found`);
  const group = linkGroupIds(clips, clip, options.followLinks);
  const oldEndMs = clipEndMs(clip);

  const trimmed = new Map<string, TimelineClip>();
  for (const c of clips) {
    if (!group.has(c.id)) continue;
    const next = trimClip(
      c,
      edge,
      deltaMs,
      c.id === clipId ? options.maxSourceDurationMs : undefined
    );
    trimmed.set(c.id, edge === "start" ? { ...next, startMs: c.startMs } : next);
  }

  const applied = trimmed.get(clipId)!.durationMs - clip.durationMs;
  const withTrim = clips.map((c) => trimmed.get(c.id) ?? c);
  return shiftClipsFrom(withTrim, oldEndMs, applied, group, options);
}

/**
 * The clip on `clip`'s track that abuts the given edge: the one starting where
 * `clip` ends, or ending where it starts. A cut is a shared timestamp, with a
 * 1 ms tolerance for rounding.
 */
export function findRollNeighbour(
  clips: readonly TimelineClip[],
  clip: TimelineClip,
  edge: "start" | "end"
): TimelineClip | undefined {
  const cutMs = edge === "end" ? clipEndMs(clip) : clip.startMs;
  return clips.find(
    (c) =>
      c.id !== clip.id &&
      c.trackId === clip.trackId &&
      Math.abs((edge === "end" ? c.startMs : clipEndMs(c)) - cutMs) <= 1
  );
}

/**
 * Roll the cut on `edge` of `clip` by `deltaMs` (positive = later). The clip
 * on one side grows by what the other loses, so the sequence length and every
 * other clip stay put. Linked siblings of both clips follow. Throws when
 * either side cannot give up or reveal that much source, or when the edge has
 * no neighbour to roll against.
 */
export function rollEdit(
  clips: readonly TimelineClip[],
  clipId: string,
  edge: "start" | "end",
  deltaMs: number,
  options: Pick<RippleOptions, "followLinks"> = {}
): TimelineClip[] {
  const clip = clips.find((c) => c.id === clipId);
  if (!clip) throw new Error(`rollEdit: clip ${clipId} not found`);
  const neighbour = findRollNeighbour(clips, clip, edge);
  if (!neighbour) throw new Error("rollEdit: no clip on the other side of the cut");

  const left = edge === "end" ? clip : neighbour;
  const right = edge === "end" ? neighbour : clip;
  const leftIds = linkGroupIds(clips, left, options.followLinks);
  const rightIds = linkGroupIds(clips, right, options.followLinks);

  const next = new Map<string, TimelineClip>();
  for (const c of clips) {
    if (leftIds.has(c.id)) next.set(c.id, trimClip(c, "end", deltaMs));
    else if (rightIds.has(c.id)) next.set(c.id, trimClip(c, "start", -deltaMs));
  }
  return clips.map((c) => next.get(c.id) ?? c);
}

/** Merge overlapping or touching [start, end) ranges into disjoint ones. */
function mergeRanges(
  ranges: { startMs: number; endMs: number }[]
): { startMs: number; endMs: number }[] {
  const sorted = [...ranges].sort((a, b) => a.startMs - b.startMs);
  const out: { startMs: number; endMs: number }[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, r.endMs);
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

/**
 * Remove `ids` and close the time they covered: for each span the removed
 * clips occupied (overlapping spans merged), every remaining clip that started
 * at or after the span's end moves left by its length. Spans are closed from
 * the right so an earlier shift never changes what a later one measures.
 * A surviving clip that straddles a span is left alone.
 */
export function rippleDelete(
  clips: readonly TimelineClip[],
  ids: ReadonlySet<string>,
  options: RippleOptions = {}
): TimelineClip[] {
  const removed = clips.filter((c) => ids.has(c.id));
  if (removed.length === 0) return [...clips];
  let next: TimelineClip[] = clips.filter((c) => !ids.has(c.id));
  const spans = mergeRanges(
    removed.map((c) => ({ startMs: c.startMs, endMs: clipEndMs(c) }))
  ).reverse();
  for (const span of spans) {
    next = shiftClipsFrom(
      next,
      span.endMs,
      span.startMs - span.endMs,
      new Set(),
      options
    );
  }
  return next;
}

/**
 * The empty stretch on `trackId` containing `atMs`, or null when a clip covers
 * that time. The gap runs from the end of the last clip before `atMs` (or 0)
 * to the start of the first clip after it; with no clip after there is nothing
 * to pull in, so that is null too.
 */
export function findGap(
  clips: readonly TimelineClip[],
  trackId: string,
  atMs: number
): { startMs: number; endMs: number } | null {
  let prevEnd = 0;
  let nextStart = Infinity;
  for (const c of clips) {
    if (c.trackId !== trackId) continue;
    const end = clipEndMs(c);
    if (c.startMs <= atMs && end > atMs) return null;
    if (end <= atMs) prevEnd = Math.max(prevEnd, end);
    else nextStart = Math.min(nextStart, c.startMs);
  }
  if (nextStart === Infinity || nextStart <= prevEnd) return null;
  return { startMs: prevEnd, endMs: nextStart };
}

/**
 * Close the gap on `trackId` at `atMs`: everything on an unlocked track that
 * starts at or after the gap's end moves left by the gap's length. Returns the
 * input array unchanged when there is no gap there.
 */
export function closeGap(
  clips: readonly TimelineClip[],
  trackId: string,
  atMs: number,
  options: RippleOptions = {}
): TimelineClip[] {
  const gap = findGap(clips, trackId, atMs);
  if (!gap) return [...clips];
  return shiftClipsFrom(
    clips,
    gap.endMs,
    gap.startMs - gap.endMs,
    new Set(),
    options
  );
}
