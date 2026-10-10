/**
 * useClipSourceDuration
 *
 * The real length of a clip's source media, used to cap trim-end: extending
 * a clip past its source has no sensible result (playback stops at
 * outPointMs and the thumbnails/waveform stretch).
 *
 * Audio comes from the server's waveform peaks (useAudioPeaks, cached per
 * URL), which carry the decoded length, so the cap reflects the actual audio
 * rather than asset metadata, which can be null. Video is probed through a
 * detached media element, cached at module level per URL so hundreds of clips
 * on one asset probe it once. A failed probe is not cached, so the next
 * mount tries again.
 *
 * Until the real length is known (probe pending or failed, no peaks), an
 * audio or video clip is capped at the furthest out-point seen on its asset:
 * the source is at least that long, and growing past it could run off the
 * end. The pointer trim, the inspector and the keyboard trims share this cap.
 * Image, text, shape and group clips have no source length and return
 * undefined.
 */

import { useEffect, useState } from "react";

import { sourceRate, type TimelineClip } from "@nodetool-ai/timeline";
import { probeMediaDurationMs } from "../../../utils/probeMediaDuration";
import { useAssetUrl } from "./useAssetUrl";
import { useAudioPeaks } from "./useAudioPeaks";

const videoDurationCache = new Map<string, number | null>();
const videoProbesInFlight = new Map<string, Promise<number | null>>();

function probeVideoDuration(url: string): Promise<number | null> {
  const cached = videoDurationCache.get(url);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }
  const pending = videoProbesInFlight.get(url);
  if (pending) {
    return pending;
  }
  const probe = probeMediaDurationMs(url, "video").then((ms) => {
    // A failure (null) stays uncached so a later mount probes again.
    if (ms !== null) {
      videoDurationCache.set(url, ms);
    }
    videoProbesInFlight.delete(url);
    return ms;
  });
  videoProbesInFlight.set(url, probe);
  return probe;
}

/**
 * Source lengths the hook has resolved, by asset id, so code outside React
 * (keyboard trims) can read them synchronously.
 */
const knownSourceDurations = new Map<string, number>();

export function getKnownSourceDurationMs(
  assetId: string | null | undefined
): number | undefined {
  return assetId ? knownSourceDurations.get(assetId) : undefined;
}

/** The furthest source out-point seen per asset id: a lower bound on the
 *  source length that survives a clip being trimmed shorter. */
const observedSourceEnds = new Map<string, number>();

/**
 * The cap for an audio or video clip whose source length is unknown: its
 * current out-point, or a later one already seen on the same asset. Undefined
 * for clips without a finite source, including a media clip with no asset
 * yet (a draft awaiting generation can be sized freely).
 */
export function fallbackSourceDurationMs(
  clip: Pick<
    TimelineClip,
    | "mediaType"
    | "currentAssetId"
    | "inPointMs"
    | "outPointMs"
    | "durationMs"
    | "speedBaked"
    | "speedMultiplier"
  >
): number | undefined {
  const assetId = clip.currentAssetId;
  if (
    !assetId ||
    (clip.mediaType !== "audio" && clip.mediaType !== "video")
  ) {
    return undefined;
  }
  const outPointMs =
    clip.outPointMs ??
    (clip.inPointMs ?? 0) + clip.durationMs * sourceRate(clip);
  const seen = Math.max(outPointMs, observedSourceEnds.get(assetId) ?? 0);
  observedSourceEnds.set(assetId, seen);
  return seen;
}

/**
 * The source cap for code outside React (keyboard trims, a roll's
 * neighbour): the resolved length when a mounted clip has resolved it, else
 * the fallback above.
 */
export function getSourceCapMs(
  clip: Parameters<typeof fallbackSourceDurationMs>[0]
): number | undefined {
  return (
    getKnownSourceDurationMs(clip.currentAssetId) ??
    fallbackSourceDurationMs(clip)
  );
}

/** Test seam: forget every probed duration. */
export function resetVideoDurationCache(): void {
  videoDurationCache.clear();
  videoProbesInFlight.clear();
  knownSourceDurations.clear();
  observedSourceEnds.clear();
}

/** Seed the synchronous registry (also used by tests). */
export function recordSourceDurationMs(assetId: string, ms: number): void {
  knownSourceDurations.set(assetId, ms);
}

function useVideoDuration(url: string | undefined): number | undefined {
  const [durationMs, setDurationMs] = useState<number | undefined>(() =>
    url ? (videoDurationCache.get(url) ?? undefined) : undefined
  );

  useEffect(() => {
    if (!url) {
      setDurationMs(undefined);
      return;
    }
    let cancelled = false;
    void probeVideoDuration(url).then((ms) => {
      if (!cancelled) {
        setDurationMs(ms ?? undefined);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return durationMs;
}

export function useClipSourceDuration(
  clip: TimelineClip | undefined
): number | undefined {
  const mediaType = clip?.mediaType;
  const hasSource = mediaType === "audio" || mediaType === "video";
  const url = useAssetUrl(hasSource ? clip?.currentAssetId : undefined);

  const { durationMs: audioMs } = useAudioPeaks(
    mediaType === "audio" ? clip?.currentAssetId : undefined,
    mediaType === "audio" ? url : undefined
  );
  const videoMs = useVideoDuration(mediaType === "video" ? url : undefined);

  const resolved =
    mediaType === "audio"
      ? audioMs
      : mediaType === "video"
        ? videoMs
        : undefined;
  const assetId = clip?.currentAssetId;
  useEffect(() => {
    if (assetId && resolved && resolved > 0) {
      knownSourceDurations.set(assetId, resolved);
    }
  }, [assetId, resolved]);

  if (!clip || (mediaType !== "audio" && mediaType !== "video")) {
    return undefined;
  }
  return resolved && resolved > 0 ? resolved : fallbackSourceDurationMs(clip);
}
