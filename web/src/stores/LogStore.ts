import { create } from "zustand";

type Log = {
  workflowId: string;
  workflowName: string;
  nodeId: string;
  nodeName: string;
  content: string;
  severity: "info" | "warning" | "error";
  timestamp: number;
  data?: unknown;
};

type LogsStore = {
  logs: Log[];
  getLogs: (workflowId: string, nodeId: string) => Log[];
  appendLog: (log: Log) => void;
  clearLogs: () => void;
};

const MAX_LOGS_TOTAL = 5000;
const MAX_LOG_CONTENT_CHARS = 20_000;

const truncateLogContent = (content: string): string => {
  if (content.length <= MAX_LOG_CONTENT_CHARS) {
    return content;
  }
  return `${content.slice(0, MAX_LOG_CONTENT_CHARS)}\n… (truncated)`;
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
    const safeLog: Log = {
      ...log,
      content:
        typeof log.content === "string"
          ? truncateLogContent(log.content)
          : truncateLogContent(String(log.content))
    };

    set((state) => {
      const next = [...state.logs, safeLog];
      if (next.length <= MAX_LOGS_TOTAL) {
        return { logs: next };
      }
      return { logs: next.slice(next.length - MAX_LOGS_TOTAL) };
    });
  },

  /**
   * Clear the Logs.
   */
  clearLogs: () => {
    set({ logs: [] });
  }
}));

export default useLogsStore;
