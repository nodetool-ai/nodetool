/**
 * Clip clipboard for the timeline editor.
 *
 * Module-level buffer (not per-instance) so clips can be copied between
 * timeline tabs. Pasted clips get fresh ids; the earliest copied clip lands
 * at the paste time and the others keep their relative offsets. Clips whose
 * source track no longer exists fall back to the first compatible track and
 * are skipped when none exists.
 */

import { makeClip, createTimeOrderedUuid } from "@nodetool-ai/timeline";
import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";

let clipboard: TimelineClip[] = [];

export function copyClipsToClipboard(clips: readonly TimelineClip[]): number {
  clipboard = clips.map((c) => structuredClone(c));
  return clipboard.length;
}

export function hasClipboardClips(): boolean {
  return clipboard.length > 0;
}

/** Test hook — reset the module-level buffer between tests. */
export function clearClipClipboard(): void {
  clipboard = [];
}

function clipFitsTrack(
  mediaType: TimelineClip["mediaType"],
  trackType: TimelineTrack["type"]
): boolean {
  if (mediaType === "audio") {
    return trackType === "audio";
  }
  return trackType === "video" || trackType === "overlay";
}

/**
 * Build paste-ready copies of the clipboard contents, anchored at `atMs`.
 * Returns an empty array when the clipboard is empty.
 */
export function buildPastedClips(
  tracks: readonly TimelineTrack[],
  atMs: number
): TimelineClip[] {
  if (clipboard.length === 0) {
    return [];
  }
  const minStartMs = Math.min(...clipboard.map((c) => c.startMs));
  const trackIds = new Set(tracks.map((t) => t.id));
  const pasted: TimelineClip[] = [];
  for (const c of clipboard) {
    let trackId = c.trackId;
    if (!trackIds.has(trackId)) {
      const fallback = tracks.find((t) => clipFitsTrack(c.mediaType, t.type));
      if (!fallback) {
        continue;
      }
      trackId = fallback.id;
    }
    pasted.push(
      makeClip({
        ...c,
        id: createTimeOrderedUuid(),
        trackId,
        startMs: Math.max(0, Math.round(atMs + (c.startMs - minStartMs)))
      })
    );
  }
  return pasted;
}
