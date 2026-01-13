import { useCallback } from "react";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import { useWorkflowDashboard } from "./useWorkflowDashboard";

export const useWorkflowManagerWithTracking = () => {
  const workflowManager = useWorkflowManager((state) => ({
    fetchWorkflow: state.fetchWorkflow,
    createNew: state.createNew,
    create: state.create,
    openWorkflows: state.openWorkflows,
    currentWorkflowId: state.currentWorkflowId,
    setCurrentWorkflowId: state.setCurrentWorkflowId
  }));
  const {
    addRecentWorkflow,
    trackWorkflowCreated,
    trackWorkflowRun,
    updateRecentWorkflow
  } = useWorkflowDashboard();

  const originalFetchWorkflow = workflowManager.fetchWorkflow;
  const originalCreateNew = workflowManager.createNew;
  const originalCreate = workflowManager.create;

  const fetchWorkflow = useCallback(
    async (workflowId: string) => {
      const result = await originalFetchWorkflow(workflowId);
      if (result) {
        addRecentWorkflow({
          id: result.id,
          name: result.name || "Untitled Workflow",
          nodeCount: result.graph?.nodes?.length || 0
        });
      }
      return result;
    },
    [originalFetchWorkflow, addRecentWorkflow]
  );

  const createNew = useCallback(async () => {
    const workflow = await originalCreateNew();
    trackWorkflowCreated(workflow.id, workflow.name || "Untitled Workflow");
    return workflow;
  }, [originalCreateNew, trackWorkflowCreated]);

  const create = useCallback(
    async (
      workflow: import("../stores/ApiTypes").WorkflowRequest,
      fromExamplePackage?: string,
      fromExampleName?: string
    ) => {
      const result = await originalCreate(
        workflow,
        fromExamplePackage,
        fromExampleName
      );
      trackWorkflowCreated(result.id, result.name || "Untitled Workflow");
      return result;
    },
    [originalCreate, trackWorkflowCreated]
  );

  return {
    ...workflowManager,
    fetchWorkflow,
    createNew,
    create
  };
};

export const useWorkflowTracking = () => {
  const { trackWorkflowRun, updateRecentWorkflow } = useWorkflowDashboard();
  
  const trackRunStatus = useCallback(
    (workflowId: string, workflowName: string, status: "success" | "error" | "cancelled") => {
      trackWorkflowRun(workflowId, workflowName, status);
    },
    [trackWorkflowRun]
  );

  const updateNodeCount = useCallback(
    (workflowId: string, nodeCount: number) => {
      updateRecentWorkflow(workflowId, { nodeCount });
    },
    [updateRecentWorkflow]
  );

  return {
    trackRunStatus,
    updateNodeCount
  };
};
