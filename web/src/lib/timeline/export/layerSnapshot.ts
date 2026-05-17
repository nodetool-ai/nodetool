import type {
  BlendMode,
  TimelineClip,
  TimelineSequence
} from "@nodetool-ai/timeline";

import type { LayerSpec, TimelineSnapshot } from "./types";

/** True iff `currentTimeMs` falls within the clip's [start, start + duration). */
export function isClipActive(
  clip: TimelineClip,
  currentTimeMs: number
): boolean {
  return (
    currentTimeMs >= clip.startMs &&
    currentTimeMs < clip.startMs + clip.durationMs
  );
}

/**
 * Opacity multiplier from a clip's `transitionIn` ramp. Mirrors
 * `transitionOpacity` in PreviewCompositor so preview and export agree on
 * cross-fade timing. Returns 1 outside the ramp window.
 */
export function transitionOpacity(
  clip: TimelineClip,
  currentTimeMs: number
): number {
  const t = clip.transitionIn;
  if (!t || t.durationMs <= 0) return 1;
  const intoClip = currentTimeMs - clip.startMs;
  if (intoClip >= t.durationMs) return 1;
  if (intoClip <= 0) return 0;
  return intoClip / t.durationMs;
}

/**
 * Returns the asset id we should use for a clip given its current status.
 * Matches PreviewCompositor — generating clips still show their last good
 * asset (the "stale" badge in preview just overlays a banner).
 */
export function effectiveAssetId(clip: TimelineClip): string | undefined {
  switch (clip.status) {
    case "generated":
    case "stale":
    case "locked":
    case "generating":
      return clip.currentAssetId;
    default:
      return undefined;
  }
}

function resolveBlendMode(b: TimelineClip["blendMode"]): BlendMode {
  return b ?? "normal";
}

/**
 * Pure: given a timeline state and a playhead position in ms, returns the
 * ordered list of renderable layers. Audio clips, hidden/locked tracks, and
 * clips without a usable asset are filtered out.
 *
 * Output is sorted by trackIndex ascending. The compositor inverts this so
 * the lowest-index UI track renders on top (Premiere / Resolve convention).
 *
 * No async work happens here — asset URL resolution is the caller's job.
 */
export function snapshotLayers(
  snapshot: Pick<TimelineSnapshot, "tracks" | "clips">,
  currentTimeMs: number
): LayerSpec[] {
  const out: LayerSpec[] = [];

  const sortedTracks = [...snapshot.tracks].sort((a, b) => a.index - b.index);
  const clipsByTrack = new Map<string, TimelineClip[]>();
  for (const c of snapshot.clips) {
    const arr = clipsByTrack.get(c.trackId);
    if (arr) arr.push(c);
    else clipsByTrack.set(c.trackId, [c]);
  }

  for (const track of sortedTracks) {
    if (!track.visible) continue;
    if (track.type !== "video" && track.type !== "overlay") continue;

    const trackClips = clipsByTrack.get(track.id) ?? [];
    // Order overlapping clips by startMs so the outgoing clip composites
    // first and the incoming clip blends on top during a crossfade.
    const active = trackClips
      .filter((c) => isClipActive(c, currentTimeMs))
      .sort((a, b) => a.startMs - b.startMs);

    for (const clip of active) {
      if (clip.mediaType === "audio") continue;
      if (clip.hidden) continue;

      const assetId = effectiveAssetId(clip);
      if (!assetId) continue;

      const baseOpacity = clip.opacity ?? 1;
      const opacity = baseOpacity * transitionOpacity(clip, currentTimeMs);
      if (opacity <= 0) continue;

      out.push({
        clipId: clip.id,
        trackId: track.id,
        trackIndex: track.index,
        mediaType: clip.mediaType,
        blendMode: resolveBlendMode(clip.blendMode),
        opacity,
        assetId,
        transform: clip.transform,
        borderRadius: clip.borderRadius,
        effects: clip.effects,
        trackEffects: track.effects,
        speedBaked: clip.speedBaked ?? false,
        speedMultiplier: Math.max(0.0001, clip.speedMultiplier ?? 1),
        inPointMs: clip.inPointMs ?? 0,
        intoClipTimelineMs: currentTimeMs - clip.startMs
      });
    }
  }

  return out;
}

/**
 * Convenience: build a `TimelineSnapshot` from a full sequence. Strips
 * `audio` clips lazily — `snapshotLayers` already filters them, but this
 * function is sometimes called by callers that want a smaller payload.
 */
export function snapshotFromSequence(seq: TimelineSequence): TimelineSnapshot {
  return {
    tracks: seq.tracks,
    clips: seq.clips,
    durationMs: seq.durationMs,
    fps: seq.fps,
    width: seq.width,
    height: seq.height
  };
}
