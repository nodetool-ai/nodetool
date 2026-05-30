import { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";

import {
  useWorkspaceTabsStore,
  type WorkspaceTabMode
} from "../../stores/WorkspaceTabsStore";

/**
 * Legacy `/editor/:workflow` and `/apps/:workflowId` links now resolve into the
 * workspace: open the workflow as a tab in the right mode, then redirect to
 * `/workspace`. This lets every existing `navigate("/editor/" + id)` call site
 * funnel into the new shell without touching them.
 */
const useOpenWorkflowTab = (mode: WorkspaceTabMode) => {
  const { workflowId, workflow } = useParams<{
    workflowId?: string;
    workflow?: string;
  }>();
  const ref = workflowId ?? workflow;
  const openTab = useWorkspaceTabsStore((state) => state.openTab);

  useEffect(() => {
    if (ref) {
      openTab({ type: "workflow", ref, mode });
    }
  }, [ref, mode, openTab]);
};

export const WorkflowEditorRedirect = () => {
  useOpenWorkflowTab("edit");
  return <Navigate to="/workspace" replace />;
};

export const WorkflowAppRedirect = () => {
  useOpenWorkflowTab("view");
  return <Navigate to="/workspace" replace />;
};
