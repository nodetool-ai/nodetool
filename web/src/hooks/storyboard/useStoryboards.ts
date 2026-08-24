/**
 * tRPC hooks for server-persisted storyboards. Mirrors useTimelineSequence:
 * list/get queries plus a create mutation that seeds the detail cache.
 */

import { trpc } from "../../trpc/client";

export const useStoryboards = () =>
  trpc.storyboards.list.useQuery({}, { staleTime: 30_000 });

export const useCreateStoryboard = () => {
  const utils = trpc.useUtils();
  return trpc.storyboards.create.useMutation({
    onSuccess: (created) => {
      void utils.storyboards.list.invalidate();
      utils.storyboards.get.setData({ id: created.id }, created);
    }
  });
};

/**
 * The boards that ship with the install — files on disk, so the list is stable
 * for the session and only fetched where it is shown.
 */
export const useExampleStoryboards = (enabled = true) =>
  trpc.storyboards.examples.useQuery(undefined, {
    staleTime: 5 * 60_000,
    enabled
  });

export const useInstallExampleStoryboard = () => {
  const utils = trpc.useUtils();
  return trpc.storyboards.installExample.useMutation({
    onSuccess: (created) => {
      void utils.storyboards.list.invalidate();
      utils.storyboards.get.setData({ id: created.id }, created);
    }
  });
};
