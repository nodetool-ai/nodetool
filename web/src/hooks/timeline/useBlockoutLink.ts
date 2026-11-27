/**
 * Link a 3D clip to a storyboard shot as its Blockout, or unlink it.
 *
 * The link is the shot's `storyboardBoardId` and `storyboardShotId` on the
 * `model3d` clip. A shot has one Blockout, so linking a clip unlinks any other
 * 3D clip that carried the same shot (`blockoutLinkPatches`). The whole change
 * is one undo entry.
 */

import { useCallback } from "react";

import { blockoutLinkPatches } from "@nodetool-ai/timeline";

import { useTimelineStoreApi } from "../../stores/timeline/TimelineStore";
import { useTimelineHistoryBatch } from "../../stores/timeline/useTimelineHistoryBatch";

export type BlockoutLinkTarget = { boardId: string; shotId: string } | null;

export function useBlockoutLink(): (
  blockoutClipId: string,
  shot: BlockoutLinkTarget
) => void {
  const timeline = useTimelineStoreApi();
  const history = useTimelineHistoryBatch();
  return useCallback(
    (blockoutClipId: string, shot: BlockoutLinkTarget): void => {
      const patches = blockoutLinkPatches(
        timeline.getState().clips,
        blockoutClipId,
        shot
      );
      if (patches.length === 0) {
        return;
      }
      history.begin();
      try {
        for (const { clipId, patch } of patches) {
          timeline.getState().patchClip(clipId, patch);
          history.mark();
        }
      } finally {
        history.end();
      }
    },
    [timeline, history]
  );
}
