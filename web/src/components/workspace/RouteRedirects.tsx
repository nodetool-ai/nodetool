import { useEffect } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";

import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { usePanelStore } from "../../stores/PanelStore";
import {
  SETTINGS_SECTIONS,
  useSettingsPageStore,
  type SettingsSection
} from "../../stores/SettingsPageStore";

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
 * Settings used to be its own page at `/settings?tab=<n>`. It is a workspace
 * tab now, so the old links — Electron deep links, bookmarks — open that tab
 * and land in the workspace. The legacy tab index maps back to a section.
 */
export const SettingsRedirect = () => {
  const [searchParams] = useSearchParams();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const setSection = useSettingsPageStore((state) => state.setSection);
  const legacyTab = Number(searchParams.get("tab"));

  useEffect(() => {
    const section: SettingsSection =
      SETTINGS_SECTIONS[legacyTab] ?? "general";
    setSection(section);
    openTab({ type: "page", ref: "settings", mode: "view", title: "Settings" });
  }, [legacyTab, openTab, setSection]);

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
