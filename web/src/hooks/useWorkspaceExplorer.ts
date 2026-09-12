import { useCallback } from "react";

import { useWorkspaceExplorerStore } from "../stores/WorkspaceExplorerStore";
import { useWorkspaces } from "./useWorkspaces";
import type { WorkspaceResponse } from "../stores/ApiTypes";

interface WorkspaceExplorerSelection {
  workspaceId: string | undefined;
  workspace: WorkspaceResponse | undefined;
  setWorkspaceId: (newWorkspaceId: string | undefined) => void;
  isLoading: boolean;
}

/**
 * Which workspace the Workspace Explorer shows inside the requested project.
 *
 * The user's own choice, persisted, falling back to the default workspace —
 * which the server creates while answering the list call, so the explorer has
 * something to show on a healthy install with no workflow open. A remembered
 * id that does not exist in this project (deleted workspace, another machine,
 * or the workspace selected in a different project) loses to the project's
 * first available workspace rather than leaving the tree pointed at nothing.
 *
 * Nothing here reads or writes a workflow. Compare {@link useCurrentWorkspace},
 * which resolves where the *active workflow's* run writes.
 */
export const useWorkspaceExplorer = (
  projectId?: string
): WorkspaceExplorerSelection => {
  const { workspaces, defaultWorkspace, isLoading } = useWorkspaces(projectId);

  const browsedWorkspaceId = useWorkspaceExplorerStore(
    (state) => state.browsedWorkspaceId
  );
  const setBrowsedWorkspaceId = useWorkspaceExplorerStore(
    (state) => state.setBrowsedWorkspaceId
  );

  const knownBrowsed =
    browsedWorkspaceId &&
    workspaces.some((workspace) => workspace.id === browsedWorkspaceId)
      ? browsedWorkspaceId
      : null;

  const workspaceId = knownBrowsed ?? defaultWorkspace?.id ?? null;

  const setWorkspaceId = useCallback(
    (newWorkspaceId: string | undefined) => {
      setBrowsedWorkspaceId(newWorkspaceId ?? null);
    },
    [setBrowsedWorkspaceId]
  );

  return {
    workspaceId: workspaceId ?? undefined,
    workspace: workspaces.find((workspace) => workspace.id === workspaceId),
    setWorkspaceId,
    isLoading
  };
};
