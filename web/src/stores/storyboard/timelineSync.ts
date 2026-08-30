/**
 * timelineSync — round-trips a revised storyboard shot into its assembled
 * timeline.
 *
 * When a board has been assembled (board.timelineId set) and a shot's clip is
 * re-rendered, the timeline clips that shot owns (matched by
 * `storyboardShotId`) get the new asset — the video clip and the audio twin
 * that carries the shot's own sound. Uses a get→CAS-update cycle against the persisted document;
 * an editor that has the sequence open picks the change up on next load.
 * Failures are logged, never thrown — a sync miss must not fail the shot.
 */

import { trpcClient } from "../../trpc/client";
import { queryClient } from "../../queryClient";
import { useStoryboardStore } from "./StoryboardStore";
import type { TimelineClip } from "@nodetool-ai/timeline";

/**
 * Invalidate the cached `timeline.get` query for one sequence. Writes here go
 * through the vanilla `trpcClient`, which never touches the React-Query cache
 * `trpc.timeline.get.useQuery` reads from — without this, a view built on
 * that cache (the "Appears in" chip, startMs after a take swap) keeps
 * rendering the pre-write document until the 30s staleTime lapses.
 */
export function invalidateTimelineGetQuery(id: string): void {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const [path, opts] = query.queryKey as [
        string[] | undefined,
        { input?: unknown } | undefined
      ];
      if (!Array.isArray(path) || path[0] !== "timeline" || path[1] !== "get") {
        return false;
      }
      const input = opts?.input as { id?: string } | undefined;
      return input?.id === id;
    }
  });
}

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
      // A jointly assembled cut stamps the shot keys onto the voiceover clips
      // too, and those play the script's takes. The shot's own clips — the
      // video one and its audio twin — carry no line.
      if (clip.scriptLineId) {
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
    invalidateTimelineGetQuery(timelineId);
    return true;
  } catch (err) {
    console.warn(
      `storyboard→timeline sync failed for shot ${shotId}:`,
      err instanceof Error ? err.message : err
    );
    return false;
  }
}
