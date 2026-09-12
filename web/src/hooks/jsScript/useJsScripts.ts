/**
 * tRPC hooks for server-persisted JS scripts. Mirrors useScripts:
 * a list query plus a create mutation that keeps the caches fresh.
 */

import { trpc } from "../../trpc/client";

export const useJsScripts = (projectId?: string) =>
  trpc.jsScripts.list.useQuery(projectId ? { projectId } : {}, {
    staleTime: 30_000,
    retry: false
  });

export const useCreateJsScript = () => {
  const utils = trpc.useUtils();
  return trpc.jsScripts.create.useMutation({
    onSuccess: (created) => {
      void utils.jsScripts.list.invalidate();
      utils.jsScripts.get.setData({ id: created.id }, created);
    }
  });
};
