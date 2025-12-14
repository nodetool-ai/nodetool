import { create } from "zustand";

type Log = {
  workflowId: string;
  workflowName: string;
  nodeId: string;
  nodeName: string;
  content: string;
  severity: "info" | "warning" | "error";
  timestamp: number;
  data?: any;
};

type LogsStore = {
  logs: Log[];
  getLogs: (workflowId: string, nodeId: string) => Log[];
  appendLog: (log: Log) => void;
  clearLogs: () => void;
};

const useLogsStore = create<LogsStore>((set, get) => ({
  logs: [],
  /**
   * Get the Logs for a node.
   *
   * @param workflowId The id of the workflow.
   * @param nodeId The id of the node.
   * @returns The Logs for the node.
   */
  getLogs: (workflowId: string, nodeId: string) => {
    return get().logs.filter(
      (log) => log.workflowId === workflowId && log.nodeId === nodeId
    );
  },
  /**
   * Append a log to the Logs for a node.
   *
   * @param log The log to append.
   */
  appendLog: (log: Log) => {
    set({ logs: [...get().logs, log] });
  },

  /**
   * Clear the Logs.
   */
  clearLogs: () => {
    set({ logs: [] });
  }
}));

export default useLogsStore;
