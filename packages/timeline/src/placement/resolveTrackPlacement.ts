import type { TimelineClip, TimelineTrack } from "../types.js";

export interface TrackPlacementInput {
  tracks: ReadonlyArray<TimelineTrack>;
  trackLayouts: ReadonlyArray<{ trackId: string; top: number; height: number }>;
  pointerY: number;
  desiredStartMs: number;
  durationMs?: number;
  mediaType?: TimelineClip["mediaType"];
  clips?: ReadonlyArray<Pick<TimelineClip, "id" | "trackId" | "startMs" | "durationMs">>;
  /**
   * Clip ids to ignore during overlap detection — typically the clip(s) being
   * dragged, which would otherwise report overlapping their own footprint.
   */
  excludeClipIds?: ReadonlySet<string>;
}

export interface TrackPlacementResult {
  trackId: string;
  startMs: number;
  wouldOverlap: boolean;
  overlappingClipIds: string[];
  isCompatible: boolean;
}

function isMediaCompatible(
  mediaType: TimelineClip["mediaType"],
  trackType: TimelineTrack["type"]
): boolean {
  if (mediaType === "audio") {
    return trackType === "audio";
  }
  if (mediaType === "overlay") {
    return trackType === "video" || trackType === "overlay";
  }
  // image, video
  return trackType === "video" || trackType === "overlay";
}

/**
 * Resolve which track (and time position) a pointer drop or drag should
 * target.
 *
 * Performs hit-testing against `trackLayouts`, checks media-type
 * compatibility, clamps `startMs` to >= 0, and detects overlaps with existing
 * clips on the resolved track. Overlap is measured from the clamped `startMs`,
 * because that is where the clip lands — a drag past the left edge would
 * otherwise report the collisions of a footprint nothing occupies.
 *
 * Returns `null` when the pointer does not intersect any track layout.
 */
export function resolveTrackPlacement(
  input: TrackPlacementInput
): TrackPlacementResult | null {
  const {
    tracks,
    trackLayouts,
    pointerY,
    desiredStartMs,
    durationMs = 0,
    mediaType,
    clips = [],
    excludeClipIds,
  } = input;

  let targetLayout: { trackId: string; top: number; height: number } | undefined;
  for (const layout of trackLayouts) {
    if (pointerY >= layout.top && pointerY < layout.top + layout.height) {
      targetLayout = layout;
      break;
    }
  }

  if (!targetLayout) {
    return null;
  }

  const targetTrack = tracks.find((t) => t.id === targetLayout!.trackId);
  if (!targetTrack) {
    return null;
  }

  const isCompatible =
    mediaType === undefined
      ? true
      : isMediaCompatible(mediaType, targetTrack.type);

  const overlappingClipIds: string[] = [];
  const startMs = Math.max(0, desiredStartMs);
  const endMs = startMs + durationMs;

  for (const clip of clips) {
    if (clip.trackId !== targetTrack.id) continue;
    if (excludeClipIds?.has(clip.id)) continue;
    const clipEnd = clip.startMs + clip.durationMs;
    if (startMs < clipEnd && endMs > clip.startMs) {
      overlappingClipIds.push(clip.id);
    }
  }

  return {
    trackId: targetTrack.id,
    startMs,
    wouldOverlap: overlappingClipIds.length > 0,
    overlappingClipIds,
    isCompatible,
  };
}
