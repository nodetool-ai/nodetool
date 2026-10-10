/**
 * useDeriveShotFromClip
 *
 * A derived shot is a new storyboard shot conditioned on frames of a clip
 * already in the cut. The frames are decoded from the clip's own footage at
 * `derivedFrameTimesMs`, uploaded as image assets and bound to the new shot
 * as its references, so it renders through reference-to-video and holds the
 * look, cast and setting of the clip it came from.
 *
 * The shot goes on the source shot's board, right after it. In the cut, a new
 * video track goes directly above the source clip and the shot's clip sits on
 * it over the same span, linked to the new shot. It has no media until a take
 * renders; the cut then follows the shot like any other shot clip.
 */

import { useCallback } from "react";
import type {
  ProductionReferenceBinding,
  ProductionRequirement,
  Shot
} from "@nodetool-ai/protocol";
import { derivedFrameTimesMs, makeClip } from "@nodetool-ai/timeline";

import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useTimelineStoreApi } from "../../stores/timeline/TimelineStore";
import { useTimelineHistoryBatch } from "../../stores/timeline/useTimelineHistoryBatch";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import { captureFrameAt } from "../../components/storyboard/lastFrame";
import { resolveMediaUri } from "../../utils/resolveMediaUri";

export interface DeriveShotRequest {
  /** The shot clip whose footage the frames are taken from. */
  clipId: string;
  /** How many reference frames to take, spread over the clip. */
  frameCount: number;
  /** What the derived shot shows. */
  action: string;
}

export interface DerivedShot {
  boardId: string;
  shot: Shot;
  /** The new clip in the cut, linked to `shot`. */
  clipId: string;
}

interface UseDeriveShotFromClipResult {
  derive: (request: DeriveShotRequest) => Promise<DerivedShot>;
}

const uploadFrame = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    useAssetUpload.getState().uploadAsset({
      file,
      onCompleted: (asset) => resolve(asset.id),
      onFailed: (error) => reject(new Error(error))
    });
  });

const formatSeconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

export const useDeriveShotFromClip = (): UseDeriveShotFromClipResult => {
  const timeline = useTimelineStoreApi();
  const history = useTimelineHistoryBatch();

  const derive = useCallback(
    async ({
      clipId,
      frameCount,
      action
    }: DeriveShotRequest): Promise<DerivedShot> => {
      const source = timeline
        .getState()
        .clips.find((clip) => clip.id === clipId);
      const boardId = source?.storyboardBoardId;
      const sourceShotId = source?.storyboardShotId;
      if (!source || !boardId || !sourceShotId) {
        throw new Error("The clip is not linked to a storyboard shot.");
      }
      if (source.mediaType !== "video" || !source.currentAssetId) {
        throw new Error("Reference frames come from a video clip with footage.");
      }
      const storyboard = useStoryboardStore.getState();
      const sourceShot = storyboard
        .getBoard(boardId)
        ?.shots.find((shot) => shot.id === sourceShotId);
      if (!sourceShot) {
        throw new Error("The shot this clip is linked to is not on its board.");
      }

      const url = await resolveMediaUri(`asset://${source.currentAssetId}`);
      if (!url) {
        throw new Error("The clip's footage could not be loaded.");
      }
      const label = sourceShot.slug ?? `Shot ${sourceShot.index + 1}`;
      const times = derivedFrameTimesMs(source, frameCount);
      const bindings: ProductionReferenceBinding[] = [];
      // One at a time: each decode opens its own video element.
      for (const [index, timeMs] of times.entries()) {
        const file = await captureFrameAt(
          url,
          timeMs / 1000,
          `${label}-frame-${index + 1}.png`
        );
        bindings.push({
          kind: "style",
          asset_id: await uploadFrame(file),
          label: `${label} at ${formatSeconds(timeMs)}`
        });
      }

      const shotId = storyboard.insertShot(boardId, sourceShotId);
      if (!shotId) {
        throw new Error("The storyboard is not open.");
      }
      const production: ProductionRequirement = {
        schema_version: 1,
        speech_mode: "none",
        requested_take_count: 1,
        reference_bindings: bindings
      };
      storyboard.updateShot(boardId, shotId, {
        slug: `${label} (derived)`,
        action: action.trim() || sourceShot.action,
        camera: sourceShot.camera,
        motion: sourceShot.motion,
        entity_ids: sourceShot.entity_ids,
        location_id: sourceShot.location_id,
        duration_seconds: source.durationMs / 1000,
        duration_source: "manual",
        render_mode: "reference",
        production,
        clip_model: sourceShot.clip_model
      });
      const shot = useStoryboardStore
        .getState()
        .getBoard(boardId)
        ?.shots.find((candidate) => candidate.id === shotId);
      if (!shot) {
        throw new Error("The derived shot could not be added to the board.");
      }

      const state = timeline.getState();
      const ordered = [...state.tracks].sort((a, b) => a.index - b.index);
      const slot = Math.max(
        0,
        ordered.findIndex((track) => track.id === source.trackId)
      );
      const clip = makeClip({
        name: shot.slug ?? "Derived shot",
        startMs: source.startMs,
        durationMs: source.durationMs,
        mediaType: "video",
        sourceType: "imported",
        status: "draft",
        storyboardBoardId: boardId,
        storyboardShotId: shotId,
        versions: []
      });
      history.begin();
      try {
        clip.trackId = state.insertTrack("video", slot, "Derived shots");
        history.mark();
        timeline.getState().addClip(clip);
        history.mark();
      } finally {
        history.end();
      }
      return { boardId, shot, clipId: clip.id };
    },
    [history, timeline]
  );

  return { derive };
};

export default useDeriveShotFromClip;
