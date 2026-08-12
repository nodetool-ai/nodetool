/**
 * tRPC hooks for server-persisted JS scripts. Mirrors useScripts:
 * a list query plus a create mutation that keeps the caches fresh.
 */

import { trpc } from "../../trpc/client";

export const useJsScripts = () =>
  trpc.jsScripts.list.useQuery({}, { staleTime: 30_000 });

export const useCreateJsScript = () => {
  const utils = trpc.useUtils();
  return trpc.jsScripts.create.useMutation({
    onSuccess: (created) => {
      void utils.jsScripts.list.invalidate();
      utils.jsScripts.get.setData({ id: created.id }, created);
    }
  });
};
