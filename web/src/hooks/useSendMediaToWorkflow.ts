/**
 * Sends media from a surface that has no canvas of its own (storyboard shots,
 * script takes, timeline clips, the asset library) to a workflow as constant
 * nodes. The target is an open workflow tab or a new workflow. Its tab opens
 * afterwards so the creator sees where the nodes landed.
 */

import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import useMetadataStore from "../stores/MetadataStore";
import { useNotificationStore } from "../stores/NotificationStore";
import {
  creationProjectId,
  isTabInScope,
  useWorkspaceTabsStore
} from "../stores/WorkspaceTabsStore";
import {
  addMediaNodes,
  type WorkflowMediaItem
} from "./handlers/useGenerationToCanvas";

export interface WorkflowSendTarget {
  workflowId: string;
  title: string;
}

export interface SendMediaToWorkflow {
  /** The workflow tabs open in the current project, in tab-bar order. */
  targets: WorkflowSendTarget[];
  /** Add `items` to `workflowId`, or to a new workflow when it is null. */
  send: (
    items: readonly WorkflowMediaItem[],
    workflowId: string | null
  ) => Promise<void>;
}

const describeItems = (count: number): string =>
  count === 1 ? "1 item" : `${count} items`;

export const useSendMediaToWorkflow = (): SendMediaToWorkflow => {
  const navigate = useNavigate();
  const location = useLocation();
  const fetchWorkflow = useWorkflowManager((state) => state.fetchWorkflow);
  const createNew = useWorkflowManager((state) => state.createNew);
  const getNodeStore = useWorkflowManager((state) => state.getNodeStore);
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const tabs = useWorkspaceTabsStore((state) => state.tabs);
  const activeProjectId = useWorkspaceTabsStore(
    (state) => state.activeProjectId
  );
  const openTab = useWorkspaceTabsStore((state) => state.openTab);

  const targets = useMemo(
    () =>
      tabs
        .filter(
          (tab) => tab.type === "workflow" && isTabInScope(tab, activeProjectId)
        )
        .map((tab) => ({ workflowId: tab.ref, title: tab.title })),
    [tabs, activeProjectId]
  );

  const send = useCallback(
    async (items: readonly WorkflowMediaItem[], workflowId: string | null) => {
      if (items.length === 0) {
        return;
      }
      try {
        const projectId = workflowId === null ? creationProjectId() : undefined;
        const workflow =
          workflowId === null
            ? await createNew(projectId)
            : await fetchWorkflow(workflowId);
        const store = workflow ? getNodeStore(workflow.id) : undefined;
        if (!workflow || !store) {
          throw new Error("the workflow could not be loaded");
        }
        const added = addMediaNodes(store, items, getMetadata);
        openTab({
          type: "workflow",
          ref: workflow.id,
          mode: "edit",
          title: workflow.name,
          projectId
        });
        if (!location.pathname.startsWith("/workspace")) {
          navigate("/workspace");
        }
        if (added < items.length) {
          addNotification({
            type: "warning",
            alert: true,
            content: `Added ${describeItems(added)} of ${items.length} to ${workflow.name}. Node definitions are still loading, so try the rest again.`
          });
          return;
        }
        addNotification({
          type: "success",
          content: `Added ${describeItems(added)} to ${workflow.name}`
        });
      } catch (error) {
        addNotification({
          type: "error",
          alert: true,
          content: `Could not send media to the workflow: ${
            error instanceof Error ? error.message : String(error)
          }`
        });
      }
    },
    [
      addNotification,
      createNew,
      fetchWorkflow,
      getMetadata,
      getNodeStore,
      location.pathname,
      navigate,
      openTab
    ]
  );

  return { targets, send };
};
