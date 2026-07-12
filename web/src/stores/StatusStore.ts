/**
 * StatusStore tracks execution status values for nodes during a workflow run.
 *
 * Keys are scoped by job: `${workflowId}:${jobId}:${nodeId}`. This lets
 * concurrent same-workflow runs keep independent per-node status while the
 * canvas focuses one run at a time (see WorkflowRunsStore).
 */

import { create } from "zustand";
import { nodeKey, type NodeKey } from "./nodeKey";

type StatusValue = string | Record<string, unknown> | null | undefined;

type StatusStore = {
  statuses: Record<NodeKey, StatusValue>;
  setStatus: (
    workflowId: string,
    jobId: string,
    nodeId: string,
    status: StatusValue
  ) => void;
  getStatus: (
    workflowId: string,
    jobId: string,
    nodeId: string
  ) => StatusValue | undefined;
  clearStatuses: (workflowId: string, nodeIds?: Set<string>) => void;
  clearJobStatuses: (workflowId: string, jobId: string) => void;
};

const useStatusStore = create<StatusStore>((set, get) => ({
  statuses: {},

  /**
   * Clear the statuses for a workflow. If nodeIds is provided, only clears
   * statuses for those specific nodes (matching on the node being the final
   * colon-segment, across all jobs); otherwise clears every node in the workflow.
   */
  clearStatuses: (workflowId: string, nodeIds?: Set<string>) => {
    const statuses = get().statuses;
    const newStatuses = { ...statuses };
    let changed = false;
    const prefix = `${workflowId}:`;

    if (nodeIds) {
      for (const key in newStatuses) {
        if (key.startsWith(prefix)) {
          const lastColonIndex = key.lastIndexOf(':');
          if (lastColonIndex !== -1) {
            const id = key.substring(lastColonIndex + 1);
            if (nodeIds.has(id)) {
              delete newStatuses[key as NodeKey];
              changed = true;
            }
          }
        }
      }
    } else {
      for (const key in newStatuses) {
        if (key.startsWith(prefix)) {
          delete newStatuses[key as NodeKey];
          changed = true;
        }
      }
    }

    if (changed) {
      set({ statuses: newStatuses });
    }
  },

  /**
   * Clear all node statuses belonging to one run. Job-scoped, so a
   * concurrently running sibling job of the same workflow is untouched —
   * used when a run is cancelled and its "running" borders must stop.
   */
  clearJobStatuses: (workflowId: string, jobId: string) => {
    const statuses = get().statuses;
    const newStatuses = { ...statuses };
    let changed = false;
    const prefix = `${workflowId}:${jobId}:`;
    for (const key in newStatuses) {
      if (key.startsWith(prefix)) {
        delete newStatuses[key as NodeKey];
        changed = true;
      }
    }
    if (changed) {
      set({ statuses: newStatuses });
    }
  },

  setStatus: (
    workflowId: string,
    jobId: string,
    nodeId: string,
    status: StatusValue
  ) => {
    const key = nodeKey(workflowId, jobId, nodeId);
    if (get().statuses[key] === status) return;
    set({ statuses: { ...get().statuses, [key]: status } });
  },

  getStatus: (
    workflowId: string,
    jobId: string,
    nodeId: string
  ): StatusValue | undefined => {
    const statuses = get().statuses;
    const key = nodeKey(workflowId, jobId, nodeId);
    return statuses[key];
  }
}));

export default useStatusStore;
