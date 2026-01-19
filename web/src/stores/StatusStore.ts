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
 */

import { create } from "zustand";

type StatusValue = string | Record<string, unknown> | null | undefined;

type StatusStore = {
  statuses: Record<string, StatusValue>;
  setStatus: (workflowId: string, nodeId: string, status: StatusValue) => void;
  getStatus: (workflowId: string, nodeId: string) => StatusValue | undefined;
  clearStatuses: (workflowId: string) => void;
};

export const hashKey = (workflowId: string, nodeId: string) =>
  `${workflowId}:${nodeId}`;

const useStatusStore = create<StatusStore>((set, get) => ({
  statuses: {},

  /**
   * Clear the statuses for a workflow.
   *
   * @param workflowId The id of the workflow.
   */
  clearStatuses: (workflowId: string) => {
    const statuses = get().statuses;
    for (const key in statuses) {
      if (key.startsWith(workflowId)) {
        delete statuses[key];
      }
    }
    set({ statuses });
  },

  /**
   * Set the status for a node.
   * The status is stored in the statuses map.
   *
   * @param workflowId The id of the workflow.
   * @param nodeId The id of the node.
   * @param status The status to set.
   */
  setStatus: (workflowId: string, nodeId: string, status: StatusValue) => {
    const key = hashKey(workflowId, nodeId);
    set({ statuses: { ...get().statuses, [key]: status } });
  },

  /**
   * Get the status for a node.
   *
   * @param workflowId The id of the workflow.
   * @param nodeId The id of the node.
   * @returns The status for the node.
   */
  getStatus: (workflowId: string, nodeId: string): StatusValue | undefined => {
    const statuses = get().statuses;
    const key = hashKey(workflowId, nodeId);
    return statuses[key];
  }
}));

export default useStatusStore;
