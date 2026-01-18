import { create } from "zustand";

export interface NodePerformanceData {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  duration: number;
  status: "pending" | "running" | "completed" | "error";
  executionCount: number;
  avgDuration: number;
  isBottleneck: boolean;
}

export interface WorkflowPerformanceProfile {
  workflowId: string;
  totalDuration: number;
  nodeCount: number;
  completedCount: number;
  errorCount: number;
  nodes: NodePerformanceData[];
  bottlenecks: NodePerformanceData[];
  timestamp: number;
}

interface PerformanceThreshold {
  slow: number;
  verySlow: number;
}

interface PerformanceStore {
  profiles: Record<string, WorkflowPerformanceProfile>;
  executionHistory: Record<string, number[]>;
  thresholds: PerformanceThreshold;
  analyzeWorkflow: (
    workflowId: string,
    nodeIds: string[],
    getNodeDuration: (nodeId: string) => number | undefined,
    getNodeStatus: (nodeId: string) => "pending" | "running" | "completed" | "error" | undefined,
    getNodeType: (nodeId: string) => string,
    getNodeLabel: (nodeId: string) => string
  ) => WorkflowPerformanceProfile;
  getProfile: (workflowId: string) => WorkflowPerformanceProfile | undefined;
  clearProfile: (workflowId: string) => void;
  setThresholds: (thresholds: PerformanceThreshold) => void;
  calculateBottlenecks: (nodes: NodePerformanceData[]) => NodePerformanceData[];
}

const calculateNodePerformance = (
  nodeId: string,
  duration: number | undefined,
  status: "pending" | "running" | "completed" | "error" | undefined,
  nodeType: string,
  nodeLabel: string,
  executionHistory: Map<string, number[]>,
  thresholds: PerformanceThreshold
): NodePerformanceData => {
  const history = executionHistory.get(nodeId) || [];
  const durations = duration ? [...history, duration] : history;
  executionHistory.set(nodeId, durations);

  const avgDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;

  const finalDuration = duration ?? avgDuration;

  return {
    nodeId,
    nodeType,
    nodeLabel,
    duration: finalDuration,
    status: status || "pending",
    executionCount: durations.length,
    avgDuration,
    isBottleneck: false
  };
};

const usePerformanceStore = create<PerformanceStore>((set, get) => ({
  profiles: {},
  executionHistory: {},
  thresholds: {
    slow: 2000,
    verySlow: 5000
  },

  analyzeWorkflow: (workflowId, nodeIds, getNodeDuration, getNodeStatus, getNodeType, getNodeLabel) => {
    const thresholds = get().thresholds;
    const history = get().executionHistory;
    const executionHistory = new Map<string, number[]>();

    for (const nodeId in history) {
      const durations = history[nodeId];
      executionHistory.set(nodeId, durations);
    }

    const nodes: NodePerformanceData[] = nodeIds.map((nodeId) => {
      const duration = getNodeDuration(nodeId);
      const status = getNodeStatus(nodeId);
      const nodeType = getNodeType(nodeId);
      const nodeLabel = getNodeLabel(nodeId);

      return calculateNodePerformance(
        nodeId,
        duration,
        status,
        nodeType,
        nodeLabel,
        executionHistory,
        thresholds
      );
    });

    const newHistory = { ...history };
    for (const [key, durations] of executionHistory) {
      newHistory[key] = durations;
    }
    set({ executionHistory: newHistory });

    const completedNodes = nodes.filter(n => n.status === "completed");
    const errorNodes = nodes.filter(n => n.status === "error");
    const totalDuration = completedNodes.reduce((sum, n) => sum + n.duration, 0);

    const bottlenecks = get().calculateBottlenecks(nodes);

    const profile: WorkflowPerformanceProfile = {
      workflowId,
      totalDuration,
      nodeCount: nodes.length,
      completedCount: completedNodes.length,
      errorCount: errorNodes.length,
      nodes,
      bottlenecks,
      timestamp: Date.now()
    };

    set({
      profiles: {
        ...get().profiles,
        [workflowId]: profile
      }
    });

    return profile;
  },

  getProfile: (workflowId) => {
    return get().profiles[workflowId];
  },

  clearProfile: (workflowId) => {
    const profiles = { ...get().profiles };
    const history = { ...get().executionHistory };
    delete profiles[workflowId];
    for (const key in history) {
      if (key.startsWith(workflowId + ":")) {
        delete history[key];
      }
    }
    set({ profiles, executionHistory: history });
  },

  setThresholds: (thresholds) => {
    set({ thresholds });
  },

  calculateBottlenecks: (nodes) => {
    const thresholds = get().thresholds;
    const completedNodes = nodes.filter(n => n.status === "completed");

    if (completedNodes.length === 0) {
      return [];
    }

    const durations = completedNodes.map(n => n.duration);
    const maxDuration = Math.max(...durations);
    const threshold = Math.max(thresholds.verySlow, maxDuration * 0.3);

    return completedNodes
      .map(node => ({
        ...node,
        isBottleneck: node.duration >= threshold
      }))
      .filter(n => n.isBottleneck)
      .sort((a, b) => b.duration - a.duration);
  }
}));

export default usePerformanceStore;
