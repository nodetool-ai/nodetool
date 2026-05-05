/**
 * Thin re-exports of the timeline tRPC hooks.
 *
 * Components can also call `trpc.timeline.*` directly; these wrappers exist for
 * call-sites that previously used the REST-flavoured names.
 */

import { trpc } from "../trpc/client";

/** List sequences, optionally filtered by projectId. */
export const useTimelines = (projectId?: string) =>
  trpc.timeline.list.useQuery(
    { projectId },
    { staleTime: 30_000 }
  );

/** Fetch a single sequence by id. */
export const useTimeline = (id: string | null | undefined) =>
  trpc.timeline.get.useQuery(
    { id: id ?? "" },
    { enabled: !!id, staleTime: 30_000 }
  );

/** Fetch versions for a specific clip inside a sequence. */
export const useClipVersions = (
  sequenceId: string | null | undefined,
  clipId: string | null | undefined
) =>
  trpc.timeline.versions.list.useQuery(
    { id: sequenceId ?? "", clipId: clipId ?? "" },
    { enabled: !!(sequenceId && clipId), staleTime: 30_000 }
  );

/** Create a new timeline sequence. List + detail caches refresh automatically. */
export const useCreateTimeline = () => {
  const utils = trpc.useUtils();
  return trpc.timeline.create.useMutation({
    onSuccess: (created) => {
      utils.timeline.list.invalidate();
      utils.timeline.get.setData({ id: created.id }, created);
    }
  });
};

/** Update (partially) a timeline sequence. */
export const useUpdateTimeline = () => {
  const utils = trpc.useUtils();
  return trpc.timeline.update.useMutation({
    onSuccess: (updated) => {
      utils.timeline.get.setData({ id: updated.id }, updated);
      utils.timeline.list.invalidate({ projectId: updated.projectId });
    }
  });
};

/** Delete a timeline sequence. */
export const useDeleteTimeline = () => {
  const utils = trpc.useUtils();
  return trpc.timeline.delete.useMutation({
    onSuccess: (_data, vars) => {
      utils.timeline.get.reset({ id: vars.id });
      utils.timeline.list.invalidate();
    }
  });
};

/** Append a new clip version inside a sequence document. */
export const useAppendClipVersion = () => {
  const utils = trpc.useUtils();
  return trpc.timeline.versions.append.useMutation({
    onSuccess: (_version, vars) => {
      utils.timeline.versions.list.invalidate({
        id: vars.id,
        clipId: vars.clipId
      });
      utils.timeline.get.invalidate({ id: vars.id });
    }
  });
};
