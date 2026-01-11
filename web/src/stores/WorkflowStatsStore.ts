/**
 * WorkflowStatsStore manages workflow statistics state.
 */
import { create } from "zustand";

export interface WorkflowStats {
  nodeCount: number;
  edgeCount: number;
  nodeTypeBreakdown: Record<string, number>;
  connectedNodeCount: number;
  disconnectedNodeCount: number;
  inputNodeCount: number;
  outputNodeCount: number;
  processingNodeCount: number;
  groupNodeCount: number;
  commentNodeCount: number;
  complexityScore: number;
  maxDepth: number;
  lastUpdated: number;
}

interface WorkflowStatsState {
  stats: WorkflowStats;
  setStats: (stats: WorkflowStats) => void;
  clearStats: () => void;
}

const createInitialStats = (): WorkflowStats => ({
  nodeCount: 0,
  edgeCount: 0,
  nodeTypeBreakdown: {},
  connectedNodeCount: 0,
  disconnectedNodeCount: 0,
  inputNodeCount: 0,
  outputNodeCount: 0,
  processingNodeCount: 0,
  groupNodeCount: 0,
  commentNodeCount: 0,
  complexityScore: 0,
  maxDepth: 0,
  lastUpdated: Date.now()
});

export const useWorkflowStatsStore = create<WorkflowStatsState>()(
  (set) => ({
    stats: createInitialStats(),

    setStats: (stats: WorkflowStats) =>
      set({ stats }),

    clearStats: () =>
      set({ stats: createInitialStats() })
  })
);
