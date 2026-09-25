/**
 * O(1) clip lookup keyed on the clips array identity.
 *
 * TimelineStore reducers replace the `clips` array on every mutation, so a
 * WeakMap keyed on the array gives each store publish exactly one index
 * build, shared by every selector that needs an id lookup. Selectors like
 * `s.clips.find((c) => c.id === id)` are O(n) per subscriber per publish —
 * O(n²) aggregate during drags; `findClipById(s.clips, id)` is O(1) after
 * the first call per publish.
 */
import type { TimelineClip } from "@nodetool-ai/timeline";

const indexCache = new WeakMap<
  readonly TimelineClip[],
  Map<string, TimelineClip>
>();

export function clipsById(
  clips: readonly TimelineClip[]
): Map<string, TimelineClip> {
  let index = indexCache.get(clips);
  if (!index) {
    index = new Map(clips.map((c) => [c.id, c]));
    indexCache.set(clips, index);
  }
  return index;
}

export function findClipById(
  clips: readonly TimelineClip[],
  clipId: string
): TimelineClip | undefined {
  return clipsById(clips).get(clipId);
}

const byTrackCache = new WeakMap<readonly TimelineClip[], Map<string, string[]>>();

/**
 * Clip ids grouped by track, in `clips` order. Cached per `clips` array
 * identity so every TrackLane's selector shares one pass over the array per
 * store publish instead of filtering the whole list once per lane.
 */
export function clipIdsByTrack(
  clips: readonly TimelineClip[]
): Map<string, string[]> {
  let index = byTrackCache.get(clips);
  if (!index) {
    index = new Map();
    for (const c of clips) {
      const ids = index.get(c.trackId);
      if (ids) {
        ids.push(c.id);
      } else {
        index.set(c.trackId, [c.id]);
      }
    }
    byTrackCache.set(clips, index);
  }
  return index;
}

interface TimeIndexedClip {
  id: string;
  startMs: number;
  endMs: number;
  order: number;
}

interface TimeIndexedTrack {
  entries: TimeIndexedClip[];
  byId: Map<string, TimeIndexedClip>;
  treeSize: number;
  maxEndTree: number[];
}

const timeIndexCache = new WeakMap<
  readonly TimelineClip[],
  Map<string, TimeIndexedTrack>
>();

function clipTimeIndex(
  clips: readonly TimelineClip[],
  trackId: string
): TimeIndexedTrack {
  let cached = timeIndexCache.get(clips);
  if (!cached) {
    cached = new Map();
    timeIndexCache.set(clips, cached);
  }
  const existing = cached.get(trackId);
  if (existing) return existing;

  const byId = clipsById(clips);
  const entries = (clipIdsByTrack(clips).get(trackId) ?? []).map((id, order) => {
    const clip = byId.get(id)!;
    return {
      id: clip.id,
      startMs: clip.startMs,
      endMs: clip.startMs + clip.durationMs,
      order
    };
  });
  entries.sort((a, b) => a.startMs - b.startMs || a.order - b.order);
  let treeSize = 1;
  while (treeSize < entries.length) treeSize *= 2;
  const maxEndTree = Array<number>(treeSize * 2).fill(-Infinity);
  entries.forEach((entry, position) => {
    maxEndTree[treeSize + position] = entry.endMs;
  });
  for (let node = treeSize - 1; node > 0; node--) {
    maxEndTree[node] = Math.max(
      maxEndTree[node * 2],
      maxEndTree[node * 2 + 1]
    );
  }
  const index = {
    entries,
    byId: new Map(entries.map((entry) => [entry.id, entry])),
    treeSize,
    maxEndTree
  };
  cached.set(trackId, index);
  return index;
}

/** Clip ids intersecting a time window, returned in document paint order. */
export function visibleClipIdsByTrack(
  clips: readonly TimelineClip[],
  trackId: string,
  startMs: number,
  endMs: number,
  pinnedId: string | null = null
): string[] {
  const ids = clipIdsByTrack(clips).get(trackId) ?? [];
  if (ids.length <= 50) {
    const byId = clipsById(clips);
    return ids.filter((id) => {
      const clip = byId.get(id)!;
      return (
        id === pinnedId ||
        (clip.startMs < endMs && clip.startMs + clip.durationMs >= startMs)
      );
    });
  }

  const track = clipTimeIndex(clips, trackId);
  const { entries, treeSize, maxEndTree } = track;
  const visible: TimeIndexedClip[] = [];
  const collect = (node: number, first: number, last: number): void => {
    if (
      first >= entries.length ||
      entries[first].startMs >= endMs ||
      maxEndTree[node] < startMs
    ) return;
    if (last - first === 1) {
      visible.push(entries[first]);
      return;
    }
    const middle = (first + last) >>> 1;
    collect(node * 2, first, middle);
    collect(node * 2 + 1, middle, last);
  };
  collect(1, 0, treeSize);
  if (pinnedId && !visible.some((entry) => entry.id === pinnedId)) {
    const pinned = track.byId.get(pinnedId);
    if (pinned) visible.push(pinned);
  }
  visible.sort((a, b) => a.order - b.order);
  return visible.map((entry) => entry.id);
}
