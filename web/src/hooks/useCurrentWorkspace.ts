import { useCallback, useEffect } from "react";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import { useCurrentWorkspaceStore } from "../stores/CurrentWorkspaceStore";

/**
 * Central source-of-truth for "which workspace is active right now".
 *
 * Workspace selection is stored on each workflow (workflow.workspace_id).
 * This hook reads that value for the active workflow, falling back to the
 * last-used workspace (persisted) when no workflow is open or the active
 * workflow has no workspace assigned. Setting the workspace patches the
 * active workflow and remembers the choice for future new workflows.
 */
export const useCurrentWorkspace = () => {
  const currentWorkflowId = useWorkflowManager(
    (state) => state.currentWorkflowId
  );
  const getCurrentWorkflow = useWorkflowManager(
    (state) => state.getCurrentWorkflow
  );
  const updateWorkflow = useWorkflowManager((state) => state.updateWorkflow);
  const saveWorkflow = useWorkflowManager((state) => state.saveWorkflow);
  const openWorkflows = useWorkflowManager((state) => state.openWorkflows);

  const lastUsedWorkspaceId = useCurrentWorkspaceStore(
    (state) => state.lastUsedWorkspaceId
  );
  const setLastUsedWorkspaceId = useCurrentWorkspaceStore(
    (state) => state.setLastUsedWorkspaceId
  );

  const currentWorkflow = getCurrentWorkflow();
  const currentWorkflowMeta = openWorkflows.find(
    (workflow) => workflow.id === currentWorkflowId
  );

  const workflowWorkspaceId =
    currentWorkflowMeta?.workspace_id ?? currentWorkflow?.workspace_id ?? null;

  const workspaceId = workflowWorkspaceId ?? lastUsedWorkspaceId;

  // Mirror the active workflow's workspace into the persisted "last used"
  // so a newly-created workflow inherits whatever the user was just working in.
  useEffect(() => {
    if (workflowWorkspaceId && workflowWorkspaceId !== lastUsedWorkspaceId) {
      setLastUsedWorkspaceId(workflowWorkspaceId);
    }
  }, [workflowWorkspaceId, lastUsedWorkspaceId, setLastUsedWorkspaceId]);

  const setWorkspaceId = useCallback(
    async (newWorkspaceId: string | undefined) => {
      const normalized = newWorkspaceId ?? null;
      setLastUsedWorkspaceId(normalized);

      if (!currentWorkflow) return;

      const updated = { ...currentWorkflow, workspace_id: normalized };
      updateWorkflow(updated);
      try {
        await saveWorkflow(updated);
      } catch (error) {
        console.error("Failed to save workspace change:", error);
      }
    },
    [currentWorkflow, updateWorkflow, saveWorkflow, setLastUsedWorkspaceId]
  );

  return {
    workspaceId: workspaceId ?? undefined,
    setWorkspaceId,
    hasActiveWorkflow: Boolean(currentWorkflow)
  };
};
