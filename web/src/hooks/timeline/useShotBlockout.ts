/**
 * The Blockout of a storyboard shot on the open timeline, for the shot's
 * render dialog.
 *
 * `prepare` is what a take generation calls before it sends its request. A
 * model that takes reference video gets the clip's reference, rendered first
 * when it is missing or stale. A model that takes none gets no render: only
 * the hash and the camera sentence travel, and the prompt carries the move.
 */

import { useCallback, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import {
  DEFAULT_MODEL3D_REFERENCE_PASS,
  blockoutClipForShot,
  computeModel3DReferenceHash,
  describeModel3DCameraMove,
  model3dBlockoutTakeKey,
  type TimelineClip
} from "@nodetool-ai/timeline";

import {
  useTimelineStore,
  useTimelineStoreApi
} from "../../stores/timeline/TimelineStore";
import type { ClipBlockoutSource } from "../../lib/storyboard/blockoutRequest";
import { useAssetStore } from "../../stores/AssetStore";
import { useBlockoutReference } from "./useBlockoutReference";
import { useModel3DAssetRevision } from "./useModel3DAssetRevision";

export interface ShotBlockout {
  /** The linked `model3d` clip. */
  clip: TimelineClip;
  /** `describeModel3DCameraMove` of the clip, as it stands now. */
  cameraMove: string;
  /** The clip's length, which is the reference video's length. */
  durationMs: number;
  /**
   * The take key the clip has now (`model3dBlockoutTakeKey`): its reference
   * hash in the stored or default pass, with the set's current revision.
   */
  referenceHash: string;
  /**
   * True while the set's revision is still loading. `referenceHash` is not
   * comparable with a recorded take until it is false.
   */
  revisionPending: boolean;
  /** Resolve what a take generation sends for this Blockout. */
  prepare: (takesReferenceVideo: boolean) => Promise<ClipBlockoutSource>;
}

export function useShotBlockout(
  boardId: string,
  shotId: string
): ShotBlockout | null {
  const timeline = useTimelineStoreApi();
  const { ensureReference } = useBlockoutReference();
  const getAsset = useAssetStore((s) => s.get);
  const clip = useTimelineStore((s) =>
    blockoutClipForShot(s.clips, boardId, shotId)
  );
  const sequence = useTimelineStore(
    useShallow((s) => ({ fps: s.fps, width: s.width, height: s.height }))
  );
  const clipId = clip?.id;
  const assetRevision = useModel3DAssetRevision(
    clip?.currentAssetId ?? undefined
  );

  const prepare = useCallback(
    async (takesReferenceVideo: boolean): Promise<ClipBlockoutSource> => {
      const store = timeline.getState();
      const current = store.clips.find((c) => c.id === clipId);
      if (!current) {
        throw new Error("The shot's blockout clip is no longer on the timeline.");
      }
      const cameraMove = describeModel3DCameraMove(current);
      if (takesReferenceVideo) {
        const reference = await ensureReference(current.id);
        return {
          referenceAssetId: reference.assetId,
          referenceHash: model3dBlockoutTakeKey(
            reference.dependencyHash,
            reference.assetRevision
          ),
          cameraMove
        };
      }
      const revision = current.currentAssetId
        ? (await getAsset(current.currentAssetId)).updated_at
        : undefined;
      return {
        referenceHash: model3dBlockoutTakeKey(
          computeModel3DReferenceHash(
            current,
            { fps: store.fps, width: store.width, height: store.height },
            current.model3dStyle?.reference?.pass ??
              DEFAULT_MODEL3D_REFERENCE_PASS
          ),
          revision ?? undefined
        ),
        cameraMove
      };
    },
    [timeline, ensureReference, clipId, getAsset]
  );

  return useMemo(() => {
    if (!clip) {
      return null;
    }
    return {
      clip,
      cameraMove: describeModel3DCameraMove(clip),
      durationMs: clip.durationMs,
      referenceHash: model3dBlockoutTakeKey(
        computeModel3DReferenceHash(
          clip,
          sequence,
          clip.model3dStyle?.reference?.pass ?? DEFAULT_MODEL3D_REFERENCE_PASS
        ),
        assetRevision
      ),
      revisionPending: Boolean(clip.currentAssetId) && assetRevision === undefined,
      prepare
    };
  }, [clip, sequence, prepare, assetRevision]);
}
