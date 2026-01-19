import { create } from "zustand";
import useExecutionTimeStore from "./ExecutionTimeStore";

interface NodeTiming {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  duration: number;
  startTime: number;
  endTime: number;
}

interface WorkflowProfile {
  workflowId: string;
  totalDuration: number;
  nodeCount: number;
  completedCount: number;
  failedCount: number;
  nodes: NodeTiming[];
  bottlenecks: NodeTiming[];
  avgDuration: number;
  maxDuration: number;
  minDuration: number;
  timestamp: number;
}

interface WorkflowProfilerStore {
  profile: WorkflowProfile | null;
  isProfiling: boolean;
  analyzeWorkflow: (
    workflowId: string,
    nodes: Array<{ id: string; data?: { label?: string; nodeType?: string } }>
  ) => void;
  clearProfile: () => void;
  startProfiling: () => void;
  stopProfiling: () => void;
  getAllTimings: (workflowId: string) => NodeTiming[];
}

const calculatePercentile = (values: number[], percentile: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] || 0;
};

const getAllTimings = (workflowId: string): NodeTiming[] => {
  const timings = useExecutionTimeStore.getState().timings;
  const nodes: NodeTiming[] = [];

  for (const key in timings) {
    if (key.startsWith(`${workflowId}:`)) {
      const timing = timings[key];
      if (timing.endTime) {
        const [, nodeId] = key.split(`${workflowId}:`);
        nodes.push({
          nodeId,
          nodeType: "node",
          nodeLabel: nodeId,
          duration: timing.endTime - timing.startTime,
          startTime: timing.startTime,
          endTime: timing.endTime,
        });
      }
    }
  }

  return nodes;
};

const useWorkflowProfilerStore = create<WorkflowProfilerStore>((set, _get) => ({
  profile: null,
  isProfiling: false,

  startProfiling: () => set({ isProfiling: true }),

  stopProfiling: () => set({ isProfiling: false }),

  clearProfile: () => set({ profile: null, isProfiling: false }),

  analyzeWorkflow: (workflowId, nodes) => {
    const timings = getAllTimings(workflowId);

    if (timings.length === 0) {
      set({ profile: null });
      return;
    }

    const durations = timings.map((t) => t.duration);
    const totalDuration = Math.max(...timings.map((t) => t.endTime)) - Math.min(...timings.map((t) => t.startTime));

    const sortedNodes = [...timings].sort((a, b) => b.duration - a.duration);
    const bottlenecks = sortedNodes.slice(0, Math.min(5, sortedNodes.length));

    const profile: WorkflowProfile = {
      workflowId,
      totalDuration,
      nodeCount: nodes.length,
      completedCount: timings.length,
      failedCount: 0,
      nodes: timings,
      bottlenecks,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      maxDuration: Math.max(...durations),
      minDuration: Math.min(...durations),
      timestamp: Date.now(),
    };

    set({ profile, isProfiling: false });
  },

  getAllTimings,
}));

export default useWorkflowProfilerStore;
export { calculatePercentile, getAllTimings };
