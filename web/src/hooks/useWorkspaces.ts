import { useQuery } from "@tanstack/react-query";

import { trpcClient } from "../trpc/client";

export const WORKSPACES_QUERY_KEY = ["workspaces"] as const;

/**
 * Whether this deployment lets the user point a project at a host folder.
 * False in the cloud, where the server-managed folder is the only one and a
 * folder picker would have nothing to browse. Open folder and Locate read it.
 */
export function useWorkspaces(): { canManage: boolean; isLoading: boolean } {
  const query = useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: async () => {
      const result = await trpcClient.workspace.list.query({ limit: 1 });
      return result.can_manage;
    },
    staleTime: 30_000,
    retry: false
  });
  return { canManage: query.data ?? false, isLoading: query.isLoading };
}
