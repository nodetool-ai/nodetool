import { create } from "zustand";

/**
 * Store for tracking node execution timing during workflow runs.
 * 
 * Records start and end timestamps for each node execution to calculate
 * duration. Timings are stored per workflow to allow multiple workflows
 * to track execution times independently. When a workflow completes,
 * timings can be cleared using clearTimings().
 * 
 * @example
 * ```typescript
 * // Start tracking a node execution
 * useExecutionTimeStore.getState().startExecution(workflowId, nodeId);
 * 
 * // End tracking after completion
 * useExecutionTimeStore.getState().endExecution(workflowId, nodeId);
 * 
 * // Get the duration in milliseconds
 * const duration = useExecutionTimeStore.getState().getDuration(workflowId, nodeId);
 * ```
 */
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
