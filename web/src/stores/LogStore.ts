import { create } from "zustand";

type LogsStore = {
  logs: Record<string, string>;
  setLogs: (workflowId: string, nodeId: string, log: any) => void;
  getLogs: (workflowId: string, nodeId: string) => any;
  clearLogs: (workflowId: string) => void;
};

const hashKey = (workflowId: string, nodeId: string) =>
  `${workflowId}:${nodeId}`;

const useLogsStore = create<LogsStore>((set, get) => ({
  logs: {},

  /**
   * Clear the Logs for a workflow.
   *
   * @param workflowId The id of the workflow.
   */
  clearLogs: (workflowId: string) => {
    const logs = get().logs;
    for (const key in logs) {
      if (key.startsWith(workflowId)) {
        delete logs[key];
      }
    }
    set({ logs });
  },
  /**
   * Set the Logs for a node.
   * The Log is stored in the Logs map.
   *
   * @param workflowId The id of the workflow.
   * @param nodeId The id of the node.
   * @param Log The Log to set.
   */
  setLogs: (workflowId: string, nodeId: string, log: any) => {
    const key = hashKey(workflowId, nodeId);
    set({ logs: { ...get().logs, [key]: log } });
  },

  /**
   * Get the Logs for a node.
   *
   * @param workflowId The id of the workflow.
   * @param nodeId The id of the node.
   * @returns The Log for the node.
   */
  getLogs: (workflowId: string, nodeId: string) => {
    const logs = get().logs;
    const key = hashKey(workflowId, nodeId);
    return logs[key];
  }
}));

export default useLogsStore;
