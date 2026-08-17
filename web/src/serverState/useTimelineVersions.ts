/**
 * useTimelineVersions
 *
 * Server state for a timeline sequence's version history
 * (`trpc.timeline.versions.*`). Mirrors `useWorkflowVersions`: one list query
 * plus create / restore / delete mutations that invalidate the versions key by
 * prefix.
 *
 * Restore is the odd one out — it rewrites the sequence itself, so its success
 * handler seeds the `timeline.get` cache with the restored sequence (and
 * invalidates it) so every other view of that timeline picks the restore up.
 * Syncing the *open editor's* store is the caller's job: see
 * `applyTimelineSequenceToStore`.
 */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { trpc, trpcClient } from "../trpc/client";

import type { RouterOutputs } from "../trpc/client";

export type TimelineVersionListItem =
  RouterOutputs["timeline"]["versions"]["list"][number];
export type TimelineVersionSaveType = TimelineVersionListItem["saveType"];

const DEFAULT_LIMIT = 100;

export const timelineVersionsQueryKey = (
  timelineId: string,
  limit: number = DEFAULT_LIMIT,
  saveType?: TimelineVersionSaveType
) => ["timeline", timelineId, "versions", limit, saveType ?? "all"] as const;

interface UseTimelineVersionsOptions {
  limit?: number;
  saveType?: TimelineVersionSaveType;
}

export const useTimelineVersions = (
  timelineId: string | null | undefined,
  options: UseTimelineVersionsOptions = {}
) => {
  const { limit = DEFAULT_LIMIT, saveType } = options;
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();

  const query = useQuery({
    queryKey: timelineId
      ? timelineVersionsQueryKey(timelineId, limit, saveType)
      : timelineVersionsQueryKey("none", limit, saveType),
    queryFn: (): Promise<TimelineVersionListItem[]> =>
      trpcClient.timeline.versions.list.query({
        id: timelineId as string,
        limit,
        saveType
      }),
    enabled: !!timelineId,
    staleTime: 30 * 1000
  });

  // Prefix invalidation: every limit / saveType slice of this timeline's
  // history is stale once a version is added, restored, or removed.
  const invalidateVersions = useCallback(() => {
    if (!timelineId) return;
    queryClient.invalidateQueries({
      queryKey: ["timeline", timelineId, "versions"]
    });
  }, [queryClient, timelineId]);

  const createVersionMutation = useMutation({
    mutationFn: (name?: string) =>
      trpcClient.timeline.versions.create.mutate({
        id: timelineId as string,
        name: name?.trim() ? name.trim() : undefined
      }),
    onSuccess: invalidateVersions
  });

  const restoreVersionMutation = useMutation({
    mutationFn: (version: number) =>
      trpcClient.timeline.versions.restore.mutate({
        id: timelineId as string,
        version
      }),
    onSuccess: (restored) => {
      // The restore both rewrote the sequence and appended a pre-restore
      // snapshot, so the sequence and its history are stale.
      utils.timeline.get.setData({ id: restored.id }, restored);
      utils.timeline.get.invalidate({ id: restored.id });
      invalidateVersions();
    }
  });

  const deleteVersionMutation = useMutation({
    mutationFn: (version: number) =>
      trpcClient.timeline.versions.delete.mutate({
        id: timelineId as string,
        version
      }),
    onSuccess: invalidateVersions
  });

  return {
    ...query,
    versions: query.data ?? [],
    createVersion: createVersionMutation.mutateAsync,
    restoreVersion: restoreVersionMutation.mutateAsync,
    deleteVersion: deleteVersionMutation.mutateAsync,
    isCreatingVersion: createVersionMutation.isPending,
    isRestoringVersion: restoreVersionMutation.isPending,
    isDeletingVersion: deleteVersionMutation.isPending
  };
};

export default useTimelineVersions;
