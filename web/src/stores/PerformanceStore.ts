import { create } from "zustand";

export interface NodePerformanceMetrics {
  nodeId: string;
  nodeType: string;
  nodeTitle: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: "pending" | "running" | "completed" | "error";
  memoryUsage?: number;
  inputSize?: number;
  outputSize?: number;
  retryCount: number;
  errorMessage?: string;
}

export interface WorkflowPerformanceSummary {
  workflowId: string;
  workflowName: string;
  totalDuration: number;
  nodeCount: number;
  completedCount: number;
  errorCount: number;
  totalRetries: number;
  averageNodeDuration: number;
  slowestNode: NodePerformanceMetrics | null;
  fastestNode: NodePerformanceMetrics | null;
  bottlenecks: NodePerformanceMetrics[];
  startTime: number;
  endTime?: number;
}

export interface PerformanceHistoryEntry {
  timestamp: number;
  workflowId: string;
  workflowName: string;
  duration: number;
  nodeCount: number;
  status: "success" | "partial" | "error";
}

type PerformanceStore = {
  nodeMetrics: Record<string, Record<string, NodePerformanceMetrics>>;
  workflowSummaries: Record<string, WorkflowPerformanceSummary>;
  performanceHistory: PerformanceHistoryEntry[];
  isRecording: boolean;
  currentWorkflowId: string | null;

  startRecording: (workflowId: string, workflowName: string, nodeIds: string[], nodeTypes: Record<string, string>, nodeTitles: Record<string, string>) => void;
  stopRecording: () => void;
  recordNodeStart: (workflowId: string, nodeId: string) => void;
  recordNodeEnd: (workflowId: string, nodeId: string, success: boolean, error?: string) => void;
  recordNodeProgress: (workflowId: string, nodeId: string, progress: number) => void;
  updateNodeMetrics: (workflowId: string, nodeId: string, metrics: Partial<NodePerformanceMetrics>) => void;
  getNodeMetrics: (workflowId: string, nodeId: string) => NodePerformanceMetrics | undefined;
  getWorkflowSummary: (workflowId: string) => WorkflowPerformanceSummary | undefined;
  getPerformanceHistory: (limit?: number) => PerformanceHistoryEntry[];
  clearWorkflowPerformance: (workflowId: string) => void;
  clearAllPerformance: () => void;
  setRecording: (recording: boolean) => void;
};

