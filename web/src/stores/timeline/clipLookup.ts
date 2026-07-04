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
