/**
 * Premiere's Track Select Forward tool (A): a click selects every clip from
 * the click point to the end of the sequence, on all tracks, so the rest of
 * the cut can be dragged as one block. With Shift it selects that one
 * track's clips only.
 */

import type { TimelineClip } from "@nodetool-ai/timeline";

export function trackSelectForwardIds(
  clips: readonly Pick<TimelineClip, "id" | "trackId" | "startMs" | "durationMs">[],
  atMs: number,
  trackId?: string
): string[] {
  return clips
    .filter(
      (c) =>
        c.startMs + c.durationMs > atMs &&
        (trackId === undefined || c.trackId === trackId)
    )
    .map((c) => c.id);
}
