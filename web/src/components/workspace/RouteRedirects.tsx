import { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";

import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { usePanelStore } from "../../stores/PanelStore";

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

/**
 * `/chat/:thread_id?` used to open a fullscreen chat that took over the screen.
 * A conversation is now a workspace document: open the thread as a chat tab
 * (or reveal the Chats panel when the link carries no thread) and land in the
 * workspace.
 */
export const ChatThreadRedirect = () => {
  const { thread_id: threadId } = useParams<{ thread_id?: string }>();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const handleViewChange = usePanelStore((state) => state.handleViewChange);

  useEffect(() => {
    if (threadId) {
      openTab({ type: "chat", ref: threadId, mode: "view" });
    } else {
      handleViewChange("chats");
    }
  }, [threadId, openTab, handleViewChange]);

  return <Navigate to="/workspace" replace />;
};
