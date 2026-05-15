import type { Asset } from "../../../stores/ApiTypes";
import { makeClip } from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";

const DEFAULT_DURATION_MS = 4000;

/**
 * Probe the natural duration of an audio (or video) file via the browser's
 * HTMLMediaElement metadata loader. Returns seconds, or `null` on error /
 * timeout. Faster than `decodeAudioData` because the browser only downloads
 * enough of the file to read the container header. Some streamed encodings
 * only expose the duration after `durationchange`, so we listen to both.
 */
export function probeMediaDuration(
  url: string,
  kind: "audio" | "video" = "audio",
  timeoutMs = 5000
): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }
    const el = document.createElement(kind);
    el.preload = "metadata";
    el.crossOrigin = "anonymous";

    let settled = false;
    const cleanup = () => {
      el.onloadedmetadata = null;
      el.ondurationchange = null;
      el.onerror = null;
      el.removeAttribute("src");
      el.load();
    };
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve(value);
    };
    const tryResolve = () => {
      const d = el.duration;
      if (Number.isFinite(d) && d > 0) {
        finish(d);
      }
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    el.onloadedmetadata = tryResolve;
    el.ondurationchange = tryResolve;
    el.onerror = () => finish(null);
    el.src = url;
  });
}

/**
 * Derive the timeline mediaType from an asset's content_type.
 * Returns null if the content type is not image, video, or audio.
 */
export function assetMediaType(
  contentType: string | undefined | null
): "image" | "video" | "audio" | null {
  if (!contentType) {
    return null;
  }
  if (contentType.startsWith("image/")) {
    return "image";
  }
  if (contentType.startsWith("video/")) {
    return "video";
  }
  if (contentType.startsWith("audio/")) {
    return "audio";
  }
  return null;
}

/**
 * Return true if the given mediaType is compatible with the given track type.
 *
 *   image / video  → track.type "video" or "overlay"
 *   audio          → track.type "audio"
 */
export function isCompatibleWithTrack(
  mediaType: "image" | "video" | "audio",
  trackType: "video" | "audio" | "overlay" | "subtitle"
): boolean {
  if (mediaType === "audio") {
    return trackType === "audio";
  }
  // image and video are accepted on video and overlay tracks
  return trackType === "video" || trackType === "overlay";
}

/**
 * Convert an Asset to a TimelineClip positioned at the given (trackId, startMs).
 *
 * Throws if the asset content_type is not image/*, video/*, or audio/*.
 */
export function assetToClip(
  asset: Asset,
  trackId: string,
  startMs: number
): TimelineClip {
  const mediaType = assetMediaType(asset.content_type);
  if (!mediaType) {
    throw new Error(
      `assetToClip: unsupported content_type "${asset.content_type}"`
    );
  }

  const durationMs =
    asset.duration !== null && asset.duration !== undefined
      ? Math.round(asset.duration * 1000)
      : DEFAULT_DURATION_MS;

  // Thumbnail: for video assets check metadata.thumbnails array
  let thumbnailAssetId: string | undefined;
  if (mediaType === "video") {
    const thumbnails = (
      asset.metadata as { thumbnails?: string[] } | null
    )?.thumbnails;
    if (thumbnails && thumbnails.length > 0) {
      thumbnailAssetId = thumbnails[0];
    }
  }

  return makeClip({
    trackId,
    name: asset.name,
    startMs,
    durationMs,
    mediaType,
    sourceType: "imported",
    status: "generated",
    currentAssetId: asset.id,
    ...(thumbnailAssetId ? { thumbnailAssetId } : {}),
    versions: []
  });
}
