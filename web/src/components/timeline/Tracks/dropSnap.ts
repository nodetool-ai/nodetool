/**
 * Where an asset dropped on a lane starts. A drop in the second half of a
 * clip snaps to that clip's end, because people aiming "after this clip"
 * land a little short and an overwrite would silently cut the clip
 * (UX research study 6, insight I4). A drop in the first half or in a gap
 * keeps the pointer's time.
 */
import type { TimelineClip } from "@nodetool-ai/timeline";

export function snapAssetDropMs(
  clips: readonly TimelineClip[],
  trackId: string,
  atMs: number
): number {
  for (const c of clips) {
    if (c.trackId !== trackId) {
      continue;
    }
    const endMs = c.startMs + c.durationMs;
    if (atMs > c.startMs && atMs < endMs) {
      return atMs >= c.startMs + c.durationMs / 2 ? endMs : atMs;
    }
  }
  return atMs;
}
