/**
 * useLinkedShotTakes
 *
 * Keeps the open cut on its storyboard shots' selected takes. A timeline clip
 * linked to a shot plays the shot's `clip`; when that selection changes on the
 * board — a take picked in either editor, a new render landing, a reload that
 * brought someone else's pick — every clip following the shot gets the new
 * take in one undo step (`TimelineStore.applyShotTake`).
 *
 * Only a change is applied. A board appearing in the store for the first time
 * says nothing about what the cut should play, so it moves nothing.
 */

import { useEffect, useMemo } from "react";
import type { Shot } from "@nodetool-ai/protocol";
import type { ShotTakeMedia } from "@nodetool-ai/timeline";

import {
  useStoryboardStore,
  type StoryboardBoard
} from "../../stores/storyboard/StoryboardStore";
import {
  useTimelineStore,
  useTimelineStoreApi
} from "../../stores/timeline/TimelineStore";

/** A shot's selected take as the cut sees it, or null when it has none. */
export const shotTakeMedia = (
  shot: Pick<Shot, "clip">
): ShotTakeMedia | null => {
  const assetId = shot.clip?.asset_id;
  if (!assetId) {
    return null;
  }
  const seconds = shot.clip?.duration;
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0
    ? { assetId, durationMs: Math.round(seconds * 1000) }
    : { assetId };
};

/** Shots whose selected take changed between two versions of one board. */
export const shotTakeChanges = (
  prev: StoryboardBoard | undefined,
  next: StoryboardBoard | undefined
): Array<{ shotId: string; take: ShotTakeMedia }> => {
  if (!prev || !next || prev.shots === next.shots) {
    return [];
  }
  const before = new Map(prev.shots.map((shot) => [shot.id, shot]));
  const changes: Array<{ shotId: string; take: ShotTakeMedia }> = [];
  for (const shot of next.shots) {
    const old = before.get(shot.id);
    if (!old) {
      continue;
    }
    const take = shotTakeMedia(shot);
    if (take && take.assetId !== old.clip?.asset_id) {
      changes.push({ shotId: shot.id, take });
    }
  }
  return changes;
};

/** The boards the open cut's shot clips come from, sorted. */
export const useLinkedBoardIds = (): string[] => {
  const key = useTimelineStore((state) => {
    const ids = new Set<string>();
    for (const clip of state.clips) {
      if (clip.storyboardBoardId && clip.storyboardShotId && !clip.scriptLineId) {
        ids.add(clip.storyboardBoardId);
      }
    }
    return [...ids].sort().join("\n");
  });
  return useMemo(() => (key ? key.split("\n") : []), [key]);
};

export const useLinkedShotTakes = (boardIds: readonly string[]): void => {
  const timeline = useTimelineStoreApi();
  useEffect(() => {
    if (boardIds.length === 0) {
      return;
    }
    return useStoryboardStore.subscribe((state, prev) => {
      for (const boardId of boardIds) {
        for (const { shotId, take } of shotTakeChanges(
          prev.boards[boardId],
          state.boards[boardId]
        )) {
          timeline.getState().applyShotTake(boardId, shotId, take);
        }
      }
    });
  }, [boardIds, timeline]);
};

export default useLinkedShotTakes;
