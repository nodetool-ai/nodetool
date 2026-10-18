/**
 * Premiere's Track Select tools: Forward (A) selects every clip from the
 * click point to the end of the sequence, Backward (Shift+A) every clip from
 * the start to the click point, on all tracks, so that part of the cut can
 * be dragged as one block. With Shift the selection keeps to one track.
 */

import type { TimelineClip } from "@nodetool-ai/timeline";

export type TrackSelectDirection = "forward" | "backward";

export function trackSelectIds(
  clips: readonly Pick<TimelineClip, "id" | "trackId" | "startMs" | "durationMs">[],
  atMs: number,
  direction: TrackSelectDirection,
  trackId?: string
): string[] {
  return clips
    .filter(
      (c) =>
        (direction === "forward"
          ? c.startMs + c.durationMs > atMs
          : c.startMs < atMs) &&
        (trackId === undefined || c.trackId === trackId)
    )
    .map((c) => c.id);
}

/** The direction a track-select tool picks in, or null for any other tool. */
export function trackSelectDirection(
  tool: string
): TrackSelectDirection | null {
  if (tool === "trackSelect") return "forward";
  if (tool === "trackSelectBackward") return "backward";
  return null;
}
