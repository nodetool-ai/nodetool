import { useQuery, useQueryClient } from "@tanstack/react-query";

import { trpcClient } from "../trpc/client";
import type { WorkspaceResponse } from "../stores/ApiTypes";

export const WORKSPACES_QUERY_KEY = ["workspaces"] as const;

export interface WorkspacesData {
  workspaces: WorkspaceResponse[];
  /**
   * Whether this deployment lets the user point a workspace at a host folder.
   * False in the cloud, where the server-managed workspace is the only one and
   * a folder picker would have nothing to browse.
   */
  canManage: boolean;
}

const fetchWorkspaces = async (): Promise<WorkspacesData> => {
  const result = await trpcClient.workspace.list.query({ limit: 100 });
  return {
    workspaces: result.workspaces as WorkspaceResponse[],
    canManage: result.can_manage
  };
};

/**
 * The user's workspaces plus what this deployment allows doing with them.
 *
 * One query for every surface that shows workspaces — the composer chip, the
 * workflow form, the settings manager — so they cannot disagree about which
 * one is default. The server creates the default workspace while answering
 * this call, so the list is never empty on a healthy install.
 */
export function useWorkspaces() {
  const query = useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: fetchWorkspaces
  });
  const workspaces = query.data?.workspaces ?? [];
  return {
    workspaces,
    canManage: query.data?.canManage ?? false,
    defaultWorkspace:
      workspaces.find((workspace) => workspace.is_default) ?? workspaces[0],
    isLoading: query.isLoading,
    error: query.error
  };
}

/** Insert or replace one workspace in the cached list without a refetch. */
export function useWorkspaceCacheWriter() {
  const queryClient = useQueryClient();
  return (workspace: WorkspaceResponse) => {
    queryClient.setQueryData<WorkspacesData>(WORKSPACES_QUERY_KEY, (prev) => {
      if (!prev) return prev;
      const without = prev.workspaces.filter((w) => w.id !== workspace.id);
      return { ...prev, workspaces: [...without, workspace] };
    });
    queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY });
  };
}