const usePerformanceStore = create<PerformanceStore>((set, get) => ({
  nodeMetrics: {},
  workflowSummaries: {},
  performanceHistory: [],
  isRecording: false,
  currentWorkflowId: null,

  startRecording: (
    workflowId: string,
    workflowName: string,
    nodeIds: string[],
    nodeTypes: Record<string, string>,
    nodeTitles: Record<string, string>
  ) => {
    const startTime = Date.now();
    const nodeMetrics: Record<string, NodePerformanceMetrics> = {};

    nodeIds.forEach((nodeId) => {
      nodeMetrics[nodeId] = {
        nodeId,
        nodeType: nodeTypes[nodeId] || "unknown",
        nodeTitle: nodeTitles[nodeId] || nodeId,
        startTime,
        status: "pending",
        retryCount: 0,
      };
    });

    set((state) => ({
      nodeMetrics: {
        ...state.nodeMetrics,
        [workflowId]: nodeMetrics,
      },
      isRecording: true,
      currentWorkflowId: workflowId,
    }));
  },

  stopRecording: () => {
    const { currentWorkflowId, nodeMetrics } = get();
    if (!currentWorkflowId) {
      return;
    }

    const metrics = nodeMetrics[currentWorkflowId];
    if (!metrics) {
      set({ isRecording: false, currentWorkflowId: null });
      return;
    }

    const endTime = Date.now();
    const nodeValues = Object.values(metrics);
    const durations = nodeValues
      .filter((n) => n.duration)
      .map((n) => n.duration as number);

    const completedNodes = nodeValues.filter((n) => n.status === "completed");
    const errorNodes = nodeValues.filter((n) => n.status === "error");

    const totalDuration = Math.max(
      0,
      ...nodeValues.map((n) => (n.endTime || endTime) - n.startTime)
    );

    const summary: WorkflowPerformanceSummary = {
      workflowId: currentWorkflowId,
      workflowName: nodeValues[0]?.nodeTitle || "Unknown",
      totalDuration,
      nodeCount: nodeValues.length,
      completedCount: completedNodes.length,
      errorCount: errorNodes.length,
      totalRetries: nodeValues.reduce((sum, n) => sum + n.retryCount, 0),
      averageNodeDuration:
        durations.length > 0
          ? durations.reduce((a, b) => a + b, 0) / durations.length
          : 0,
      slowestNode:
        durations.length > 0
          ? nodeValues.find(
              (n) => n.duration === Math.max(...durations)
            ) || null
          : null,
      fastestNode:
        durations.length > 0
          ? nodeValues.find(
              (n) => n.duration === Math.min(...durations)
            ) || null
          : null,
      bottlenecks: nodeValues
        .filter((n) => n.duration && n.duration > 0)
        .sort((a, b) => (b.duration || 0) - (a.duration || 0))
        .slice(0, 3),
      startTime: nodeValues[0]?.startTime || endTime,
      endTime,
    };

    const historyEntry: PerformanceHistoryEntry = {
      timestamp: endTime,
      workflowId: currentWorkflowId,
      workflowName: summary.workflowName,
      duration: totalDuration,
      nodeCount: nodeValues.length,
      status: errorNodes.length > 0 ? "error" : "success",
    };

    set((state) => ({
      workflowSummaries: {
        ...state.workflowSummaries,
        [currentWorkflowId]: summary,
      },
      performanceHistory: [historyEntry, ...state.performanceHistory].slice(
        0,
        100
      ),
      isRecording: false,
      currentWorkflowId: null,
    }));
  },

  recordNodeStart: (workflowId: string, nodeId: string) => {
    const startTime = Date.now();
    set((state) => {
      const workflowMetrics = state.nodeMetrics[workflowId];
      if (!workflowMetrics) {
        return state;
      }

      const existing = workflowMetrics[nodeId];
      if (existing && existing.status === "running") {
        return state;
      }

      return {
        nodeMetrics: {
          ...state.nodeMetrics,
          [workflowId]: {
            ...workflowMetrics,
            [nodeId]: {
              ...workflowMetrics[nodeId],
              startTime,
              status: "running",
              retryCount:
                (workflowMetrics[nodeId]?.retryCount || 0) +
                (existing?.status === "error" ? 1 : 0),
            },
          },
        },
      };
    });
  },

  recordNodeEnd: (workflowId: string, nodeId: string, success: boolean, error?: string) => {
    const endTime = Date.now();
    set((state) => {
      const workflowMetrics = state.nodeMetrics[workflowId];
      if (!workflowMetrics) {
        return state;
      }

      const node = workflowMetrics[nodeId];
      if (!node) {
        return state;
      }

      const duration = endTime - node.startTime;

      return {
        nodeMetrics: {
          ...state.nodeMetrics,
          [workflowId]: {
            ...workflowMetrics,
            [nodeId]: {
              ...node,
              endTime,
              duration,
              status: success ? "completed" : "error",
              errorMessage: error,
            },
          },
        },
      };
    });
  },

  recordNodeProgress: (workflowId: string, nodeId: string, _progress: number) => {
    set((state) => {
      const workflowMetrics = state.nodeMetrics[workflowId];
      if (!workflowMetrics) {
        return state;
      }

      return {
        nodeMetrics: {
          ...state.nodeMetrics,
          [workflowId]: {
            ...workflowMetrics,
            [nodeId]: {
              ...workflowMetrics[nodeId],
            },
          },
        },
      };
    });
  },

  updateNodeMetrics: (workflowId: string, nodeId: string, metrics: Partial<NodePerformanceMetrics>) => {
    set((state) => {
      const workflowMetrics = state.nodeMetrics[workflowId];
      if (!workflowMetrics) {
        return state;
      }

      return {
        nodeMetrics: {
          ...state.nodeMetrics,
          [workflowId]: {
            ...workflowMetrics,
            [nodeId]: {
              ...workflowMetrics[nodeId],
              ...metrics,
            },
          },
        },
      };
    });
  },

  getNodeMetrics: (workflowId: string, nodeId: string) => {
    const state = get();
    return state.nodeMetrics[workflowId]?.[nodeId];
  },

  getWorkflowSummary: (workflowId: string) => {
    const state = get();
    return state.workflowSummaries[workflowId];
  },

  getPerformanceHistory: (limit?: number) => {
    const state = get();
    return limit
      ? state.performanceHistory.slice(0, limit)
      : state.performanceHistory;
  },

  clearWorkflowPerformance: (workflowId: string) => {
    set((state) => {
      const { [workflowId]: _, ...remainingMetrics } = state.nodeMetrics;
      const { [workflowId]: __, ...remainingSummaries } = state.workflowSummaries;
      return {
        nodeMetrics: remainingMetrics,
        workflowSummaries: remainingSummaries,
      };
    });
  },

  clearAllPerformance: () => {
    set({
      nodeMetrics: {},
      workflowSummaries: {},
      performanceHistory: [],
      isRecording: false,
      currentWorkflowId: null,
    });
  },

  setRecording: (recording: boolean) => {
    set({ isRecording: recording });
  },
}));

export default usePerformanceStore;
