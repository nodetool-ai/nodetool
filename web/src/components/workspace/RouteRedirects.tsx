import { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";

import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";

/**
 * Legacy `/editor/:workflow` links now resolve into the workspace: open the
 * workflow as a tab, then redirect to `/workspace`. This lets every existing
 * `navigate("/editor/" + id)` call site funnel into the new shell without
 * touching them.
 */
export const WorkflowEditorRedirect = () => {
  const { workflowId, workflow } = useParams<{
    workflowId?: string;
    workflow?: string;
  }>();
  const ref = workflowId ?? workflow;
  const openTab = useWorkspaceTabsStore((state) => state.openTab);

  useEffect(() => {
    if (ref) {
      openTab({ type: "workflow", ref, mode: "edit" });
    }
  }, [ref, openTab]);

  return <Navigate to="/workspace" replace />;
};
