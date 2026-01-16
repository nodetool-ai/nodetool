import { create } from "zustand";

export interface NodePerformanceData {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  durations: number[];
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  executionCount: number;
  lastDuration?: number;
}

export interface WorkflowPerformanceProfile {
  workflowId: string;
  workflowName: string;
  totalRuns: number;
  nodeData: Record<string, NodePerformanceData>;
  totalDuration: number;
  averageTotalDuration: number;
  bottlenecks: NodePerformanceData[];
  lastRunTimestamp: number;
}

interface PerformanceProfileStore {
  profiles: Record<string, WorkflowPerformanceProfile>;
  currentProfile: WorkflowPerformanceProfile | null;
  recordExecution: (
    workflowId: string,
    workflowName: string,
    nodeTimings: Record<string, { nodeName: string; nodeType: string; duration: number }>
  ) => void;
  getProfile: (workflowId: string) => WorkflowPerformanceProfile | undefined;
  getCurrentProfile: () => WorkflowPerformanceProfile | null;
  setCurrentProfile: (workflowId: string) => void;
  clearProfile: (workflowId: string) => void;
  clearAllProfiles: () => void;
}

const calculateNodeData = (
  existingData: NodePerformanceData | undefined,
  newDuration: number,
  nodeName: string,
  nodeType: string
): NodePerformanceData => {
  const durations = existingData
    ? [...existingData.durations, newDuration].slice(-50)
    : [newDuration];

  return {
    nodeId: existingData?.nodeId || "",
    nodeName,
    nodeType,
    durations,
    averageDuration: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
    minDuration: Math.min(...durations),
    maxDuration: Math.max(...durations),
    executionCount: (existingData?.executionCount || 0) + 1,
    lastDuration: newDuration
  };
};

const findBottlenecks = (
  nodeData: Record<string, NodePerformanceData>
): NodePerformanceData[] => {
  return Object.values(nodeData)
    .filter((node) => node.averageDuration > 0)
    .sort((a, b) => b.averageDuration - a.averageDuration)
    .slice(0, 5);
};

const calculateTotalDuration = (
  nodeTimings: Record<string, { duration: number }>
): number => {
  return Object.values(nodeTimings).reduce((sum, node) => sum + node.duration, 0);
};

const usePerformanceProfileStore = create<PerformanceProfileStore>((set, get) => ({
  profiles: {},
  currentProfile: null,

  recordExecution: (
    workflowId: string,
    workflowName: string,
    nodeTimings: Record<string, { nodeName: string; nodeType: string; duration: number }>
  ) => {
    const existingProfile = get().profiles[workflowId];
    const totalDuration = calculateTotalDuration(nodeTimings);

    const nodeData: Record<string, NodePerformanceData> = {};

    for (const [nodeId, timing] of Object.entries(nodeTimings)) {
      const existingNodeData = existingProfile?.nodeData[nodeId];
      nodeData[nodeId] = calculateNodeData(
        existingNodeData,
        timing.duration,
        timing.nodeName,
        timing.nodeType
      );
    }

    const bottlenecks = findBottlenecks(nodeData);
    const averageTotalDuration = existingProfile
      ? Math.round(
          ((existingProfile.totalRuns * existingProfile.averageTotalDuration) +
            totalDuration) /
            (existingProfile.totalRuns + 1)
        )
      : totalDuration;

    const newProfile: WorkflowPerformanceProfile = {
      workflowId,
      workflowName,
      totalRuns: (existingProfile?.totalRuns || 0) + 1,
      nodeData,
      totalDuration,
      averageTotalDuration,
      bottlenecks,
      lastRunTimestamp: Date.now()
    };

    set({
      profiles: {
        ...get().profiles,
        [workflowId]: newProfile
      }
    });
  },

  getProfile: (workflowId: string) => {
    return get().profiles[workflowId];
  },

  getCurrentProfile: () => {
    return get().currentProfile;
  },

  setCurrentProfile: (workflowId: string) => {
    const profile = get().profiles[workflowId];
    set({ currentProfile: profile || null });
  },

  clearProfile: (workflowId: string) => {
    const profiles = { ...get().profiles };
    delete profiles[workflowId];
    set({
      profiles,
      currentProfile:
        get().currentProfile?.workflowId === workflowId ? null : get().currentProfile
    });
  },

  clearAllProfiles: () => {
    set({ profiles: {}, currentProfile: null });
  }
}));

export default usePerformanceProfileStore;
