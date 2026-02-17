/**
 * Tracks workflow execution statistics for performance monitoring.
 *
 * Stores execution metrics including run counts, last execution time,
 * and total execution duration for each workflow. Provides insights
 * into workflow usage patterns and performance trends.
 *
 * Used by:
 * - WorkflowStats component to display workflow metrics
 * - Performance analysis and optimization
 * - Usage tracking and reporting
 *
 * @example
 * ```typescript
 * import useWorkflowStatsStore from './WorkflowStatsStore';
 *
 * const store = useWorkflowStatsStore();
 * store.recordExecution('workflow-1', 5000); // 5 second execution
 * const stats = store.getStats('workflow-1');
 * console.log(`Executed ${stats.runCount} times`);
 * ```
 */
import { create } from "zustand";

interface WorkflowStats {
  runCount: number;
  lastExecutionTime?: number;
  totalExecutionDuration: number;
  averageExecutionDuration?: number;
}

interface WorkflowStatsStore {
  stats: Record<string, WorkflowStats>;
  recordExecution: (workflowId: string, duration: number) => void;
  getStats: (workflowId: string) => WorkflowStats;
  resetStats: (workflowId: string) => void;
  clearAllStats: () => void;
}

const useWorkflowStatsStore = create<WorkflowStatsStore>((set, get) => ({
  stats: {},

  recordExecution: (workflowId: string, duration: number) => {
    set((state) => {
      const existing = state.stats[workflowId];
      const newRunCount = (existing?.runCount ?? 0) + 1;
      const newTotalDuration = (existing?.totalExecutionDuration ?? 0) + duration;

      return {
        stats: {
          ...state.stats,
          [workflowId]: {
            runCount: newRunCount,
            lastExecutionTime: Date.now(),
            totalExecutionDuration: newTotalDuration,
            averageExecutionDuration: newTotalDuration / newRunCount
          }
        }
      };
    });
  },

  getStats: (workflowId: string) => {
    return (
      get().stats[workflowId] ?? {
        runCount: 0,
        totalExecutionDuration: 0
      }
    );
  },

  resetStats: (workflowId: string) => {
    set((state) => {
      const { [workflowId]: removed, ...rest } = state.stats;
      return {
        stats: {
          ...rest,
          [workflowId]: {
            runCount: 0,
            totalExecutionDuration: 0
          }
        }
      };
    });
  },

  clearAllStats: () => {
    set({ stats: {} });
  }
}));

export default useWorkflowStatsStore;
