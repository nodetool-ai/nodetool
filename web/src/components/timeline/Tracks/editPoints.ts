/**
 * Edit-point lookups for the Premiere-style keyboard edits: Q and W trim to
 * the nearest cut, D selects what the playhead crosses, X marks a clip.
 * Locked tracks and group clips have no edits of their own here.
 */

import { isGroupClip } from "@nodetool-ai/timeline";
import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";

/** Within this many ms an edge counts as at the playhead. */
const AT_EDGE_MS = 1;

function editableClips(
  clips: readonly TimelineClip[],
  tracks: readonly Pick<TimelineTrack, "id" | "locked">[]
): TimelineClip[] {
  const locked = new Set(tracks.filter((t) => t.locked).map((t) => t.id));
  return clips.filter((c) => !isGroupClip(c) && !locked.has(c.trackId));
}

/**
 * The nearest clip edge before (`direction` -1) or after (+1) `atMs` on an
 * unlocked track, or null when there is none.
 */
export function neighbourEditMs(
  clips: readonly TimelineClip[],
  tracks: readonly Pick<TimelineTrack, "id" | "locked">[],
  atMs: number,
  direction: -1 | 1
): number | null {
  let best: number | null = null;
  for (const c of editableClips(clips, tracks)) {
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

/** Clips on unlocked tracks that the playhead at `atMs` crosses. */
export function clipsAtTime(
  clips: readonly TimelineClip[],
  tracks: readonly Pick<TimelineTrack, "id" | "locked">[],
  atMs: number
): TimelineClip[] {
  return editableClips(clips, tracks).filter(
    (c) => c.startMs <= atMs && atMs < c.startMs + c.durationMs
  );
}

/**
 * The in and out points Mark Clip (X) sets: the span of the selection, or
 * of the clip under the playhead on the topmost track that has one.
 */
export function markClipRange(
  clips: readonly TimelineClip[],
  tracks: readonly Pick<TimelineTrack, "id" | "locked" | "index">[],
  selectedIds: ReadonlySet<string>,
  atMs: number
): { inMs: number; outMs: number } | null {
  let marked = clips.filter((c) => selectedIds.has(c.id));
  if (marked.length === 0) {
    const order = new Map(tracks.map((t) => [t.id, t.index]));
    const under = clipsAtTime(clips, tracks, atMs).sort(
      (a, b) => (order.get(a.trackId) ?? 0) - (order.get(b.trackId) ?? 0)
    );
    marked = under.slice(0, 1);
  }
  if (marked.length === 0) return null;
  return {
    inMs: Math.min(...marked.map((c) => c.startMs)),
    outMs: Math.max(...marked.map((c) => c.startMs + c.durationMs))
  };
}
