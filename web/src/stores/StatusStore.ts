import { create } from "zustand";

type StatusStore = {
  statuses: Record<string, any>;
  setStatus: (workflowId: string, nodeId: string, status: any) => void;
  getStatus: (workflowId: string, nodeId: string) => any;
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
  setStatus: (workflowId: string, nodeId: string, status: any) => {
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
  getStatus: (workflowId: string, nodeId: string) => {
    const statuses = get().statuses;
    const key = hashKey(workflowId, nodeId);
    return statuses[key];
  }
}));

export default useStatusStore;
