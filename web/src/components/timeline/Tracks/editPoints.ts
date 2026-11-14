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

/** The end of the last clip, the sequence end the Premiere keys play to. */
export function sequenceEndMs(clips: readonly TimelineClip[]): number {
  return clips.reduce((end, c) => Math.max(end, c.startMs + c.durationMs), 0);
}

/** The span the selected clips cover, or null when nothing is selected. */
export function selectionSpanMs(
  clips: readonly TimelineClip[],
  selectedIds: ReadonlySet<string>
): { startMs: number; endMs: number } | null {
  const selected = clips.filter((c) => selectedIds.has(c.id));
  if (selected.length === 0) return null;
  return {
    startMs: Math.min(...selected.map((c) => c.startMs)),
    endMs: Math.max(...selected.map((c) => c.startMs + c.durationMs))
  };
}

/** Where each gap no track covers starts, counted from time 0. */
export function gapStartsMs(clips: readonly TimelineClip[]): number[] {
  const spans = clips
    .filter((c) => !isGroupClip(c))
    .map((c) => [c.startMs, c.startMs + c.durationMs] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const starts: number[] = [];
  let covered = 0;
  for (const [start, end] of spans) {
    if (start > covered) starts.push(covered);
    covered = Math.max(covered, end);
  }
  return starts;
}

/**
 * Select Next / Previous Clip: on each track of the selection, the clip after
 * its last selected clip or before its first. Null when no track has one,
 * so the selection stays at the end.
 */
export function stepSelectionIds(
  clips: readonly TimelineClip[],
  tracks: readonly Pick<TimelineTrack, "id">[],
  selectedIds: ReadonlySet<string>,
  next: boolean
): string[] | null {
  const picks: string[] = [];
  for (const track of tracks) {
    const lane = clips
      .filter((c) => c.trackId === track.id && !isGroupClip(c))
      .sort((a, b) => a.startMs - b.startMs);
    let anchor = -1;
    lane.forEach((c, i) => {
      if (selectedIds.has(c.id) && (next || anchor < 0)) anchor = i;
    });
    if (anchor < 0) continue;
    const pick = lane[anchor + (next ? 1 : -1)];
    if (pick) picks.push(pick.id);
  }
  return picks.length > 0 ? picks : null;
}

/** One track's edit for Extend Previous / Next Edit To Playhead. */
export interface ExtendEditMove {
  /** The clip whose end is the edit, if any. */
  leftId: string | undefined;
  /** The clip whose start is the edit, if any. */
  rightId: string | undefined;
  edgeMs: number;
}

/**
 * Extend Previous / Next Edit To Playhead: on each of `trackIds`, the nearest
 * edit before or after `atMs`. A cut between two clips rolls, an edge beside
 * a gap is trimmed, and nothing ripples.
 */
export function extendEditMoves(
  clips: readonly TimelineClip[],
  tracks: readonly Pick<TimelineTrack, "id">[],
  trackIds: ReadonlySet<string>,
  atMs: number,
  next: boolean
): ExtendEditMove[] {
  const moves: ExtendEditMove[] = [];
  for (const track of tracks) {
    if (!trackIds.has(track.id)) continue;
    const edgeMs = neighbourEditMs(clips, new Set([track.id]), atMs, next ? 1 : -1);
    if (edgeMs === null) continue;
    const lane = editableClips(clips, new Set([track.id]));
    moves.push({
      leftId: lane.find((c) => Math.abs(c.startMs + c.durationMs - edgeMs) <= AT_EDGE_MS)?.id,
      rightId: lane.find((c) => Math.abs(c.startMs - edgeMs) <= AT_EDGE_MS)?.id,
      edgeMs
    });
  }
  return moves;
}

/** Slow shuttle: 10% of normal speed, and each further press adds 10%. */
export function slowShuttleRate(
  isPlaying: boolean,
  rate: number,
  direction: 1 | -1
): number {
  const sameWay = isPlaying && rate * direction > 0 && Math.abs(rate) < 1;
  if (!sameWay) return direction * 0.1;
  return direction * Math.min(1, Math.round(Math.abs(rate) * 10 + 1) / 10);
}
