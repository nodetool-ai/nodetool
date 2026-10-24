/**
 * Where an asset dropped on a lane starts. A drop in the second half of a
 * clip snaps to that clip's end, because people aiming "after this clip"
 * land a little short and an overwrite would silently cut the clip
 * (UX research study 6, insight I4). A drop in a gap just after a clip,
 * within `snapMs`, also lands at that clip's end: aiming "after the last
 * picture" people let go a little late and left a gap of about a second
 * that played as black (study 16). A drop in the first half, or further
 * into a gap, keeps the pointer's time.
 */
import type { TimelineClip } from "@nodetool-ai/timeline";

export function snapAssetDropMs(
  clips: readonly TimelineClip[],
  trackId: string,
  atMs: number,
  snapMs = 0
): number {
  let nearestEndMs: number | null = null;
  for (const c of clips) {
    if (c.trackId !== trackId) {
      continue;
    }
    const endMs = c.startMs + c.durationMs;
    if (atMs > c.startMs && atMs < endMs) {
      return atMs >= c.startMs + c.durationMs / 2 ? endMs : atMs;
    }
    if (
      endMs <= atMs &&
      atMs - endMs <= snapMs &&
      (nearestEndMs === null || endMs > nearestEndMs)
    ) {
      nearestEndMs = endMs;
    }
  }
  return nearestEndMs ?? atMs;
}
