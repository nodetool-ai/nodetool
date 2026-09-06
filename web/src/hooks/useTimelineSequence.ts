/**
 * Thin re-exports of the timeline tRPC hooks.
 *
 * Components can also call `trpc.timeline.*` directly; these wrappers exist for
 * call-sites that previously used the REST-flavoured names.
 */

import { useCallback } from "react";

import { trpc, type RouterOutputs } from "../trpc/client";

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

/**
 * Write a sequence the caller just PATCHed into the detail cache.
 *
 * `useCreateTimeline` seeds `timeline.get` with the sequence as created, and
 * that copy carries no `setup`. A flow that creates a sequence and then PATCHes
 * the setup onto it would otherwise hand the pre-PATCH copy to the first render
 * of the flow; `useLoadTimelineIntoStore` skips every later copy of the same id,
 * so the store kept `setup: null`, the stage read `done`, and the flow rendered
 * nothing at all.
 */
export const useSeedTimelineDetail = () => {
  const utils = trpc.useUtils();
  return useCallback(
    (sequence: RouterOutputs["timeline"]["get"]) =>
      utils.timeline.get.setData({ id: sequence.id }, sequence),
    [utils]
  );
};
