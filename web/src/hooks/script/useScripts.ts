/**
 * tRPC hooks for server-persisted scripts. Mirrors useStoryboards:
 * list/get queries plus create/delete mutations that keep the caches fresh.
 */

import { trpc } from "../../trpc/client";

export const useScripts = () =>
  trpc.scripts.list.useQuery({}, { staleTime: 30_000 });

export const useCreateScript = () => {
  const utils = trpc.useUtils();
  return trpc.scripts.create.useMutation({
    onSuccess: (created) => {
      void utils.scripts.list.invalidate();
      utils.scripts.get.setData({ id: created.id }, created);
    }
  });
};
