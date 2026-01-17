/**
 * Profiler Store
 *
 * Tracks workflow execution performance metrics including:
 * - Node execution times
 * - Overall workflow duration
 * - Memory usage estimates
 * - Parallel vs sequential execution analysis
 */

import { create } from "zustand";

export interface NodeProfile {
  nodeId: string;
  nodeType: string;
  nodeName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: "pending" | "running" | "completed" | "failed";
  memoryEstimate?: number;
}

export interface WorkflowProfile {
  workflowId: string;
  jobId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  nodes: Record<string, NodeProfile>;
  totalNodes: number;
  completedNodes: number;
  failedNodes: number;
  maxParallelism: number;
  actualParallelism: number;
  efficiency: number;
}

interface ProfilerStore {
  currentProfile: WorkflowProfile | null;
  profiles: WorkflowProfile[];
  isProfiling: boolean;

  startProfiling: (workflowId: string, jobId: string, nodeCount: number) => void;
  endProfiling: () => void;
  recordNodeStart: (nodeId: string, nodeType: string, nodeName: string) => void;
  recordNodeEnd: (nodeId: string, success: boolean, memoryEstimate?: number) => void;
  getCurrentProfile: () => WorkflowProfile | null;
  getNodeDurations: () => Array<{ nodeId: string; duration: number; nodeType: string }>;
  clearCurrentProfile: () => void;
  clearAllProfiles: () => void;
}

const useProfilerStore = create<ProfilerStore>((set, get) => ({
  currentProfile: null,
  profiles: [],
  isProfiling: false,

  startProfiling: (workflowId: string, jobId: string, nodeCount: number) => {
    const startTime = Date.now();
    set({
      currentProfile: {
        workflowId,
        jobId,
        startTime,
        nodes: {},
        totalNodes: nodeCount,
        completedNodes: 0,
        failedNodes: 0,
        maxParallelism: nodeCount,
        actualParallelism: 1,
        efficiency: 0
      },
      isProfiling: true
    });
  },

  endProfiling: () => {
    const { currentProfile } = get();
    if (currentProfile) {
      const endTime = Date.now();
      const duration = endTime - currentProfile.startTime;

      const completedDurations = Object.values(currentProfile.nodes)
        .filter(n => n.duration !== undefined)
        .map(n => n.duration as number);

      const totalNodeTime = completedDurations.reduce((sum, d) => sum + d, 0);
      const efficiency = duration > 0 ? Math.min(1, totalNodeTime / (duration * Math.max(1, currentProfile.actualParallelism))) : 0;

      const profile: WorkflowProfile = {
        ...currentProfile,
        endTime,
        duration,
        actualParallelism: currentProfile.completedNodes > 0
          ? totalNodeTime / duration
          : 1,
        efficiency
      };

      set({
        currentProfile: null,
        profiles: [...get().profiles, profile],
        isProfiling: false
      });
    }
  },

  recordNodeStart: (nodeId: string, nodeType: string, nodeName: string) => {
    const { currentProfile } = get();
    if (currentProfile) {
      const startTime = Date.now();
      const newNodes = { ...currentProfile.nodes };
      newNodes[nodeId] = {
        nodeId,
        nodeType,
        nodeName,
        startTime,
        status: "running"
      };

      set({
        currentProfile: {
          ...currentProfile,
          nodes: newNodes
        }
      });
    }
  },

  recordNodeEnd: (nodeId: string, success: boolean, memoryEstimate?: number) => {
    const { currentProfile } = get();
    if (currentProfile && currentProfile.nodes[nodeId]) {
      const endTime = Date.now();
      const node = currentProfile.nodes[nodeId];
      const duration = endTime - node.startTime;

      const newNodes = { ...currentProfile.nodes };
      newNodes[nodeId] = {
        ...node,
        endTime,
        duration,
        status: success ? "completed" : "failed",
        memoryEstimate
      };

      const completedNodes = Object.values(newNodes).filter(n => n.status === "completed").length;
      const failedNodes = Object.values(newNodes).filter(n => n.status === "failed").length;

      set({
        currentProfile: {
          ...currentProfile,
          nodes: newNodes,
          completedNodes,
          failedNodes
        }
      });
    }
  },

  getCurrentProfile: () => {
    return get().currentProfile;
  },

  getNodeDurations: () => {
    const { currentProfile } = get();
    if (!currentProfile) return [];

    return Object.values(currentProfile.nodes)
      .filter(n => n.duration !== undefined)
      .map(n => ({
        nodeId: n.nodeId,
        duration: n.duration as number,
        nodeType: n.nodeType
      }))
      .sort((a, b) => b.duration - a.duration);
  },

  clearCurrentProfile: () => {
    set({ currentProfile: null, isProfiling: false });
  },

  clearAllProfiles: () => {
    set({ currentProfile: null, profiles: [], isProfiling: false });
  }
}));

export default useProfilerStore;
