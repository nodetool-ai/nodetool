/**
 * A `model3d` clip's lane filmstrip. Its own module rather than a second export
 * of `useClipThumbnails`, because a 3D strip shares nothing with a video one
 * but the cache: there is no URL to seek, and drawing a cell costs a WebGL
 * session (see `model3dClipFrames`).
 */

import { useEffect, useMemo, useState } from "react";
import type { TimelineClip } from "@nodetool-ai/timeline";
import { effectiveAssetId } from "@nodetool-ai/timeline/render";

import {
  getThumbnails,
  requestThumbnailsFrom,
  subscribeThumbnails,
  type ClipThumbnail
} from "./clipThumbnails";
import { extractModel3DThumbnails } from "./model3dClipFrames";

/**
 * Everything a 3D clip's filmstrip is drawn from, as a cache key. Rendering
 * one costs a WebGL session, so the strip must be reused across re-renders and
 * redrawn only when the picture would differ — which is the style, the model,
 * the camera animations, and the source window the samples are spread over.
 * `startMs` is deliberately absent: the samples are clip-relative, so dragging
 * a clip along its track never re-renders it.
 */
function model3dThumbnailKey(
  clip: TimelineClip,
  sequenceWidth: number,
  sequenceHeight: number
): string | undefined {
  if (clip.mediaType !== "model3d" || !clip.model3dStyle) return undefined;
  const assetId = effectiveAssetId(clip);
  if (!assetId) return undefined;
  return `model3d:${clip.id}:${JSON.stringify([
    assetId,
    clip.model3dStyle,
    clip.animations ?? [],
    clip.inPointMs,
    clip.outPointMs,
    clip.durationMs,
    clip.speedMultiplier,
    clip.speedBaked,
    clip.timeRemap,
    sequenceWidth / sequenceHeight
  ])}`;
}

/**
 * A 3D clip's filmstrip: the same cache and subscription the video path uses,
 * filled by rendering the model instead of seeking a video element. Returns
 * null for any other clip, and while the first strip is being drawn.
 */
export function useModel3DClipThumbnails(
  clip: TimelineClip,
  sequenceWidth: number,
  sequenceHeight: number
): ClipThumbnail[] | null {
  const [, force] = useState(0);
  const key = useMemo(
    () => model3dThumbnailKey(clip, sequenceWidth, sequenceHeight),
    [clip, sequenceWidth, sequenceHeight]
  );

  useEffect(() => {
    if (!key) return;
    requestThumbnailsFrom(key, () =>
      extractModel3DThumbnails(clip, {
        width: sequenceWidth,
        height: sequenceHeight
      })
    );
    return subscribeThumbnails(key, () => force((v) => v + 1));
    // `key` covers every input `extractModel3DThumbnails` draws with, so a
    // re-rendered clip object with the same picture must not restart the pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return key ? getThumbnails(key) : null;
}
