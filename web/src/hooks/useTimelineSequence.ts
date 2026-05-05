/**
 * TanStack Query hooks for timeline sequences.
 *
 * - useTimelines(projectId?)      → list query
 * - useTimeline(id)               → single sequence query
 * - useCreateTimeline()           → create mutation
 * - usePatchTimeline()            → patch mutation
 * - useDeleteTimeline()           → delete mutation
 * - useClipVersions(id, clipId)   → list clip versions
 * - useAppendClipVersion()        → append clip version mutation
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as timelineApi from "../lib/api/timeline";
import type {
  CreateTimelineRequest,
  PatchTimelineRequest,
  AppendClipVersionRequest
} from "../lib/api/timeline";

// ── Query keys ───────────────────────────────────────────────────────────────

export const timelineKeys = {
  all: ["timeline"] as const,
  lists: (projectId?: string) =>
    ["timeline", "list", projectId ?? "all"] as const,
  detail: (id: string) => ["timeline", id] as const,
  clipVersions: (id: string, clipId: string) =>
    ["timeline", id, "clips", clipId, "versions"] as const
};

// ── Queries ──────────────────────────────────────────────────────────────────

/** List sequences, optionally filtered by projectId. */
export const useTimelines = (projectId?: string) =>
  useQuery({
    queryKey: timelineKeys.lists(projectId),
    queryFn: () => timelineApi.listTimelines(projectId),
    staleTime: 30_000
  });

/** Fetch a single sequence by id. */
export const useTimeline = (id: string | null | undefined) =>
  useQuery({
    queryKey: id ? timelineKeys.detail(id) : ["timeline", "none"],
    queryFn: () => timelineApi.getTimeline(id as string),
    enabled: !!id,
    staleTime: 30_000
  });

/** Fetch versions for a specific clip inside a sequence. */
export const useClipVersions = (
  sequenceId: string | null | undefined,
  clipId: string | null | undefined
) =>
  useQuery({
    queryKey:
      sequenceId && clipId
        ? timelineKeys.clipVersions(sequenceId, clipId)
        : ["timeline", "none", "clips", "none", "versions"],
    queryFn: () =>
      timelineApi.getClipVersions(sequenceId as string, clipId as string),
    enabled: !!(sequenceId && clipId),
    staleTime: 30_000
  });

// ── Mutations ────────────────────────────────────────────────────────────────

/** Create a new timeline sequence. */
export const useCreateTimeline = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTimelineRequest) =>
      timelineApi.createTimeline(body),
    onSuccess: (created) => {
      // Invalidate all list queries so the new item appears
      queryClient.invalidateQueries({ queryKey: timelineKeys.all });
      // Seed the detail cache immediately to avoid a round-trip
      queryClient.setQueryData(timelineKeys.detail(created.id), created);
    }
  });
};

/** Patch (partially update) a timeline sequence. */
export const usePatchTimeline = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
      ifMatch
    }: {
      id: string;
      body: PatchTimelineRequest;
      ifMatch?: string;
    }) => timelineApi.patchTimeline(id, body, { ifMatch }),
    onSuccess: (updated) => {
      queryClient.setQueryData(timelineKeys.detail(updated.id), updated);
      queryClient.invalidateQueries({
        queryKey: timelineKeys.lists(updated.projectId)
      });
    }
  });
};

/** Delete a timeline sequence. */
export const useDeleteTimeline = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => timelineApi.deleteTimeline(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: timelineKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: timelineKeys.all });
    }
  });
};

/** Append a new clip version inside a sequence document. */
export const useAppendClipVersion = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      sequenceId,
      clipId,
      body
    }: {
      sequenceId: string;
      clipId: string;
      body: AppendClipVersionRequest;
    }) => timelineApi.appendClipVersion(sequenceId, clipId, body),
    onSuccess: (_version, { sequenceId, clipId }) => {
      queryClient.invalidateQueries({
        queryKey: timelineKeys.clipVersions(sequenceId, clipId)
      });
      // The sequence document has changed too — invalidate the detail
      queryClient.invalidateQueries({
        queryKey: timelineKeys.detail(sequenceId)
      });
    }
  });
};
