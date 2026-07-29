/**
 * timelineSync — round-trips a revised storyboard shot into its assembled
 * timeline.
 *
 * When a board has been assembled (board.timelineId set) and a shot's clip is
 * re-rendered, the linked timeline clip (matched by `storyboardShotId`) gets
 * the new asset. Uses a get→CAS-update cycle against the persisted document;
 * an editor that has the sequence open picks the change up on next load.
 * Failures are logged, never thrown — a sync miss must not fail the shot.
 */

import { trpcClient } from "../../trpc/client";
import { useStoryboardStore } from "./StoryboardStore";
import type { TimelineClip } from "@nodetool-ai/timeline";

export async function syncShotClipToTimeline(
  boardId: string,
  shotId: string,
  assetId: string
): Promise<boolean> {
  const board = useStoryboardStore.getState().getBoard(boardId);
  const timelineId = board?.timelineId;
  if (!timelineId) {
    return false;
  }
  try {
    const sequence = await trpcClient.timeline.get.query({ id: timelineId });
    const clips = sequence.clips as TimelineClip[];
    let changed = false;
    const next = clips.map((clip) => {
      if (clip.storyboardShotId !== shotId || clip.storyboardBoardId !== boardId) {
        return clip;
      }
      if (clip.currentAssetId === assetId) {
        return clip;
      }
      changed = true;
      return { ...clip, currentAssetId: assetId, status: "generated" as const };
    });
    if (!changed) {
      return false;
    }
    await trpcClient.timeline.update.mutate({
      id: timelineId,
      baseUpdatedAt: sequence.updatedAt,
      document: {
        tracks: sequence.tracks,
        clips: next,
        markers: sequence.markers ?? []
      }
    });
    return true;
  } catch (err) {
    console.warn(
      `storyboard→timeline sync failed for shot ${shotId}:`,
      err instanceof Error ? err.message : err
    );
    return false;
  }
}
