import { useCallback } from "react";
import {
  useWorkflowDashboardStore,
  RecentWorkflow,
  WorkflowActivity
} from "../stores/WorkflowDashboardStore";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import useGlobalChatStore from "../stores/GlobalChatStore";

export const useWorkflowDashboard = () => {
  const store = useWorkflowDashboardStore();
  const { openWorkflow, getCurrentWorkflow } = useWorkflowManager((state) => ({
    openWorkflow: state.openWorkflows.find((w) => w.id === state.currentWorkflowId),
    getCurrentWorkflow: () => {
      const currentId = state.currentWorkflowId;
      if (!currentId) return null;
      const store = state.nodeStores[currentId];
      if (!store) return null;
      return store.getState().workflow;
    }
  }));
  const { createNewThread } = useGlobalChatStore((state) => ({
    createNewThread: state.createNewThread
  }));

  const addRecentWorkflow = useCallback(
    (workflow: Omit<RecentWorkflow, "lastOpened">) => {
      store.addRecentWorkflow(workflow);
      store.addActivity({
        type: "opened",
        workflowId: workflow.id,
        workflowName: workflow.name
      });
    },
    [store]
  );

  const trackWorkflowRun = useCallback(
    (workflowId: string, workflowName: string, status: "success" | "error" | "cancelled") => {
      store.updateRecentWorkflow(workflowId, {
        lastRunStatus: status,
        lastRunTime: Date.now()
      });
      store.addActivity({
        type: "run",
        workflowId,
        workflowName,
        details: status
      });
    },
    [store]
  );

  const trackWorkflowCreated = useCallback(
    (workflowId: string, workflowName: string) => {
      store.addRecentWorkflow({
        id: workflowId,
        name: workflowName,
        nodeCount: 0
      });
      store.addActivity({
        type: "created",
        workflowId,
        workflowName
      });
    },
    [store]
  );

  const trackWorkflowDeleted = useCallback(
    (workflowId: string, workflowName: string) => {
      store.removeRecentWorkflow(workflowId);
      store.addActivity({
        type: "deleted",
        workflowId,
        workflowName
      });
    },
    [store]
  );

  const openRecentWorkflow = useCallback(
    async (workflowId: string) => {
      const workflow = store.recentWorkflows.find((w) => w.id === workflowId);
      if (workflow) {
        store.addRecentWorkflow({
          id: workflow.id,
          name: workflow.name,
          nodeCount: workflow.nodeCount
        });
      }
    },
    [store]
  );

  const createQuickChat = useCallback(
    async (workflowId: string, workflowName: string) => {
      const threadId = await createNewThread(`Discuss: ${workflowName}`);
      store.addActivity({
        type: "opened",
        workflowId,
        workflowName,
        details: "Opened in chat"
      });
      return threadId;
    },
    [store, createNewThread]
  );

  const clearDashboard = useCallback(() => {
    store.clearRecentWorkflows();
    store.clearActivity();
  }, [store]);

  return {
    recentWorkflows: store.recentWorkflows,
    quickActions: store.quickActions,
    recentActivity: store.recentActivity,
    isExpanded: store.isExpanded,
    addRecentWorkflow,
    removeRecentWorkflow: store.removeRecentWorkflow,
    clearRecentWorkflows: store.clearRecentWorkflows,
    updateRecentWorkflow: store.updateRecentWorkflow,
    addActivity: store.addActivity,
    clearActivity: store.clearActivity,
    toggleExpanded: store.toggleExpanded,
    setExpanded: store.setExpanded,
    getRecentWorkflows: store.getRecentWorkflows,
    getActivityForWorkflow: store.getActivityForWorkflow,
    trackWorkflowRun,
    trackWorkflowCreated,
    trackWorkflowDeleted,
    openRecentWorkflow,
    createQuickChat,
    clearDashboard
  };
};
