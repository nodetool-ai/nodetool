/**
 * NodeResultHistoryStore accumulates node execution results across workflow runs.
 *
 * Responsibilities:
 * - Store historical results for nodes (persists across workflow runs)
 * - Track results with timestamps and job context
 * - Provide access to historical results by workflow and node
 * - Clear history on user action or workflow switch
 *
 * This store complements ResultsStore:
 * - ResultsStore: Current run results (cleared on each run)
 * - NodeResultHistoryStore: Accumulated history (persists in session)
 */

import { create } from "zustand";
import { hashKey } from "./ResultsStore";

export interface HistoricalResult {
  result: any;
  timestamp: number;
  jobId: string | null;
  status: string;
}

interface NodeResultHistoryStore {
  // History keyed by workflowId:nodeId, contains array of timestamped results
  history: Record<string, HistoricalResult[]>;

  // Add result to history
  addToHistory: (
    workflowId: string,
    nodeId: string,
    result: HistoricalResult
  ) => void;

  // Get history for a node
  getHistory: (workflowId: string, nodeId: string) => HistoricalResult[];

  // Clear history for a specific node
  clearNodeHistory: (workflowId: string, nodeId: string) => void;

  // Clear history for a workflow
  clearWorkflowHistory: (workflowId: string) => void;

  // Clear all history
  clearAllHistory: () => void;

  // Get history count for a node
  getHistoryCount: (workflowId: string, nodeId: string) => number;
}

const MAX_HISTORY_PER_NODE = 100; // Limit history to prevent memory issues

export const useNodeResultHistoryStore = create<NodeResultHistoryStore>(
  (set, get) => ({
    history: {},

    /**
     * Add a result to the history for a node.
     * Maintains a maximum history size per node.
     */
    addToHistory: (
      workflowId: string,
      nodeId: string,
      result: HistoricalResult
    ) => {
      const key = hashKey(workflowId, nodeId);
      const currentHistory = get().history[key] || [];

      // Add new result at the beginning (most recent first)
      const newHistory = [result, ...currentHistory];

      // Limit history size
      const trimmedHistory = newHistory.slice(0, MAX_HISTORY_PER_NODE);

      set({
        history: {
          ...get().history,
          [key]: trimmedHistory
        }
      });
    },

    /**
     * Get the history for a node.
     * Returns an array of historical results, most recent first.
     */
    getHistory: (workflowId: string, nodeId: string) => {
      const key = hashKey(workflowId, nodeId);
      return get().history[key] || [];
    },

    /**
     * Clear history for a specific node.
     */
    clearNodeHistory: (workflowId: string, nodeId: string) => {
      const key = hashKey(workflowId, nodeId);
      const history = { ...get().history };
      delete history[key];
      set({ history });
    },

    /**
     * Clear history for all nodes in a workflow.
     */
    clearWorkflowHistory: (workflowId: string) => {
      const history = { ...get().history };
      for (const key in history) {
        if (key.startsWith(workflowId)) {
          delete history[key];
        }
      }
      set({ history });
    },

    /**
     * Clear all history.
     */
    clearAllHistory: () => {
      set({ history: {} });
    },

    /**
     * Get the number of historical results for a node.
     */
    getHistoryCount: (workflowId: string, nodeId: string) => {
      const key = hashKey(workflowId, nodeId);
      return get().history[key]?.length || 0;
    }
  })
);

export default useNodeResultHistoryStore;
