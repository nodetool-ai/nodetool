/**
 * Opens the workflow that generated an asset. "Open workflow" opens the saved
 * workflow, which may have changed since. "Open as it was when made" opens a
 * new unsaved workflow holding the graph and inputs the run executed with.
 * Both reveal the node that produced the asset when the graph has it.
 */

import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import { useNotificationStore } from "../stores/NotificationStore";
import {
  creationProjectId,
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore
} from "../stores/WorkspaceTabsStore";
import type { Asset, Graph } from "../stores/ApiTypes";
import type { JobSnapshot } from "../serverState/useJobSnapshot";
import { formatDateTime } from "../utils/formatUtils";
import { requestFitNode } from "./useFitNodeEvent";

export interface OpenAssetWorkflow {
  /** Open the saved workflow named by `asset.workflow_id`. */
  openWorkflow: (asset: Asset) => Promise<void>;
  /** Open the run's graph as a new unsaved workflow. */
  openSnapshot: (asset: Asset, snapshot: JobSnapshot) => Promise<void>;
}

/** Title for a reopened run, e.g. `Portrait (as made 10/6/2026, 9:00 AM)`. */
export const snapshotWorkflowName = (
  sourceName: string | undefined,
  snapshot: Pick<JobSnapshot, "name" | "started_at">
): string => {
  const base = sourceName || snapshot.name || "Workflow";
  return snapshot.started_at
    ? `${base} (as made ${formatDateTime(snapshot.started_at)})`
    : `${base} (as made)`;
};

export const useOpenAssetWorkflow = (): OpenAssetWorkflow => {
  const navigate = useNavigate();
  const getWorkflow = useWorkflowManager((state) => state.getWorkflow);
  const fetchWorkflow = useWorkflowManager((state) => state.fetchWorkflow);
  const createNew = useWorkflowManager((state) => state.createNew);
  const openForegroundTab = useWorkspaceTabsStore(
    (state) => state.openForegroundTab
  );
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  // The tab must carry the workflow's project and come to the foreground. A
  // tab opened without a project while another project is active is out of
  // scope, so the workspace shows nothing and the click looks dead. The
  // workflow is usually not loaded yet, so fetch it to learn its project.
  const openWorkflow = useCallback(
    async (asset: Asset) => {
      const workflowId = asset.workflow_id;
      if (!workflowId) {
        return;
      }
      const workflow = await fetchWorkflow(workflowId, { makeCurrent: false });
      if (!workflow) {
        addNotification({
          type: "warning",
          alert: true,
          content: "The workflow that made this asset no longer exists."
        });
        return;
      }
      openForegroundTab({
        type: "workflow",
        ref: workflowId,
        mode: "edit",
        title: workflow.name,
        projectId: workflow.project_id ?? LOOSE_PROJECT_ID
      });
      navigate("/workspace");
      if (asset.node_id) {
        requestFitNode({ workflowId, nodeId: asset.node_id });
      }
    },
    [addNotification, fetchWorkflow, navigate, openForegroundTab]
  );

  const openSnapshot = useCallback(
    async (asset: Asset, snapshot: JobSnapshot) => {
      if (!snapshot.graph) {
        return;
      }
      try {
        const projectId = creationProjectId();
        const source = asset.workflow_id
          ? getWorkflow(asset.workflow_id)
          : undefined;
        const workflow = await createNew(projectId, {
          name: snapshotWorkflowName(source?.name, snapshot),
          // SAFETY: the snapshot procedure returns the saved-graph shape the
          // workflow API returns; tRPC types its passthrough fields loosely.
          graph: snapshot.graph as Graph
        });
        openForegroundTab({
          type: "workflow",
          ref: workflow.id,
          mode: "edit",
          title: workflow.name,
          projectId
        });
        navigate("/workspace");
        if (asset.node_id) {
          requestFitNode({ workflowId: workflow.id, nodeId: asset.node_id });
        }
      } catch (error) {
        addNotification({
          type: "error",
          alert: true,
          content: `Could not open the workflow as it was: ${
            error instanceof Error ? error.message : String(error)
          }`
        });
      }
    },
    [addNotification, createNew, getWorkflow, navigate, openForegroundTab]
  );

  return { openWorkflow, openSnapshot };
};
