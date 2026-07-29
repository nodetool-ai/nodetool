import type { Asset } from "../../../stores/ApiTypes";
import { makeClip } from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";

const DEFAULT_DURATION_MS = 4000;

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
