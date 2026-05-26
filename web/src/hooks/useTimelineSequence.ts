/**
 * Thin re-exports of the timeline tRPC hooks.
 *
 * Components can also call `trpc.timeline.*` directly; these wrappers exist for
 * call-sites that previously used the REST-flavoured names.
 */

import { trpc } from "../trpc/client";

/** List sequences, optionally filtered by projectId. */
export const useTimelines = (
  projectId?: string,
  options?: { enabled?: boolean }
) =>
  trpc.timeline.list.useQuery(
    { projectId },
    { staleTime: 30_000, enabled: options?.enabled ?? true }
  );

/** Fetch a single sequence by id. */
export const useTimeline = (id: string | null | undefined) =>
  trpc.timeline.get.useQuery(
    { id: id ?? "" },
    { enabled: !!id, staleTime: 30_000 }
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

