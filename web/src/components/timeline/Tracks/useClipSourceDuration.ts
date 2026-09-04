/**
 * useClipSourceDuration
 *
 * The real length of a clip's source media, used to cap trim-end: extending
 * a clip past its source has no sensible result (playback stops at
 * outPointMs and the thumbnails/waveform stretch).
 *
 * Audio comes from the decoded buffer (useAudioPeaks, cached per URL) so the
 * cap reflects the actual decoded length rather than asset metadata, which
 * can be null. Video is probed through a detached media element, cached at
 * module level per URL so hundreds of clips on one asset probe it once.
 * Image, text, shape and group clips have no source length and return
 * undefined.
 */

import { useEffect, useState } from "react";

import type { TimelineClip } from "@nodetool-ai/timeline";
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
    videoDurationCache.set(url, ms);
    videoProbesInFlight.delete(url);
    return ms;
  });
  videoProbesInFlight.set(url, probe);
  return probe;
}

/** Test seam: forget every probed duration. */
export function resetVideoDurationCache(): void {
  videoDurationCache.clear();
  videoProbesInFlight.clear();
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
    mediaType === "audio" ? url : undefined
  );
  const videoMs = useVideoDuration(mediaType === "video" ? url : undefined);

  if (mediaType === "audio") {
    return audioMs && audioMs > 0 ? audioMs : undefined;
  }
  if (mediaType === "video") {
    return videoMs && videoMs > 0 ? videoMs : undefined;
  }
  return undefined;
}
