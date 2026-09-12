import { useQuery, useQueryClient } from "@tanstack/react-query";

import { trpcClient } from "../trpc/client";
import type { WorkspaceResponse } from "../stores/ApiTypes";

export const WORKSPACES_QUERY_KEY = ["workspaces"] as const;

export const workspacesQueryKey = (projectId?: string): readonly unknown[] =>
  projectId
    ? [...WORKSPACES_QUERY_KEY, "list", { projectId }]
    : WORKSPACES_QUERY_KEY;

export interface WorkspacesData {
  workspaces: WorkspaceResponse[];
  /**
   * Whether this deployment lets the user point a workspace at a host folder.
   * False in the cloud, where the server-managed workspace is the only one and
   * a folder picker would have nothing to browse.
   */
  canManage: boolean;
}

const fetchWorkspaces = async (projectId?: string): Promise<WorkspacesData> => {
  const result = await trpcClient.workspace.list.query(
    projectId ? { limit: 100, project_id: projectId } : { limit: 100 }
  );
  return {
    workspaces: result.workspaces as WorkspaceResponse[],
    canManage: result.can_manage
  };
};

/**
 * The user's workspaces, optionally limited to one project, plus what this
 * deployment allows doing with them.
 *
 * Project scope is part of the query key so the left-panel explorer cannot
 * reuse another project's cached workspace list. Unscoped surfaces retain the
 * account-wide list.
 */
export function useWorkspaces(projectId?: string) {
  const query = useQuery({
    queryKey: workspacesQueryKey(projectId),
    queryFn: () => fetchWorkspaces(projectId),
    staleTime: 30_000,
    retry: false
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
export function useWorkspaceCacheWriter(projectId?: string) {
  const queryClient = useQueryClient();
  return (workspace: WorkspaceResponse) => {
    queryClient.setQueryData<WorkspacesData>(
      workspacesQueryKey(projectId),
      (prev) => {
        if (!prev) return prev;
        const without = prev.workspaces.filter((w) => w.id !== workspace.id);
        return { ...prev, workspaces: [...without, workspace] };
      }
    );
    queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY });
  };
}
