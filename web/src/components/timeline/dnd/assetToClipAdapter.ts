import type { Asset } from "../../../stores/ApiTypes";
import {
  DEFAULT_MEDIA_CLIP_DURATION_MS,
  clipFitsTrack,
  makeClip,
  mediaTypeForContentType
} from "@nodetool-ai/timeline";
import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";

/**
 * Derive the timeline mediaType from an asset's content_type.
 * Returns null if the content type is not image, video, or audio.
 *
 * The mapping itself lives in `@nodetool-ai/timeline` so the headless agent
 * surface places an imported clip the same way a drop does.
 */
export const assetMediaType = mediaTypeForContentType;

/**
 * Return true if the given mediaType is compatible with the given track type.
 *
 *   image / video  → track.type "video" or "overlay"
 *   audio          → track.type "audio"
 *
 * A midi track takes no asset at all: its clips are notes played by the
 * track's instrument, not a file. `clipFitsTrack` is the shared rule, so a
 * drop and a `ui_timeline_*` call refuse the same things.
 */
export function isCompatibleWithTrack(
  mediaType: "image" | "video" | "audio",
  trackType: TimelineTrack["type"]
): boolean {
  return clipFitsTrack(mediaType, trackType);
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
      : DEFAULT_MEDIA_CLIP_DURATION_MS;

  // Thumbnail: for video assets check metadata.thumbnails array
  let thumbnailAssetId: string | undefined;
  if (mediaType === "video") {
    const thumbnails = (asset.metadata as { thumbnails?: string[] } | null)
      ?.thumbnails;
    if (thumbnails && thumbnails.length > 0) {
      thumbnailAssetId = thumbnails[0];
    }
  }

  const init: Parameters<typeof makeClip>[0] = {
    trackId,
    name: asset.name,
    startMs,
    durationMs,
    mediaType,
    sourceType: "imported",
    status: "generated",
    currentAssetId: asset.id,
    versions: []
  };
  if (thumbnailAssetId) init.thumbnailAssetId = thumbnailAssetId;
  return makeClip(init);
}
