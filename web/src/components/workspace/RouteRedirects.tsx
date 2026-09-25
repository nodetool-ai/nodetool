import { useEffect, useState } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";

import { trpcClient } from "../../trpc/client";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { LOOSE_PROJECT_ID, useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { usePanelStore } from "../../stores/PanelStore";
import { useNotificationStore } from "../../stores/NotificationStore";
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
  const setActiveProjectId = useWorkspaceTabsStore((state) => state.setActiveProjectId);
  const addNotification = useNotificationStore((state) => state.addNotification);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    if (!ref) {
      setResolved(true);
      return;
    }
    const controller = new AbortController();
    void trpcClient.workflows.get.query({ id: ref }, { signal: controller.signal })
      .then((workflow) => {
        if (controller.signal.aborted) return;
        setActiveProjectId(workflow.project_id ?? null);
        openTab({
          type: "workflow", ref: workflow.id, mode: "edit",
          projectId: workflow.project_id ?? LOOSE_PROJECT_ID
        });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          addNotification({
            type: "error", alert: true,
            content: `Could not open workflow: ${error instanceof Error ? error.message : String(error)}`
          });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setResolved(true);
      });
    return () => controller.abort();
  }, [ref, openTab, setActiveProjectId, addNotification]);

  return resolved ? <Navigate to="/workspace" replace /> : null;
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
  const setActiveProjectId = useWorkspaceTabsStore((state) => state.setActiveProjectId);
  const addNotification = useNotificationStore((state) => state.addNotification);
  const handleViewChange = usePanelStore((state) => state.handleViewChange);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    if (!threadId) {
      handleViewChange("chats");
      setResolved(true);
      return;
    }
    const localThread = useGlobalChatStore.getState().threads[threadId];
    if (localThread) {
      setActiveProjectId(localThread.project_id ?? null);
      openTab({
        type: "chat", ref: localThread.id, mode: "view",
        projectId: localThread.project_id ?? LOOSE_PROJECT_ID
      });
      setResolved(true);
      return;
    }
    const controller = new AbortController();
    void trpcClient.threads.get.query({ id: threadId }, { signal: controller.signal })
      .then((thread) => {
        if (controller.signal.aborted) return;
        setActiveProjectId(thread.project_id ?? null);
        openTab({
          type: "chat",
          ref: thread.id,
          mode: "view",
          projectId: thread.project_id ?? LOOSE_PROJECT_ID
        });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          addNotification({
            type: "error", alert: true,
            content: `Could not open chat: ${error instanceof Error ? error.message : String(error)}`
          });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setResolved(true);
      });
    return () => controller.abort();
  }, [threadId, openTab, handleViewChange, setActiveProjectId, addNotification]);

  return resolved ? <Navigate to="/workspace" replace /> : null;
};
