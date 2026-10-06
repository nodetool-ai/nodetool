import { useCallback, useState } from "react";

import { trpc } from "../trpc/client";
import { useNodes } from "../contexts/NodeContext";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import { useNotificationStore } from "../stores/NotificationStore";
import {
  creationProjectId,
  useWorkspaceTabsStore
} from "../stores/WorkspaceTabsStore";
import { useCreateApplication } from "./useApplications";
import { UNTITLED_APP, useOpenApplication } from "./useOpenApplication";

const LIST_STALE_TIME = 30_000;

interface WorkflowAppAction {
  /** Open the app that runs this workflow, creating one when none does. */
  openWorkflowApp: () => Promise<void>;
  /** True when an app already runs this workflow. */
  hasApp: boolean;
  isPending: boolean;
}

/**
 * The editor's "Make app" action. An app is a separate resource, so this looks
 * for one whose operations run the open workflow and opens the most recently
 * edited. With none, it saves the graph (the server scaffolds from the stored
 * graph, one widget per Input node) and creates the app from the workflow.
 */
export const useWorkflowApp = (): WorkflowAppAction => {
  const workflow = useNodes((state) => state.workflow);
  const workflowId = workflow?.id ?? "";
  const getWorkflow = useWorkflowManager((state) => state.getWorkflow);
  const saveWorkflow = useWorkflowManager((state) => state.saveWorkflow);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const projectId = useWorkspaceTabsStore(
    (state) =>
      state.tabs.find(
        (tab) => tab.type === "workflow" && tab.ref === workflowId
      )?.projectId
  );
  const utils = trpc.useUtils();
  const { data: apps } = trpc.applications.list.useQuery(
    { workflowId },
    { enabled: !!workflowId, staleTime: LIST_STALE_TIME, retry: false }
  );
  const createApplication = useCreateApplication();
  const openApplication = useOpenApplication();
  const [isPending, setIsPending] = useState(false);

  const openWorkflowApp = useCallback(async () => {
    if (!workflowId || isPending) {
      return;
    }
    setIsPending(true);
    try {
      const existing = await utils.applications.list.fetch({ workflowId });
      const latest = [...existing].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt)
      )[0];
      if (latest) {
        openApplication(latest.id, latest.name, latest.projectId);
        return;
      }
      const current = getWorkflow(workflowId);
      if (current) {
        await saveWorkflow(current);
      }
      const created = await createApplication.mutateAsync({
        name: current?.name || workflow?.name || UNTITLED_APP,
        description: current?.description ?? workflow?.description ?? "",
        projectId: projectId ?? creationProjectId(),
        fromWorkflowId: workflowId
      });
      openApplication(created.id, created.name, created.projectId);
    } catch (error) {
      addNotification({
        type: "error",
        alert: true,
        content: `Could not open the app for this workflow: ${
          error instanceof Error ? error.message : String(error)
        }`
      });
    } finally {
      setIsPending(false);
    }
  }, [
    addNotification,
    createApplication,
    getWorkflow,
    isPending,
    openApplication,
    projectId,
    saveWorkflow,
    utils,
    workflow?.description,
    workflow?.name,
    workflowId
  ]);

  return { openWorkflowApp, hasApp: (apps?.length ?? 0) > 0, isPending };
};
