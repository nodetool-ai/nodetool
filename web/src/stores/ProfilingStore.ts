import { create } from "zustand";

export interface NodeProfile {
  nodeId: string;
  nodeType: string;
  title: string;
  duration: number;
  startTime: number;
  endTime: number;
  status: string;
  memoryUsed?: number;
}

export interface WorkflowProfile {
  workflowId: string;
  startTime: number;
  endTime?: number;
  totalDuration?: number;
  nodeProfiles: Record<string, NodeProfile>;
  criticalPath: string[];
  slowestNodes: string[];
  fastestNodes: string[];
  parallelGroups: string[][];
}

interface ProfilingStore {
  profiles: Record<string, WorkflowProfile>;
  isProfiling: boolean;
  currentWorkflowId: string | null;

  startProfiling: (workflowId: string) => void;
  endProfiling: (workflowId: string) => void;
  addNodeProfile: (workflowId: string, profile: NodeProfile) => void;
  getProfile: (workflowId: string) => WorkflowProfile | undefined;
  clearProfile: (workflowId: string) => void;
  getNodeDuration: (workflowId: string, nodeId: string) => number | undefined;
  getSlowestNodes: (workflowId: string, limit?: number) => NodeProfile[];
  getStatistics: (workflowId: string) => {
    totalDuration: number;
    nodeCount: number;
    averageDuration: number;
    slowestNode: NodeProfile | null;
    fastestNode: NodeProfile | null;
  } | null;
}

const useProfilingStore = create<ProfilingStore>((set, get) => ({
  profiles: {},
  isProfiling: false,
  currentWorkflowId: null,

  startProfiling: (workflowId: string) => {
    set({
      isProfiling: true,
      currentWorkflowId: workflowId,
      profiles: {
        ...get().profiles,
        [workflowId]: {
          workflowId,
          startTime: Date.now(),
          nodeProfiles: {},
          criticalPath: [],
          slowestNodes: [],
          fastestNodes: [],
          parallelGroups: [],
        },
      },
    });
  },

  endProfiling: (workflowId: string) => {
    const profile = get().profiles[workflowId];
    if (profile) {
      const endTime = Date.now();
      const totalDuration = endTime - profile.startTime;

      const nodeIds = Object.keys(profile.nodeProfiles);
      const sortedByDuration = [...nodeIds].sort(
        (a, b) => (profile.nodeProfiles[b]?.duration || 0) - (profile.nodeProfiles[a]?.duration || 0)
      );

      const slowestNodes = sortedByDuration.slice(0, 5);
      const fastestNodes = sortedByDuration.reverse().slice(0, 5);

      set({
        isProfiling: false,
        currentWorkflowId: null,
        profiles: {
          ...get().profiles,
          [workflowId]: {
            ...profile,
            endTime,
            totalDuration,
            slowestNodes,
            fastestNodes,
          },
        },
      });
    }
  },

  addNodeProfile: (workflowId: string, profile: NodeProfile) => {
    const existing = get().profiles[workflowId];
    if (existing) {
      set({
        profiles: {
          ...get().profiles,
          [workflowId]: {
            ...existing,
            nodeProfiles: {
              ...existing.nodeProfiles,
              [profile.nodeId]: profile,
            },
          },
        },
      });
    }
  },

  getProfile: (workflowId: string) => {
    return get().profiles[workflowId];
  },

  clearProfile: (workflowId: string) => {
    const profiles = get().profiles;
    delete profiles[workflowId];
    set({ profiles: { ...profiles } });
  },

  getNodeDuration: (workflowId: string, nodeId: string) => {
    const profile = get().profiles[workflowId];
    if (profile?.nodeProfiles[nodeId]) {
      return profile.nodeProfiles[nodeId].duration;
    }
    return undefined;
  },

  getSlowestNodes: (workflowId: string, limit: number = 5) => {
    const profile = get().profiles[workflowId];
    if (!profile) {
      return [];
    }

    const nodes = Object.values(profile.nodeProfiles);
    return nodes.sort((a, b) => b.duration - a.duration).slice(0, limit);
  },

  getStatistics: (workflowId: string) => {
    const profile = get().profiles[workflowId];
    if (!profile) {
      return null;
    }

    const nodes = Object.values(profile.nodeProfiles);
    if (nodes.length === 0) {
      return null;
    }

    const durations = nodes.map(n => n.duration).filter(d => d > 0);
    const totalDuration = durations.reduce((sum, d) => sum + d, 0);

    return {
      totalDuration: profile.totalDuration || 0,
      nodeCount: nodes.length,
      averageDuration: durations.length > 0 ? totalDuration / durations.length : 0,
      slowestNode: nodes.reduce((max, n) => (n.duration > (max?.duration || 0) ? n : max), null as NodeProfile | null),
      fastestNode: nodes.reduce((min, n) => (n.duration < (min?.duration || Infinity) && n.duration > 0 ? n : min), null as NodeProfile | null),
    };
  },
}));

export default useProfilingStore;
