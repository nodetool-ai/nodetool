import { create } from "zustand";

export type Log = {
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
  /**
   * Per-node log buckets keyed by `${workflowId}:${nodeId}`.
   * Allows O(1) lookups in component selectors instead of O(n) filtering
   * over the full flat `logs` array on every store update.
   */
  logsByNode: Record<string, Log[]>;
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

export const nodeLogKey = (workflowId: string, nodeId: string): string =>
  `${workflowId}:${nodeId}`;

/** Rebuild the per-node map from a flat log array (used after trimming). */
const buildLogsByNode = (logs: Log[]): Record<string, Log[]> => {
  const result: Record<string, Log[]> = {};
  for (const log of logs) {
    const key = nodeLogKey(log.workflowId, log.nodeId);
    if (!result[key]) result[key] = [];
    result[key].push(log);
  }
  return result;
};

const useLogsStore = create<LogsStore>((set, get) => ({
  logs: [],
  logsByNode: {},
  /**
   * Get the Logs for a node.
   *
   * @param workflowId The id of the workflow.
   * @param nodeId The id of the node.
   * @returns The Logs for the node.
   */
  getLogs: (workflowId: string, nodeId: string) => {
    return get().logsByNode[nodeLogKey(workflowId, nodeId)] ?? [];
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
      const key = nodeLogKey(safeLog.workflowId, safeLog.nodeId);

      if (next.length <= MAX_LOGS_TOTAL) {
        return {
          logs: next,
          logsByNode: {
            ...state.logsByNode,
            [key]: [...(state.logsByNode[key] ?? []), safeLog]
          }
        };
      }

      // When the total cap is exceeded, trim oldest logs and rebuild the
      // per-node map from the trimmed array to stay consistent.
      const trimmed = next.slice(next.length - MAX_LOGS_TOTAL);
      return { logs: trimmed, logsByNode: buildLogsByNode(trimmed) };
    });
  },

  /**
   * Clear the Logs.
   */
  clearLogs: () => {
    set({ logs: [], logsByNode: {} });
  }
}));

export default useLogsStore;
