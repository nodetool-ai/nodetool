import type { Asset } from "../../../stores/ApiTypes";
import {
  DEFAULT_MEDIA_CLIP_DURATION_MS,
  DEFAULT_MODEL3D_CLIP_DURATION_MS,
  clipFitsTrack,
  makeClip,
  mediaTypeForContentType,
  model3dStyleWithPatch
} from "@nodetool-ai/timeline";
import type {
  ClipMediaType,
  TimelineClip,
  TimelineTrack
} from "@nodetool-ai/timeline";
import { isModel3DAsset } from "../../../utils/nodeGenerations";

/**
 * Derive the timeline mediaType from an asset. Returns null if the asset is
 * not image, video, audio or a glTF model — the authored kinds (`text`,
 * `shape`, `group`, `midi`) have no asset behind them.
 *
 * The MIME mapping lives in `@nodetool-ai/timeline` so the headless agent
 * surface places an imported clip the same way a drop does. A model is the one
 * kind that is also recognized by name, because a `.glb` uploaded as
 * `application/octet-stream` carries nothing else to go on — the rule is
 * `isModel3DAsset`, shared with the output preview.
 */
export function assetMediaType(
  contentType: string | undefined | null,
  name?: string | null
): "image" | "video" | "audio" | "model3d" | null {
  if (isModel3DAsset(contentType, name)) return "model3d";
  return mediaTypeForContentType(contentType);
}

/**
 * Return true if the given mediaType is compatible with the given track type.
 *
 *   image / video / model3d  → track.type "video" or "overlay"
 *   audio                    → track.type "audio"
 *
 * A midi track takes no asset at all: its clips are notes played by the
 * track's instrument, not a file. `clipFitsTrack` is the shared rule, so a
 * drop and a `ui_timeline_*` call refuse the same things.
 */
export function isCompatibleWithTrack(
  mediaType: ClipMediaType,
  trackType: TimelineTrack["type"]
): boolean {
  return clipFitsTrack(mediaType, trackType);
}

/**
 * Convert an Asset to a TimelineClip positioned at the given (trackId, startMs).
 *
 * Throws if the asset is not image/*, video/*, audio/* or a glTF model.
 */
export function assetToClip(
  asset: Asset,
  trackId: string,
  startMs: number
): TimelineClip {
  const mediaType = assetMediaType(asset.content_type, asset.name);
  if (!mediaType) {
    throw new Error(
      `assetToClip: unsupported content_type "${asset.content_type}"`
    );
  }

  // A glTF has no duration of its own — the model plays for as long as the
  // clip is on screen — so a 3D clip takes the 3D default rather than the
  // imported-media one.
  const durationMs =
    mediaType === "model3d"
      ? DEFAULT_MODEL3D_CLIP_DURATION_MS
      : asset.duration !== null && asset.duration !== undefined
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
  // A fresh copy of DEFAULT_MODEL3D_STYLE, so editing one clip's camera never
  // writes through to the default every later clip starts from.
  if (mediaType === "model3d") {
    init.model3dStyle = model3dStyleWithPatch(undefined, undefined);
  }
  return makeClip(init);
}
