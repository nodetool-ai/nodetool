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
import { nodeKey, type NodeKey } from "./nodeKey";

/**
 * Clock used to stamp start/end timestamps. Defaults to wall-clock time.
 *
 * Deterministic replays (the demo engine) override this so timings come from
 * the recorded event timeline instead of `Date.now()`. Without that, a replay
 * that applies a node's start and end events in the same synchronous pass
 * stamps both from wall-clock time microseconds apart, producing a tiny,
 * frame-dependent duration that visibly wiggles the "Completed in" badge.
 */
let nowFn: () => number = () => Date.now();

/** Override the timing clock (e.g. deterministic replay). */
export function setExecutionClock(fn: () => number): void {
  nowFn = fn;
}

/** Restore the default wall-clock timing clock. */
export function resetExecutionClock(): void {
  nowFn = () => Date.now();
}

interface ExecutionTiming {
  startTime: number;
  endTime?: number;
}

interface ExecutionTimeStore {
  timings: Record<NodeKey, ExecutionTiming>;
  startExecution: (workflowId: string, jobId: string, nodeId: string) => void;
  endExecution: (workflowId: string, jobId: string, nodeId: string) => void;
  getTiming: (
    workflowId: string,
    jobId: string,
    nodeId: string
  ) => ExecutionTiming | undefined;
  getDuration: (
    workflowId: string,
    jobId: string,
    nodeId: string
  ) => number | undefined;
  clearTimings: (workflowId: string) => void;
}

const useExecutionTimeStore = create<ExecutionTimeStore>((set, get) => ({
  timings: {},

  startExecution: (workflowId: string, jobId: string, nodeId: string) => {
    const key = nodeKey(workflowId, jobId, nodeId);
    set((state) => ({
      timings: {
        ...state.timings,
        [key]: { startTime: nowFn() }
      }
    }));
  },

  endExecution: (workflowId: string, jobId: string, nodeId: string) => {
    const key = nodeKey(workflowId, jobId, nodeId);
    set((state) => {
      const existing = state.timings[key];
      if (existing) {
        return {
          timings: {
            ...state.timings,
            [key]: { ...existing, endTime: nowFn() }
          }
        };
      }
      return state;
    });
  },

  getTiming: (workflowId: string, jobId: string, nodeId: string) => {
    const key = nodeKey(workflowId, jobId, nodeId);
    return get().timings[key];
  },

  getDuration: (workflowId: string, jobId: string, nodeId: string) => {
    const key = nodeKey(workflowId, jobId, nodeId);
    const timing = get().timings[key];
    if (!timing || !timing.endTime) {
      return undefined;
    }
    return timing.endTime - timing.startTime;
  },

  clearTimings: (workflowId: string) => {
    set((state) => {
      const prefix = `${workflowId}:`;
      const newTimings: Record<NodeKey, ExecutionTiming> = {};
      for (const key in state.timings) {
        if (!key.startsWith(prefix)) {
          newTimings[key as NodeKey] = state.timings[key as NodeKey];
        }
      }
      return { timings: newTimings };
    });
  }
}));

export default useExecutionTimeStore;
