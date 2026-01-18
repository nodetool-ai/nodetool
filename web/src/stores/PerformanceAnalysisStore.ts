import { create } from "zustand";

export interface NodePerformanceMetrics {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  duration: number;
  status: string;
  startTime: number;
  endTime: number;
  isBottleneck: boolean;
  percentageOfTotal: number;
}

export interface WorkflowPerformanceProfile {
  workflowId: string;
  workflowName: string;
  totalDuration: number;
  nodeCount: number;
  completedNodes: number;
  failedNodes: number;
  nodes: NodePerformanceMetrics[];
  bottlenecks: NodePerformanceMetrics[];
  timestamp: number;
}

interface PerformanceAnalysisStore {
  profiles: Record<string, WorkflowPerformanceProfile>;
  currentProfile: WorkflowPerformanceProfile | null;
  
  analyzeExecution: (
    workflowId: string,
    workflowName: string,
    nodeIds: string[],
    nodeNames: Record<string, string>,
    nodeTypes: Record<string, string>,
    statuses: Record<string, string>,
    timings: Record<string, { startTime: number; endTime?: number }>
  ) => WorkflowPerformanceProfile;
  
  getProfile: (workflowId: string) => WorkflowPerformanceProfile | undefined;
  setCurrentProfile: (profile: WorkflowPerformanceProfile | null) => void;
  clearProfile: (workflowId: string) => void;
}

const calculateDuration = (
  timings: Record<string, { startTime: number; endTime?: number }>,
  nodeId: string
): number => {
  const timing = timings[nodeId];
  if (!timing || !timing.endTime) {
    return 0;
  }
  return timing.endTime - timing.startTime;
};

const usePerformanceAnalysisStore = create<PerformanceAnalysisStore>((set, get) => ({
  profiles: {},
  currentProfile: null,

  analyzeExecution: (
    workflowId: string,
    workflowName: string,
    nodeIds: string[],
    nodeNames: Record<string, string>,
    nodeTypes: Record<string, string>,
    statuses: Record<string, string>,
    timings: Record<string, { startTime: number; endTime?: number }>
  ): WorkflowPerformanceProfile => {
    const nodes: NodePerformanceMetrics[] = [];
    let totalDuration = 0;
    let completedNodes = 0;
    let failedNodes = 0;

    for (const nodeId of nodeIds) {
      const duration = calculateDuration(timings, nodeId);
      const status = statuses[nodeId] || "unknown";
      
      if (duration > 0) {
        totalDuration = Math.max(totalDuration, duration);
      }
      
      if (status === "completed") {
        completedNodes++;
      } else if (status === "error") {
        failedNodes++;
      }

      nodes.push({
        nodeId,
        nodeName: nodeNames[nodeId] || nodeId,
        nodeType: nodeTypes[nodeId] || "unknown",
        duration,
        status,
        startTime: timings[nodeId]?.startTime || 0,
        endTime: timings[nodeId]?.endTime || 0,
        isBottleneck: false,
        percentageOfTotal: 0
      });
    }

    const nodesWithDuration = nodes.filter(n => n.duration > 0);
    const rankedNodes = [...nodesWithDuration].sort((a, b) => b.duration - a.duration);

    const bottlenecks: NodePerformanceMetrics[] = [];

    for (const node of nodes) {
      if (node.duration > 0) {
        node.percentageOfTotal = (node.duration / totalDuration) * 100;
        
        const rankIndex = rankedNodes.findIndex(n => n.nodeId === node.nodeId);
        if (rankIndex >= 0 && rankIndex < 3) {
          node.isBottleneck = true;
          bottlenecks.push(node);
        }
      }
    }

    const profile: WorkflowPerformanceProfile = {
      workflowId,
      workflowName,
      totalDuration,
      nodeCount: nodeIds.length,
      completedNodes,
      failedNodes,
      nodes,
      bottlenecks: bottlenecks.slice(0, 5),
      timestamp: Date.now()
    };

    set((state) => ({
      profiles: {
        ...state.profiles,
        [workflowId]: profile
      },
      currentProfile: profile
    }));

    return profile;
  },

  getProfile: (workflowId: string) => {
    return get().profiles[workflowId];
  },

  setCurrentProfile: (profile: WorkflowPerformanceProfile | null) => {
    set({ currentProfile: profile });
  },

  clearProfile: (workflowId: string) => {
    set((state) => {
      const { [workflowId]: removed, ...remainingProfiles } = state.profiles;
      return {
        profiles: remainingProfiles,
        currentProfile: state.currentProfile?.workflowId === workflowId 
          ? null 
          : state.currentProfile
      };
    });
  }
}));

export default usePerformanceAnalysisStore;
