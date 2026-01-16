import { create } from "zustand";

export interface NodePerformanceData {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  durations: number[];
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  lastDuration: number;
  executionCount: number;
}

export interface WorkflowPerformanceProfile {
  workflowId: string;
  workflowName: string;
  totalDuration: number;
  nodeData: Record<string, NodePerformanceData>;
  bottlenecks: string[];
  timestamp: number;
  runCount: number;
}

export interface PerformanceComparison {
  fasterNodes: { nodeId: string; label: string; improvement: number }[];
  slowerNodes: { nodeId: string; label: string; regression: number }[];
  totalTimeChange: number;
  percentChange: number;
}

interface PerformanceProfilerStore {
  profiles: Record<string, WorkflowPerformanceProfile>;
  currentRunTimings: Record<string, number>;
  isProfiling: boolean;

  startProfiling: (workflowId: string) => void;
  endProfiling: (workflowId: string, workflowName: string, totalDuration: number, nodeTimings: Record<string, number>, nodeTypes: Record<string, { type: string; label: string }>) => void;
  getProfile: (workflowId: string) => WorkflowPerformanceProfile | undefined;
  getNodeStats: (workflowId: string, nodeId: string) => NodePerformanceData | undefined;
  getBottlenecks: (workflowId: string) => string[];
  compareWithPrevious: (workflowId: string, newTimings: Record<string, number>) => PerformanceComparison | null;
  clearProfile: (workflowId: string) => void;
  clearAllProfiles: () => void;
  getAllProfiles: () => WorkflowPerformanceProfile[];
}

const usePerformanceProfilerStore = create<PerformanceProfilerStore>((set, get) => ({
  profiles: {},
  currentRunTimings: {},
  isProfiling: false,

  startProfiling: (_workflowId: string) => {
    set({ isProfiling: true, currentRunTimings: {} });
  },

  endProfiling: (
    workflowId: string,
    workflowName: string,
    totalDuration: number,
    nodeTimings: Record<string, number>,
    nodeTypes: Record<string, { type: string; label: string }>
  ) => {
    const existingProfile = get().profiles[workflowId];
    const nodeData: Record<string, NodePerformanceData> = {};

    for (const [nodeId, duration] of Object.entries(nodeTimings)) {
      const nodeType = nodeTypes[nodeId]?.type || "unknown";
      const nodeLabel = nodeTypes[nodeId]?.label || nodeId;

      if (existingProfile?.nodeData[nodeId]) {
        const existing = existingProfile.nodeData[nodeId];
        const durations = [...existing.durations, duration].slice(-20);
        const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

        nodeData[nodeId] = {
          nodeId,
          nodeType,
          nodeLabel,
          durations,
          avgDuration,
          minDuration: Math.min(...durations),
          maxDuration: Math.max(...durations),
          lastDuration: duration,
          executionCount: existing.executionCount + 1
        };
      } else {
        nodeData[nodeId] = {
          nodeId,
          nodeType,
          nodeLabel,
          durations: [duration],
          avgDuration: duration,
          minDuration: duration,
          maxDuration: duration,
          lastDuration: duration,
          executionCount: 1
        };
      }
    }

    const bottlenecks = Object.values(nodeData)
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 5)
      .map((n) => n.nodeId);

    const newProfile: WorkflowPerformanceProfile = {
      workflowId,
      workflowName,
      totalDuration,
      nodeData,
      bottlenecks,
      timestamp: Date.now(),
      runCount: (existingProfile?.runCount || 0) + 1
    };

    set({
      profiles: { ...get().profiles, [workflowId]: newProfile },
      isProfiling: false,
      currentRunTimings: nodeTimings
    });
  },

  getProfile: (workflowId: string) => {
    return get().profiles[workflowId];
  },

  getNodeStats: (workflowId: string, nodeId: string) => {
    const profile = get().profiles[workflowId];
    return profile?.nodeData[nodeId];
  },

  getBottlenecks: (workflowId: string) => {
    const profile = get().profiles[workflowId];
    return profile?.bottlenecks || [];
  },

  compareWithPrevious: (workflowId: string, newTimings: Record<string, number>): PerformanceComparison | null => {
    const profile = get().profiles[workflowId];
    if (!profile || profile.runCount < 1) {
      return null;
    }

    const fasterNodes: { nodeId: string; label: string; improvement: number }[] = [];
    const slowerNodes: { nodeId: string; label: string; regression: number }[] = [];

    let totalOldTime = 0;
    let totalNewTime = 0;

    for (const [nodeId, newDuration] of Object.entries(newTimings)) {
      const oldAvg = profile.nodeData[nodeId]?.avgDuration;
      if (oldAvg) {
        totalOldTime += oldAvg;
        totalNewTime += newDuration;

        const change = newDuration - oldAvg;
        const percentChange = (change / oldAvg) * 100;

        if (change < -50) {
          fasterNodes.push({
            nodeId,
            label: profile.nodeData[nodeId]?.nodeLabel || nodeId,
            improvement: Math.abs(percentChange)
          });
        } else if (change > 50) {
          slowerNodes.push({
            nodeId,
            label: profile.nodeData[nodeId]?.nodeLabel || nodeId,
            regression: percentChange
          });
        }
      }
    }

    const totalTimeChange = totalNewTime - totalOldTime;
    const percentChange = totalOldTime > 0 ? (totalTimeChange / totalOldTime) * 100 : 0;

    return {
      fasterNodes: fasterNodes.sort((a, b) => b.improvement - a.improvement),
      slowerNodes: slowerNodes.sort((a, b) => a.regression - b.regression),
      totalTimeChange,
      percentChange
    };
  },

  clearProfile: (workflowId: string) => {
    const profiles = { ...get().profiles };
    delete profiles[workflowId];
    set({ profiles });
  },

  clearAllProfiles: () => {
    set({ profiles: {} });
  },

  getAllProfiles: () => {
    return Object.values(get().profiles).sort((a, b) => b.timestamp - a.timestamp);
  }
}));

export default usePerformanceProfilerStore;
