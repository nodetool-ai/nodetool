/**
 * StatusStore tracks execution status values for nodes.
 *
 * Responsibilities:
 * - Store arbitrary status values for workflow nodes
 * - Provide thread-safe status updates and retrieval
 * - Clear all statuses when a workflow completes
 *
 * Status values can be strings, objects, or null/undefined.
 * Used to track node state during workflow execution.
 *
 * Keys are scoped by job: `${workflowId}:${jobId}:${nodeId}`. This lets
 * concurrent same-workflow runs keep independent per-node status while the
 * canvas focuses one run at a time (see WorkflowRunsStore).
 */

import { create } from "zustand";

type StatusValue = string | Record<string, unknown> | null | undefined;

type StatusStore = {
  statuses: Record<string, StatusValue>;
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
};

export const hashKey = (
  workflowId: string,
  jobId: string,
  nodeId: string
): string => `${workflowId}:${jobId}:${nodeId}`;

const useStatusStore = create<StatusStore>((set, get) => ({
  statuses: {},

  /**
   * Clear the statuses for a workflow.
   * If nodeIds is provided, only clears statuses for those specific nodes
   * (matching on the node being the final colon-segment, across all jobs).
   *
   * @param workflowId The id of the workflow.
   * @param nodeIds Optional set of node IDs to clear. If omitted, clears all nodes in the workflow.
   */
  clearStatuses: (workflowId: string, nodeIds?: Set<string>) => {
    const statuses = get().statuses;
    const newStatuses = { ...statuses };
    let changed = false;
    const prefix = `${workflowId}:`;

    if (nodeIds) {
      const suffixes = Array.from(nodeIds).map((id) => `:${id}`);
      for (const key in newStatuses) {
        if (
          key.startsWith(prefix) &&
          suffixes.some((suffix) => key.endsWith(suffix))
        ) {
          delete newStatuses[key];
          changed = true;
        }
      }
    } else {
      for (const key in newStatuses) {
        if (key.startsWith(prefix)) {
          delete newStatuses[key];
          changed = true;
        }
      }
    }

    if (changed) {
      set({ statuses: newStatuses });
    }
  },

  /**
   * Set the status for a node within a specific job.
   *
   * @param workflowId The id of the workflow.
   * @param jobId The id of the run/job.
   * @param nodeId The id of the node.
   * @param status The status to set.
   */
  setStatus: (
    workflowId: string,
    jobId: string,
    nodeId: string,
    status: StatusValue
  ) => {
    const key = hashKey(workflowId, jobId, nodeId);
    if (get().statuses[key] === status) return;
    set({ statuses: { ...get().statuses, [key]: status } });
  },

  /**
   * Get the status for a node within a specific job.
   *
   * @param workflowId The id of the workflow.
   * @param jobId The id of the run/job.
   * @param nodeId The id of the node.
   * @returns The status for the node.
   */
  getStatus: (
    workflowId: string,
    jobId: string,
    nodeId: string
  ): StatusValue | undefined => {
    const statuses = get().statuses;
    const key = hashKey(workflowId, jobId, nodeId);
    return statuses[key];
  }
}));

export default useStatusStore;
