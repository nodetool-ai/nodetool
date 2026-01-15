import { create } from "zustand";

export interface ExecutionTiming {
  startTime: number;
  endTime?: number;
}

export interface NodePerformanceRecord {
  workflowId: string;
  nodeId: string;
  nodeType: string;
  nodeName: string;
  duration: number;
  status: "completed" | "error";
  timestamp: number;
}

export interface WorkflowPerformanceSummary {
  workflowId: string;
  totalDuration: number;
  nodeCount: number;
  completedCount: number;
  errorCount: number;
  averageDuration: number;
  slowestNode: NodePerformanceRecord | null;
  fastestNode: NodePerformanceRecord | null;
  bottlenecks: NodePerformanceRecord[];
}

export interface ExecutionTimeStore {
  timings: Record<string, ExecutionTiming>;
  history: NodePerformanceRecord[];
  startExecution: (workflowId: string, nodeId: string) => void;
  endExecution: (workflowId: string, nodeId: string, status: "completed" | "error", nodeType?: string, nodeName?: string) => void;
  getTiming: (workflowId: string, nodeId: string) => ExecutionTiming | undefined;
  getDuration: (workflowId: string, nodeId: string) => number | undefined;
  getNodeHistory: (nodeId: string) => NodePerformanceRecord[];
  getWorkflowHistory: (workflowId: string) => NodePerformanceRecord[];
  getPerformanceSummary: (workflowId: string) => WorkflowPerformanceSummary | null;
  getAggregatedStats: () => {
    totalRuns: number;
    averageDuration: number;
    totalNodesExecuted: number;
    errorRate: number;
    slowestNodes: NodePerformanceRecord[];
    frequentBottlenecks: Map<string, { count: number; avgDuration: number }>;
  };
  clearTimings: (workflowId: string) => void;
  clearHistory: () => void;
}

const hashKey = (workflowId: string, nodeId: string) =>
  `${workflowId}:${nodeId}`;

const useExecutionTimeStore = create<ExecutionTimeStore>((set, get) => ({
  timings: {},
  history: [],

  startExecution: (workflowId: string, nodeId: string) => {
    const key = hashKey(workflowId, nodeId);
    set({
      timings: {
        ...get().timings,
        [key]: { startTime: Date.now() }
      }
    });
  },

  endExecution: (workflowId: string, nodeId: string, status: "completed" | "error", nodeType?: string, nodeName?: string) => {
    const key = hashKey(workflowId, nodeId);
    const existing = get().timings[key];
    if (existing) {
      const duration = Date.now() - existing.startTime;
      const record: NodePerformanceRecord = {
        workflowId,
        nodeId,
        nodeType: nodeType || "unknown",
        nodeName: nodeName || nodeId,
        duration,
        status,
        timestamp: Date.now()
      };
      set({
        timings: {
          ...get().timings,
          [key]: { ...existing, endTime: Date.now() }
        },
        history: [...get().history, record]
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

  getNodeHistory: (nodeId: string) => {
    return get().history.filter((r) => r.nodeId === nodeId);
  },

  getWorkflowHistory: (workflowId: string) => {
    return get().history.filter((r) => r.workflowId === workflowId);
  },

  getPerformanceSummary: (workflowId: string) => {
    const workflowRecords = get().history.filter((r) => r.workflowId === workflowId);
    if (workflowRecords.length === 0) {
      return null;
    }

    const completedRecords = workflowRecords.filter((r) => r.status === "completed");
    const errorRecords = workflowRecords.filter((r) => r.status === "error");

    const sortedByDuration = [...completedRecords].sort((a, b) => b.duration - a.duration);
    const sortedByDurationAsc = [...completedRecords].sort((a, b) => a.duration - b.duration);

    const totalDuration = completedRecords.reduce((sum, r) => sum + r.duration, 0);

    const bottlenecks = sortedByDuration
      .filter((r) => r.duration > 1000)
      .slice(0, 5);

    return {
      workflowId,
      totalDuration,
      nodeCount: workflowRecords.length,
      completedCount: completedRecords.length,
      errorCount: errorRecords.length,
      averageDuration: completedRecords.length > 0 ? totalDuration / completedRecords.length : 0,
      slowestNode: sortedByDuration[0] || null,
      fastestNode: sortedByDurationAsc[0] || null,
      bottlenecks
    };
  },

  getAggregatedStats: () => {
    const history = get().history;
    const completedRecords = history.filter((r) => r.status === "completed");
    const errorRecords = history.filter((r) => r.status === "error");

    const totalDuration = completedRecords.reduce((sum, r) => sum + r.duration, 0);

    const sortedByDuration = [...completedRecords].sort((a, b) => b.duration - a.duration);
    const slowestNodes = sortedByDuration.slice(0, 10);

    const nodeStats = new Map<string, { count: number; totalDuration: number }>();
    for (const record of completedRecords) {
      const existing = nodeStats.get(record.nodeType) || { count: 0, totalDuration: 0 };
      nodeStats.set(record.nodeType, {
        count: existing.count + 1,
        totalDuration: existing.totalDuration + record.duration
      });
    }

    const frequentBottlenecks = new Map<string, { count: number; avgDuration: number }>();
    for (const [nodeType, stats] of nodeStats.entries()) {
      const avgDuration = stats.totalDuration / stats.count;
      if (avgDuration > 1000) {
        frequentBottlenecks.set(nodeType, { count: stats.count, avgDuration });
      }
    }

    return {
      totalRuns: new Set(history.map((r) => r.workflowId)).size,
      averageDuration: completedRecords.length > 0 ? totalDuration / completedRecords.length : 0,
      totalNodesExecuted: completedRecords.length,
      errorRate: history.length > 0 ? (errorRecords.length / history.length) * 100 : 0,
      slowestNodes,
      frequentBottlenecks
    };
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
  },

  clearHistory: () => {
    set({ history: [] });
  }
}));

export default useExecutionTimeStore;
