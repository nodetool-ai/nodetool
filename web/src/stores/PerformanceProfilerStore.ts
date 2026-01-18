import { create } from "zustand";

export interface NodePerformanceMetrics {
  nodeId: string;
  nodeType: string;
  nodeName: string;
  duration: number;
  calls: number;
  avgDuration: number;
  maxDuration: number;
  minDuration: number;
  timestamp: number;
}

export interface WorkflowPerformanceProfile {
  workflowId: string;
  workflowName: string;
  totalDuration: number;
  nodeMetrics: Record<string, NodePerformanceMetrics>;
  bottlenecks: string[];
  parallelChains: string[][];
  startTime: number;
  endTime?: number;
}

export interface ProfilerState {
  profiles: Record<string, WorkflowPerformanceProfile>;
  isProfiling: boolean;
  currentWorkflowId: string | null;
  
  startProfiling: (workflowId: string, workflowName: string) => void;
  stopProfiling: () => void;
  recordNodeExecution: (
    workflowId: string,
    nodeId: string,
    nodeType: string,
    nodeName: string,
    duration: number
  ) => void;
  getProfile: (workflowId: string) => WorkflowPerformanceProfile | undefined;
  getBottlenecks: (workflowId: string) => NodePerformanceMetrics[];
  clearProfile: (workflowId: string) => void;
  clearAllProfiles: () => void;
}

const usePerformanceProfilerStore = create<ProfilerState>((set, get) => ({
  profiles: {},
  isProfiling: false,
  currentWorkflowId: null,

  startProfiling: (workflowId: string, workflowName: string) => {
    const startTime = Date.now();
    set({
      isProfiling: true,
      currentWorkflowId: workflowId,
      profiles: {
        ...get().profiles,
        [workflowId]: {
          workflowId,
          workflowName,
          totalDuration: 0,
          nodeMetrics: {},
          bottlenecks: [],
          parallelChains: [],
          startTime
        }
      }
    });
  },

  stopProfiling: () => {
    const { currentWorkflowId, profiles } = get();
    if (currentWorkflowId && profiles[currentWorkflowId]) {
      const profile = profiles[currentWorkflowId];
      const endTime = Date.now();
      
      const totalDuration = profile.startTime 
        ? endTime - profile.startTime 
        : Object.values(profile.nodeMetrics).reduce((sum, m) => sum + m.duration, 0);

      set({
        isProfiling: false,
        currentWorkflowId: null,
        profiles: {
          ...profiles,
          [currentWorkflowId]: {
            ...profile,
            totalDuration,
            endTime
          }
        }
      });
    } else {
      set({ isProfiling: false, currentWorkflowId: null });
    }
  },

  recordNodeExecution: (
    workflowId: string,
    nodeId: string,
    nodeType: string,
    nodeName: string,
    duration: number
  ) => {
    const { profiles, isProfiling, currentWorkflowId } = get();
    
    if (!isProfiling || currentWorkflowId !== workflowId) {
      return;
    }

    const profile = profiles[workflowId];
    if (!profile) {
      return;
    }

    const existingMetrics = profile.nodeMetrics[nodeId] || {
      nodeId,
      nodeType,
      nodeName,
      duration: 0,
      calls: 0,
      avgDuration: 0,
      maxDuration: 0,
      minDuration: Infinity,
      timestamp: Date.now()
    };

    const newCalls = existingMetrics.calls + 1;
    const newTotalDuration = existingMetrics.duration + duration;
    const newAvgDuration = newTotalDuration / newCalls;
    const newMaxDuration = Math.max(existingMetrics.maxDuration || 0, duration);
    const newMinDuration = Math.min(
      existingMetrics.minDuration === Infinity ? duration : existingMetrics.minDuration,
      duration
    );

    const updatedMetrics: NodePerformanceMetrics = {
      ...existingMetrics,
      duration: newTotalDuration,
      calls: newCalls,
      avgDuration: Math.round(newAvgDuration),
      maxDuration: newMaxDuration,
      minDuration: newMinDuration,
      timestamp: Date.now()
    };

    const bottleneckThreshold = profile.startTime 
      ? 0.3 * (Date.now() - profile.startTime) 
      : 5000;

    const bottlenecks = Object.values(profile.nodeMetrics)
      .filter(m => m.duration > bottleneckThreshold && m.nodeId !== nodeId)
      .map(m => m.nodeId);

    set({
      profiles: {
        ...profiles,
        [workflowId]: {
          ...profile,
          nodeMetrics: {
            ...profile.nodeMetrics,
            [nodeId]: updatedMetrics
          },
          bottlenecks
        }
      }
    });
  },

  getProfile: (workflowId: string) => {
    return get().profiles[workflowId];
  },

  getBottlenecks: (workflowId: string) => {
    const profile = get().profiles[workflowId];
    if (!profile) {
      return [];
    }
    
    const metrics = Object.values(profile.nodeMetrics);
    if (metrics.length === 0) {
      return [];
    }

    const avgDuration = metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length;
    
    return metrics
      .filter(m => m.duration > avgDuration * 1.5)
      .sort((a, b) => b.duration - a.duration);
  },

  clearProfile: (workflowId: string) => {
    const { profiles } = get();
    const newProfiles = { ...profiles };
    delete newProfiles[workflowId];
    set({ profiles: newProfiles });
  },

  clearAllProfiles: () => {
    set({ profiles: {}, isProfiling: false, currentWorkflowId: null });
  }
}));

export default usePerformanceProfilerStore;
