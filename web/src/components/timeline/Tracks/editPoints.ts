/**
 * Edit-point lookups for the Premiere-style keyboard edits: Q and W trim to
 * the nearest cut, D selects what the playhead crosses, X marks a clip, Up
 * and Down step between edits. Each takes the tracks the edit may use, the
 * targeted ones in the editor. Group clips have no edits of their own here.
 */

import { isGroupClip } from "@nodetool-ai/timeline";
import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";

/** Within this many ms an edge counts as at the playhead. */
const AT_EDGE_MS = 1;

function editableClips(
  clips: readonly TimelineClip[],
  trackIds: ReadonlySet<string>
): TimelineClip[] {
  return clips.filter((c) => !isGroupClip(c) && trackIds.has(c.trackId));
}

/** Every clip edge on `trackIds`, plus the sequence start. */
export function editTimesMs(
  clips: readonly TimelineClip[],
  trackIds: ReadonlySet<string>
): number[] {
  const times = new Set<number>([0]);
  for (const c of editableClips(clips, trackIds)) {
    times.add(c.startMs);
    times.add(c.startMs + c.durationMs);
  }
  return [...times];
}

/**
 * The nearest clip edge before (`direction` -1) or after (+1) `atMs` on
 * `trackIds`, or null when there is none.
 */
export function neighbourEditMs(
  clips: readonly TimelineClip[],
  trackIds: ReadonlySet<string>,
  atMs: number,
  direction: -1 | 1
): number | null {
  let best: number | null = null;
  for (const c of editableClips(clips, trackIds)) {
    for (const edge of [c.startMs, c.startMs + c.durationMs]) {
      const ahead = direction === 1 ? edge - atMs : atMs - edge;
      if (ahead <= AT_EDGE_MS) continue;
      if (best === null || Math.abs(edge - atMs) < Math.abs(best - atMs)) {
        best = edge;
      }
    }
  }
  return best;
}

/** Clips on `trackIds` that the playhead at `atMs` crosses. */
export function clipsAtTime(
  clips: readonly TimelineClip[],
  trackIds: ReadonlySet<string>,
  atMs: number
): TimelineClip[] {
  return editableClips(clips, trackIds).filter(
    (c) => c.startMs <= atMs && atMs < c.startMs + c.durationMs
  );
}

/**
 * The clip under the playhead on the topmost of `trackIds` that has one,
 * or undefined. Match frame and Mark Clip read this one.
 */
export function topClipAtTime(
  clips: readonly TimelineClip[],
  tracks: readonly Pick<TimelineTrack, "id" | "index">[],
  trackIds: ReadonlySet<string>,
  atMs: number
): TimelineClip | undefined {
  const order = new Map(tracks.map((t) => [t.id, t.index]));
  return clipsAtTime(clips, trackIds, atMs).sort(
    (a, b) => (order.get(a.trackId) ?? 0) - (order.get(b.trackId) ?? 0)
  )[0];
}

/**
 * The in and out points Mark Clip (X) sets: the span of the selection, or
 * of the clip under the playhead on the topmost track that has one.
 */
export function markClipRange(
  clips: readonly TimelineClip[],
  tracks: readonly Pick<TimelineTrack, "id" | "index">[],
  trackIds: ReadonlySet<string>,
  selectedIds: ReadonlySet<string>,
  atMs: number
): { inMs: number; outMs: number } | null {
  let marked = clips.filter((c) => selectedIds.has(c.id));
  if (marked.length === 0) {
    const top = topClipAtTime(clips, tracks, trackIds, atMs);
    marked = top ? [top] : [];
  }
  if (marked.length === 0) return null;
  return {
    inMs: Math.min(...marked.map((c) => c.startMs)),
    outMs: Math.max(...marked.map((c) => c.startMs + c.durationMs))
  };
}
