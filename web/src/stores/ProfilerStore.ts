import { create } from "zustand";

export interface NodePerformanceMetrics {
  nodeId: string;
  nodeType: string;
  nodeName: string;
  executionCount: number;
  totalDuration: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  lastDuration: number;
  memoryUsage?: number;
  status: "pending" | "running" | "completed" | "failed";
}

export interface WorkflowPerformanceProfile {
  workflowId: string;
  workflowName: string;
  totalDuration: number;
  nodeCount: number;
  completedNodes: number;
  failedNodes: number;
  startTime: number;
  endTime?: number;
  nodes: Record<string, NodePerformanceMetrics>;
  bottlenecks: string[];
  efficiency: number;
}

export interface ProfilerStore {
  profiles: Record<string, WorkflowPerformanceProfile>;
  currentProfileId: string | null;
  isProfiling: boolean;
  profileHistory: string[];

  startProfiling: (workflowId: string, workflowName: string, nodeCount: number) => void;
  stopProfiling: (workflowId: string) => void;
  recordNodeStart: (workflowId: string, nodeId: string, nodeType: string, nodeName: string) => void;
  recordNodeEnd: (workflowId: string, nodeId: string, success: boolean, duration: number) => void;
  getProfile: (workflowId: string) => WorkflowPerformanceProfile | undefined;
  getCurrentProfile: () => WorkflowPerformanceProfile | undefined;
  clearProfile: (workflowId: string) => void;
  clearAllProfiles: () => void;
  analyzeBottlenecks: (workflowId: string) => string[];
  getEfficiencyScore: (workflowId: string) => number;
}

const createEmptyMetrics = (
  nodeId: string,
  nodeType: string,
  nodeName: string
): NodePerformanceMetrics => ({
  nodeId,
  nodeType,
  nodeName,
  executionCount: 0,
  totalDuration: 0,
  averageDuration: 0,
  minDuration: Infinity,
  maxDuration: 0,
  lastDuration: 0,
  status: "pending"
});

const updateMetrics = (
  existing: NodePerformanceMetrics,
  duration: number,
  success: boolean
): NodePerformanceMetrics => {
  const newCount = existing.executionCount + 1;
  const newTotal = existing.totalDuration + duration;
  return {
    ...existing,
    executionCount: newCount,
    totalDuration: newTotal,
    averageDuration: Math.round(newTotal / newCount),
    minDuration: Math.min(existing.minDuration, duration),
    maxDuration: Math.max(existing.maxDuration, duration),
    lastDuration: duration,
    status: success ? "completed" : "failed"
  };
};

const useProfilerStore = create<ProfilerStore>((set, get) => ({
  profiles: {},
  currentProfileId: null,
  isProfiling: false,
  profileHistory: [],

  startProfiling: (workflowId: string, workflowName: string, nodeCount: number) => {
    const profile: WorkflowPerformanceProfile = {
      workflowId,
      workflowName,
      totalDuration: 0,
      nodeCount,
      completedNodes: 0,
      failedNodes: 0,
      startTime: Date.now(),
      nodes: {},
      bottlenecks: [],
      efficiency: 100
    };

    set({
      profiles: {
        ...get().profiles,
        [workflowId]: profile
      },
      currentProfileId: workflowId,
      isProfiling: true
    });
  },

  stopProfiling: (workflowId: string) => {
    const profiles = get().profiles;
    const profile = profiles[workflowId];
    if (profile) {
      const endTime = Date.now();
      const updatedProfile: WorkflowPerformanceProfile = {
        ...profile,
        endTime,
        totalDuration: endTime - profile.startTime,
        bottlenecks: get().analyzeBottlenecks(workflowId),
        efficiency: get().getEfficiencyScore(workflowId)
      };

      set({
        profiles: {
          ...profiles,
          [workflowId]: updatedProfile
        },
        currentProfileId: null,
        isProfiling: false,
        profileHistory: [...get().profileHistory, workflowId]
      });
    }
  },

  recordNodeStart: (workflowId: string, nodeId: string, nodeType: string, nodeName: string) => {
    const profiles = get().profiles;
    const profile = profiles[workflowId];
    if (!profile) return;

    if (!profile.nodes[nodeId]) {
      profile.nodes[nodeId] = createEmptyMetrics(nodeId, nodeType, nodeName);
    }

    profile.nodes[nodeId].status = "running";

    set({
      profiles: {
        ...profiles,
        [workflowId]: {
          ...profile,
          nodes: {
            ...profile.nodes,
            [nodeId]: profile.nodes[nodeId]
          }
        }
      }
    });
  },

  recordNodeEnd: (workflowId: string, nodeId: string, success: boolean, duration: number) => {
    const profiles = get().profiles;
    const profile = profiles[workflowId];
    if (!profile) return;

    const existing = profile.nodes[nodeId];
    if (existing) {
      const updated = updateMetrics(existing, duration, success);

      set({
        profiles: {
          ...profiles,
          [workflowId]: {
            ...profile,
            completedNodes: success ? profile.completedNodes + 1 : profile.completedNodes,
            failedNodes: !success ? profile.failedNodes + 1 : profile.failedNodes,
            nodes: {
              ...profile.nodes,
              [nodeId]: updated
            }
          }
        }
      });
    }
  },

  getProfile: (workflowId: string) => {
    return get().profiles[workflowId];
  },

  getCurrentProfile: () => {
    const currentId = get().currentProfileId;
    if (!currentId) return undefined;
    return get().profiles[currentId];
  },

  clearProfile: (workflowId: string) => {
    const profiles = get().profiles;
    const { [workflowId]: removed, ...remaining } = profiles;
    set({ profiles: remaining });
  },

  clearAllProfiles: () => {
    set({
      profiles: {},
      currentProfileId: null,
      isProfiling: false,
      profileHistory: []
    });
  },

  analyzeBottlenecks: (workflowId: string) => {
    const profile = get().profiles[workflowId];
    if (!profile) return [];

    const nodes = Object.values(profile.nodes);
    if (nodes.length === 0) return [];

    const totalDuration = nodes.reduce((sum, n) => sum + n.totalDuration, 0);
    if (totalDuration === 0) return [];

    const bottlenecks: string[] = [];
    const threshold = totalDuration * 0.1;

    for (const node of nodes) {
      const isInputNode = node.nodeType.startsWith("nodetool.input");
      if (node.totalDuration > threshold && !isInputNode) {
        bottlenecks.push(node.nodeId);
      }
    }

    return bottlenecks.sort((a, b) => {
      const nodeA = profile.nodes[a];
      const nodeB = profile.nodes[b];
      return (nodeB?.totalDuration || 0) - (nodeA?.totalDuration || 0);
    });
  },

  getEfficiencyScore: (workflowId: string) => {
    const profile = get().profiles[workflowId];
    if (!profile) return 0;

    const nodes = Object.values(profile.nodes);
    if (nodes.length === 0) return 100;

    const completedNodes = nodes.filter(n => n.status === "completed");
    if (completedNodes.length === 0) return 0;

    const successRate = completedNodes.length / profile.nodeCount;
    const avgDuration = completedNodes.reduce((sum, n) => sum + n.averageDuration, 0) / completedNodes.length;

    const durationScore = Math.max(0, 100 - Math.min(avgDuration / 100, 50));
    const successScore = successRate * 100;

    return Math.round((successScore * 0.7 + durationScore * 0.3));
  }
}));

export default useProfilerStore;
