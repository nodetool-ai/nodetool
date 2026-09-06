/**
 * Retrying the clips a batch could not render (PRD § 8.4, criterion 6).
 *
 * A direct-generation clip that failed carries the reason on itself and stays
 * on the timeline, so retrying is re-running the same request: one clip from
 * its own Retry, or all of them from the toolbar's `Retry N failed`. One
 * refusal must not stop the rest, which is why each start is caught.
 */

import { useCallback, useMemo } from "react";
import type { TimelineClip } from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../stores/timeline/TimelineStore";
import { useTimelineDirectGenJob } from "./useTimelineDirectGenJob";

/** The clips `Retry N failed` would re-run: failed, and driven by direct gen. */
export function failedDirectGenClips(
  clips: readonly TimelineClip[]
): TimelineClip[] {
  return clips.filter(
    (clip) =>
      clip.status === "failed" &&
      clip.bindingKind !== undefined &&
      clip.bindingKind !== "workflow"
  );
}

export interface UseRetryFailedClips {
  failedClipIds: string[];
  /** Re-run one clip. */
  retry: (clipId: string) => Promise<void>;
  /** Re-run every failed clip. */
  retryAll: () => Promise<void>;
}

export function useRetryFailedClips(): UseRetryFailedClips {
  const clips = useTimelineStore((state) => state.clips);
  const { start } = useTimelineDirectGenJob();

  const failedClipIds = useMemo(
    () => failedDirectGenClips(clips).map((clip) => clip.id),
    [clips]
  );

  const retry = useCallback(
    async (clipId: string) => {
      await start(clipId).catch(() => null);
    },
    [start]
  );

  const retryAll = useCallback(async () => {
    await Promise.all(
      failedClipIds.map((clipId) => start(clipId).catch(() => null))
    );
  }, [failedClipIds, start]);

  return { failedClipIds, retry, retryAll };
}

export default useRetryFailedClips;
