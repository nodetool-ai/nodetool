import type { TimelineClip } from "./types.js";

/**
 * Effective source-playback rate for a clip. When the speed change is baked
 * into the asset the source plays 1:1 with the timeline; otherwise one
 * timeline-millisecond consumes `speedMultiplier` source-milliseconds.
 *
 * Mirrors the rate the preview compositor uses (`sceneModel.ts`) so that
 * timeline ⇄ source conversions in `splitClip` / `trimClip` stay consistent
 * with playback. The `0.0001` floor guards against a zero/negative multiplier.
 */
export function sourceRate(
  clip: Pick<TimelineClip, "speedBaked" | "speedMultiplier">
): number {
  return clip.speedBaked ? 1 : Math.max(0.0001, clip.speedMultiplier ?? 1);
}
