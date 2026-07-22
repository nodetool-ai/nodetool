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

export const useDeleteStoryboard = () => {
  const utils = trpc.useUtils();
  return trpc.storyboards.delete.useMutation({
    onSuccess: () => {
      void utils.storyboards.list.invalidate();
    }
  });
};
