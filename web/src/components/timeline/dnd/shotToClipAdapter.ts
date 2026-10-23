import {
  createTimeOrderedUuid,
  makeClip,
  shotAudioClip,
  type DropMode,
  type TimelineClip
} from "@nodetool-ai/timeline";

import type { StoryboardShotDragPayload } from "../../../lib/dragdrop";
import type { TimelineStoreApi } from "../../../stores/timeline/TimelineStore";
import { runAsOneUndoEntry } from "../../../stores/timeline/useTimelineHistoryBatch";

/** True when a drag carries a storyboard shot. Readable during dragover. */
export const isShotDrag = (dataTransfer: DataTransfer): boolean =>
  dataTransfer.types.includes("storyboard-shot");

/**
 * The picture clip a dragged shot becomes, stamped with its board and shot so
 * it follows the shot's selected take like an assembled clip does.
 */
export function shotToClip(
  shot: StoryboardShotDragPayload,
  trackId: string,
  startMs: number
): TimelineClip {
  const { placement } = shot;
  const clip = makeClip({
    trackId,
    name: shot.name,
    startMs,
    durationMs: placement.durationMs,
    mediaType: placement.mediaType,
    sourceType: "imported",
    status: "generated",
    currentAssetId: placement.assetId,
    linkId: placement.mediaType === "video" ? createTimeOrderedUuid() : undefined,
    storyboardBoardId: shot.boardId,
    storyboardShotId: shot.shotId,
    versions: []
  });
  if (placement.inPointMs !== undefined) {
    clip.inPointMs = placement.inPointMs;
    clip.outPointMs = placement.outPointMs;
  }
  return clip;
}

/**
 * Put a dragged shot on a video track at `startMs`. A video shot also gets
 * its audio twin on an audio track that is free across the clip, as assembly
 * does, because playback takes sound only from audio clips. The track
 * creation, the clips and the drop resolution are one undo entry.
 *
 * Returns the picture clip's id, or null when no track was available.
 */
export function dropShotOnTrack(
  store: TimelineStoreApi,
  shot: StoryboardShotDragPayload,
  videoTrackId: string | (() => string),
  startMs: number,
  dropMode: DropMode
): string | null {
  return runAsOneUndoEntry(store, () => {
    const trackId =
      typeof videoTrackId === "string" ? videoTrackId : videoTrackId();
    if (!trackId) {
      return null;
    }
    const videoClip = shotToClip(shot, trackId, startMs);
    const clips = [videoClip];
    if (videoClip.mediaType === "video") {
      const audioTrackId = store.getState().getOrCreateAudioTrack({
        startMs,
        durationMs: videoClip.durationMs
      });
      clips.push(shotAudioClip(videoClip, audioTrackId));
    }
    store.getState().addClips(clips);
    // The audio track was chosen to be free across this span, so only the
    // picture clip needs resolving, as in importVideoWithAudio.
    store.getState().resolveDrop(new Set([videoClip.id]), dropMode);
    return videoClip.id;
  });
}
