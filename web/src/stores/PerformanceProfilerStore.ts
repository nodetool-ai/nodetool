import { create } from "zustand";
import useExecutionTimeStore from "./ExecutionTimeStore";
import useStatusStore from "./StatusStore";

interface NodePerformanceData {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  duration: number;
  status: string;
  startTime: number;
  endTime: number;
}

interface PerformanceProfile {
  workflowId: string;
  totalDuration: number;
  nodeCount: number;
  completedNodes: number;
  failedNodes: number;
  averageNodeDuration: number;
  maxNodeDuration: number;
  minNodeDuration: number;
  bottleneckNodes: NodePerformanceData[];
  nodes: NodePerformanceData[];
  timestamp: number;
}

interface PerformanceProfilerStore {
  profiles: Record<string, PerformanceProfile>;
  getProfile: (workflowId: string, nodeIds: string[], nodeData: Record<string, { name: string; type: string }>) => PerformanceProfile | null;
  clearProfile: (workflowId: string) => void;
  getBottlenecks: (workflowId: string, thresholdPercent: number) => NodePerformanceData[];
}

const calculateProfile = (
  workflowId: string,
  nodeIds: string[],
  nodeData: Record<string, { name: string; type: string }>
): PerformanceProfile | null => {
  const getDuration = useExecutionTimeStore.getState().getDuration;
  const getTiming = useExecutionTimeStore.getState().getTiming;
  const statuses = useStatusStore.getState().statuses;

  const nodes: NodePerformanceData[] = [];
  let totalDuration = 0;
  let completedCount = 0;
  let failedCount = 0;
  const durations: number[] = [];

  for (const nodeId of nodeIds) {
    const duration = getDuration(workflowId, nodeId);
    const status = statuses[`${workflowId}:${nodeId}`] || "unknown";
    const timing = getTiming(workflowId, nodeId);
    const data = nodeData[nodeId] || { name: nodeId, type: "unknown" };

    if (duration !== undefined) {
      nodes.push({
        nodeId,
        nodeName: data.name,
        nodeType: data.type,
        duration,
        status,
        startTime: timing?.startTime || 0,
        endTime: timing?.endTime || 0
      });
      totalDuration += duration;
      durations.push(duration);

      if (status === "completed") {
        completedCount++;
      } else if (status === "error") {
        failedCount++;
      }
    }
  }

  if (nodes.length === 0) {
    return null;
  }

  const averageNodeDuration = totalDuration / nodes.length;
  const maxNodeDuration = Math.max(...durations);
  const minNodeDuration = Math.min(...durations);

  const bottleneckNodes = nodes
    .filter(n => n.duration > averageNodeDuration * 2 && n.status === "completed")
    .sort((a, b) => b.duration - a.duration);

  return {
    workflowId,
    totalDuration,
    nodeCount: nodes.length,
    completedNodes: completedCount,
    failedNodes: failedCount,
    averageNodeDuration,
    maxNodeDuration,
    minNodeDuration,
    bottleneckNodes,
    nodes: nodes.sort((a, b) => b.duration - a.duration),
    timestamp: Date.now()
  };
};

const usePerformanceProfilerStore = create<PerformanceProfilerStore>((set, get) => ({
  profiles: {},

  getProfile: (workflowId: string, nodeIds: string[], nodeData: Record<string, { name: string; type: string }>) => {
    const profile = calculateProfile(workflowId, nodeIds, nodeData);

    if (profile) {
      set({
        profiles: {
          ...get().profiles,
          [workflowId]: profile
        }
      });
    }

    return profile;
  },

  clearProfile: (workflowId: string) => {
    const profiles = get().profiles;
    delete profiles[workflowId];
    set({ profiles });
  },

  getBottlenecks: (workflowId: string, thresholdPercent: number = 50) => {
    const profile = get().profiles[workflowId];
    if (!profile) {
      return [];
    }

    const threshold = profile.totalDuration * (thresholdPercent / 100);
    return profile.nodes.filter(node => node.duration >= threshold && node.status === "completed");
  }
}));

export default usePerformanceProfilerStore;

export type { PerformanceProfile, NodePerformanceData };
