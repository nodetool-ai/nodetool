/**
 * Tracks node execution timing for performance monitoring.
 *
 * Stores start and end timestamps for each node execution, allowing
 * the UI to display execution duration. Timings are automatically
 * cleared when a workflow completes, cancels, or fails.
 *
 * Used by:
 * - NodeExecutionTime component to display "Completed in X" badges
 * - Performance analysis and debugging
 * - Workflow optimization insights
 *
 * @example
 * ```typescript
 * import useExecutionTimeStore from './ExecutionTimeStore';
 *
 * const store = useExecutionTimeStore();
 * store.startExecution('workflow-1', 'node-1');
 * // ... later ...
 * const duration = store.getDuration('workflow-1', 'node-1');
 * console.log(`Node executed in ${duration}ms`);
 * ```
 */
import { create } from "zustand";

interface ExecutionTiming {
  startTime: number;
  endTime?: number;
}

interface ExecutionTimeStore {
  timings: Record<string, ExecutionTiming>;
  startExecution: (workflowId: string, nodeId: string) => void;
  endExecution: (workflowId: string, nodeId: string) => void;
  getTiming: (workflowId: string, nodeId: string) => ExecutionTiming | undefined;
  getDuration: (workflowId: string, nodeId: string) => number | undefined;
  clearTimings: (workflowId: string) => void;
}

const hashKey = (workflowId: string, nodeId: string) =>
  `${workflowId}:${nodeId}`;

const useExecutionTimeStore = create<ExecutionTimeStore>((set, get) => ({
  timings: {},

  startExecution: (workflowId: string, nodeId: string) => {
    const key = hashKey(workflowId, nodeId);
    set({
      timings: {
        ...get().timings,
        [key]: { startTime: Date.now() }
      }
    });
  },

  endExecution: (workflowId: string, nodeId: string) => {
    const key = hashKey(workflowId, nodeId);
    const existing = get().timings[key];
    if (existing) {
      set({
        timings: {
          ...get().timings,
          [key]: { ...existing, endTime: Date.now() }
        }
      });
    }
  },

  getTiming: (workflowId: string, nodeId: string) => {
    const key = hashKey(workflowId, nodeId);
    return get().timings[key];
  },

  getDuration: (workflowId: string, nodeId: string) => {
    const key = hashKey(workflowId, nodeId);
    const timing = get().timings[key];
    if (!timing || !timing.endTime) {
      return undefined;
    }
    return timing.endTime - timing.startTime;
  },

  clearTimings: (workflowId: string) => {
    const timings = get().timings;
    const newTimings: Record<string, ExecutionTiming> = {};
    for (const key in timings) {
      if (!key.startsWith(workflowId)) {
        newTimings[key] = timings[key];
      }
    }
    set({ timings: newTimings });
  }
}));

export default useExecutionTimeStore;
