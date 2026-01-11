import { create } from "zustand";

export interface NodePerformanceMetrics {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  executionCount: number;
  totalDuration: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  lastDuration: number;
  lastExecutionTime: number;
  status: "pending" | "running" | "completed" | "error";
  errorMessage?: string;
  memoryUsage?: number;
  inputSize?: number;
  outputSize?: number;
}

export interface WorkflowPerformanceSummary {
  workflowId: string;
  totalExecutionTime: number;
  nodeCount: number;
  completedNodes: number;
  failedNodes: number;
  pendingNodes: number;
  startTime: number;
  endTime?: number;
  peakMemoryUsage?: number;
}

interface PerformanceStoreState {
  metrics: Record<string, NodePerformanceMetrics>;
  workflowSummary: WorkflowPerformanceSummary | null;
  isProfiling: boolean;
  currentWorkflowId: string | null;

  startProfiling: (workflowId: string, nodeIds: string[], nodeNames: Record<string, string>, nodeTypes: Record<string, string>) => void;
  stopProfiling: () => void;
  recordNodeStart: (nodeId: string) => void;
  recordNodeComplete: (nodeId: string, duration: number, outputSize?: number) => void;
  recordNodeError: (nodeId: string, errorMessage: string) => void;
  clearMetrics: () => void;
  getMetrics: (nodeId: string) => NodePerformanceMetrics | undefined;
  getAllMetrics: () => NodePerformanceMetrics[];
  getSlowestNodes: (limit?: number) => NodePerformanceMetrics[];
}

const createInitialNodeMetrics = (
  nodeId: string,
  nodeName: string,
  nodeType: string
): NodePerformanceMetrics => ({
  nodeId,
  nodeName,
  nodeType,
  executionCount: 0,
  totalDuration: 0,
  averageDuration: 0,
  minDuration: Infinity,
  maxDuration: 0,
  lastDuration: 0,
  lastExecutionTime: 0,
  status: "pending"
});

const usePerformanceStore = create<PerformanceStoreState>((set, get) => ({
  metrics: {},
  workflowSummary: null,
  isProfiling: false,
  currentWorkflowId: null,

  startProfiling: (workflowId, nodeIds, nodeNames, nodeTypes) => {
    const metrics: Record<string, NodePerformanceMetrics> = {};
    const now = Date.now();

    for (const nodeId of nodeIds) {
      metrics[nodeId] = createInitialNodeMetrics(
        nodeId,
        nodeNames[nodeId] || nodeId,
        nodeTypes[nodeId] || "unknown"
      );
    }

    set({
      metrics,
      workflowSummary: {
        workflowId,
        totalExecutionTime: 0,
        nodeCount: nodeIds.length,
        completedNodes: 0,
        failedNodes: 0,
        pendingNodes: nodeIds.length,
        startTime: now
      },
      isProfiling: true,
      currentWorkflowId: workflowId
    });
  },

  stopProfiling: () => {
    const { workflowSummary } = get();
    if (workflowSummary) {
      set({
        workflowSummary: {
          ...workflowSummary,
          endTime: Date.now(),
          totalExecutionTime: Date.now() - workflowSummary.startTime
        },
        isProfiling: false
      });
    }
  },

  recordNodeStart: (nodeId) => {
    const { metrics } = get();
    const existing = metrics[nodeId];
    if (existing) {
      set({
        metrics: {
          ...metrics,
          [nodeId]: {
            ...existing,
            status: "running",
            lastExecutionTime: Date.now()
          }
        }
      });

      const { workflowSummary } = get();
      if (workflowSummary) {
        set({
          workflowSummary: {
            ...workflowSummary,
            pendingNodes: workflowSummary.pendingNodes - 1
          }
        });
      }
    }
  },

  recordNodeComplete: (nodeId, duration, outputSize) => {
    const { metrics, workflowSummary } = get();
    const existing = metrics[nodeId];
    if (!existing) {
      return;
    }

    const newMetrics: NodePerformanceMetrics = {
      ...existing,
      executionCount: existing.executionCount + 1,
      totalDuration: existing.totalDuration + duration,
      averageDuration: (existing.totalDuration + duration) / (existing.executionCount + 1),
      minDuration: Math.min(existing.minDuration, duration),
      maxDuration: Math.max(existing.maxDuration, duration),
      lastDuration: duration,
      status: "completed",
      outputSize
    };

    if (existing.minDuration === Infinity) {
      newMetrics.minDuration = duration;
    }

    const newMetricsRecord = { ...metrics, [nodeId]: newMetrics };

    let newTotalExecutionTime = workflowSummary?.totalExecutionTime || 0;
    if (workflowSummary) {
      const completedNodes = Object.values(newMetricsRecord).filter(
        (m) => m.status === "completed"
      ).length;
      const failedNodes = Object.values(newMetricsRecord).filter(
        (m) => m.status === "error"
      ).length;

      newTotalExecutionTime = Date.now() - workflowSummary.startTime;

      set({
        metrics: newMetricsRecord,
        workflowSummary: {
          ...workflowSummary,
          totalExecutionTime: newTotalExecutionTime,
          completedNodes,
          failedNodes
        }
      });
    } else {
      set({ metrics: newMetricsRecord });
    }
  },

  recordNodeError: (nodeId, errorMessage) => {
    const { metrics, workflowSummary } = get();
    const existing = metrics[nodeId];
    if (!existing) {
      return;
    }

    const newMetrics: NodePerformanceMetrics = {
      ...existing,
      status: "error",
      errorMessage
    };

    const newMetricsRecord = { ...metrics, [nodeId]: newMetrics };

    if (workflowSummary) {
      const failedNodes = Object.values(newMetricsRecord).filter(
        (m) => m.status === "error"
      ).length;

      set({
        metrics: newMetricsRecord,
        workflowSummary: {
          ...workflowSummary,
          failedNodes,
          totalExecutionTime: Date.now() - workflowSummary.startTime
        }
      });
    } else {
      set({ metrics: newMetricsRecord });
    }
  },

  clearMetrics: () => {
    set({
      metrics: {},
      workflowSummary: null,
      isProfiling: false,
      currentWorkflowId: null
    });
  },

  getMetrics: (nodeId) => {
    return get().metrics[nodeId];
  },

  getAllMetrics: () => {
    return Object.values(get().metrics);
  },

  getSlowestNodes: (limit = 5) => {
    return Object.values(get().metrics)
      .filter((m) => m.executionCount > 0)
      .sort((a, b) => b.averageDuration - a.averageDuration)
      .slice(0, limit);
  }
}));

export default usePerformanceStore;
