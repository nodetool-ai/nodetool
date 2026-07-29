/**
 * renderTimelineAudio — offline mixdown of the timeline's audio tracks.
 *
 * Reuses {@link AudioGraph} (the same clip scheduling, fades, speed, per-clip
 * gain, track mute/solo and DSP chain the live preview uses) but drives it with
 * an `OfflineAudioContext`, so the exported soundtrack matches what playback
 * produced — 1:1 with live.
 */

import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";
import { AudioGraph, type ScheduledAudioClip } from "../preview/AudioGraph";

export interface RenderAudioOptions {
  clips: TimelineClip[];
  tracks: TimelineTrack[];
  /** Total timeline length to render, in milliseconds. */
  durationMs: number;
  /** Resolve an asset id to a playable URL (or undefined when unavailable). */
  resolveUrl: (assetId: string) => Promise<string | undefined>;
  /** Output sample rate. Defaults to 48 kHz. */
  sampleRate?: number;
}

function isPlayableAudioClip(clip: TimelineClip): boolean {
  return (
    clip.mediaType === "audio" &&
    !clip.muted &&
    clip.currentAssetId != null &&
    (clip.status === "generated" ||
      clip.status === "stale" ||
      clip.status === "locked") &&
    clip.startMs + clip.durationMs > 0
  );
}

/**
 * Render every audible clip into a single stereo {@link AudioBuffer}, or
 * `null` when the timeline has no usable audio.
 */
export async function renderTimelineAudio(
  opts: RenderAudioOptions
): Promise<AudioBuffer | null> {
  const { clips, tracks, durationMs, resolveUrl } = opts;
  const sampleRate = opts.sampleRate ?? 48_000;

  if (durationMs <= 0) return null;

  const audioTracks = tracks.filter((track) => track.type === "audio");
  const hasSolo = audioTracks.some((track) => track.solo);
  const audibleTrackIds = new Set(
    audioTracks
      .filter((track) => !track.muted && (!hasSolo || track.solo))
      .map((track) => track.id)
  );
  const audioClips = clips.filter(
    (clip) => isPlayableAudioClip(clip) && audibleTrackIds.has(clip.trackId)
  );
  if (audioClips.length === 0) return null;

  const resolved = await Promise.all(
    audioClips.map(async (clip): Promise<ScheduledAudioClip | null> => {
      const url = await resolveUrl(clip.currentAssetId!);
      return url ? { clip, assetUrl: url } : null;
    })
  );
  const validClips = resolved.filter(
    (c): c is ScheduledAudioClip => c !== null
  );
  if (validClips.length === 0) return null;

  const length = Math.max(1, Math.ceil((durationMs / 1000) * sampleRate));
  const offline = new OfflineAudioContext(2, length, sampleRate);

  const graph = new AudioGraph(offline);
  // currentTimeMs = 0: the renderer always mixes the whole timeline from t=0,
  // so each clip is scheduled at its absolute startMs on the offline clock.
  await graph.scheduleClips(validClips, tracks, 0);

  return offline.startRendering();
}
