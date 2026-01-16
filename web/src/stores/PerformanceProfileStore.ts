import { create } from "zustand";

export interface NodeProfile {
  nodeId: string;
  nodeType: string;
  nodeName: string;
  duration: number;
  startTime: number;
  endTime: number;
  status: string;
  memory?: number;
  peakMemory?: number;
}

export interface WorkflowProfile {
  workflowId: string;
  workflowName: string;
  totalDuration: number;
  nodeCount: number;
  executedNodes: number;
  nodes: NodeProfile[];
  bottlenecks: NodeProfile[];
  timestamp: number;
  status: "running" | "completed" | "error" | "cancelled";
}

export interface PerformanceInsights {
  totalDuration: number;
  averageNodeDuration: number;
  slowestNode: NodeProfile | null;
  fastestNode: NodeProfile | null;
  parallelizableNodes: string[];
  recommendations: string[];
}

interface PerformanceProfileStore {
  profiles: Record<string, WorkflowProfile>;
  currentProfile: WorkflowProfile | null;
  insights: PerformanceInsights | null;

  startProfile: (workflowId: string, workflowName: string) => void;
  endProfile: (workflowId: string) => void;
  updateNodeProfile: (
    workflowId: string,
    nodeId: string,
    nodeType: string,
    nodeName: string,
    duration: number,
    status: string
  ) => void;
  getProfile: (workflowId: string) => WorkflowProfile | undefined;
  getInsights: (workflowId: string) => PerformanceInsights;
  clearProfile: (workflowId: string) => void;
  setCurrentProfile: (profile: WorkflowProfile | null) => void;
}

const usePerformanceProfileStore = create<PerformanceProfileStore>((set, get) => ({
  profiles: {},
  currentProfile: null,
  insights: null,

  startProfile: (workflowId: string, workflowName: string) => {
    const profile: WorkflowProfile = {
      workflowId,
      workflowName,
      totalDuration: 0,
      nodeCount: 0,
      executedNodes: 0,
      nodes: [],
      bottlenecks: [],
      timestamp: Date.now(),
      status: "running"
    };
    set({
      profiles: { ...get().profiles, [workflowId]: profile },
      currentProfile: profile
    });
  },

  endProfile: (workflowId: string) => {
    const profile = get().profiles[workflowId];
    if (profile) {
      const updatedProfile = {
        ...profile,
        status: "completed" as const,
        totalDuration: profile.nodes.reduce((sum, n) => sum + n.duration, 0)
      };
      set({
        profiles: { ...get().profiles, [workflowId]: updatedProfile },
        currentProfile: updatedProfile,
        insights: get().getInsights(workflowId)
      });
    }
  },

  updateNodeProfile: (
    workflowId: string,
    nodeId: string,
    nodeType: string,
    nodeName: string,
    duration: number,
    status: string
  ) => {
    const profile = get().profiles[workflowId];
    if (!profile) {return;}

    const nodeProfile: NodeProfile = {
      nodeId,
      nodeType,
      nodeName,
      duration,
      startTime: Date.now() - duration,
      endTime: Date.now(),
      status
    };

    const existingIndex = profile.nodes.findIndex((n) => n.nodeId === nodeId);
    const updatedNodes = existingIndex >= 0
      ? profile.nodes.map((n, i) => (i === existingIndex ? nodeProfile : n))
      : [...profile.nodes, nodeProfile];

    const sortedNodes = [...updatedNodes].sort((a, b) => b.duration - a.duration);
    const bottlenecks = sortedNodes.slice(0, Math.min(5, sortedNodes.length));

    const updatedProfile = {
      ...profile,
      nodes: updatedNodes,
      executedNodes: updatedNodes.length,
      bottlenecks,
      totalDuration: updatedNodes.reduce((sum, n) => sum + n.duration, 0)
    };

    set({
      profiles: { ...get().profiles, [workflowId]: updatedProfile },
      currentProfile: updatedProfile
    });
  },

  getProfile: (workflowId: string) => {
    return get().profiles[workflowId];
  },

  getInsights: (workflowId: string) => {
    const profile = get().profiles[workflowId];
    if (!profile || profile.nodes.length === 0) {
      return {
        totalDuration: 0,
        averageNodeDuration: 0,
        slowestNode: null,
        fastestNode: null,
        parallelizableNodes: [],
        recommendations: ["Run a workflow to see performance insights."]
      };
    }

    const nodes = profile.nodes;
    const durations = nodes.map((n) => n.duration);
    const totalDuration = durations.reduce((sum, d) => sum + d, 0);
    const averageNodeDuration = totalDuration / nodes.length;
    const slowestNode = nodes.reduce((max, n) => (n.duration > max.duration ? n : max), nodes[0]);
    const fastestNode = nodes.reduce((min, n) => (n.duration < min.duration ? n : min), nodes[0]);

    const parallelizableNodes: string[] = [];
    const recommendations: string[] = [];

    if (slowestNode && slowestNode.duration > averageNodeDuration * 3) {
      recommendations.push(
        `"${slowestNode.nodeName}" is a bottleneck (${formatDuration(slowestNode.duration)}). Consider optimizing or using a faster model.`
      );
    }

    if (nodes.length > 5) {
      recommendations.push(
        "Consider breaking this workflow into smaller parallel steps where possible."
      );
    }

    const modelNodes = nodes.filter((n) => n.nodeType.includes("model") || n.nodeType.includes("llm"));
    if (modelNodes.length > 0) {
      const avgModelDuration = modelNodes.reduce((sum, n) => sum + n.duration, 0) / modelNodes.length;
      if (avgModelDuration > totalDuration * 0.7) {
        recommendations.push(
          "Model inference dominates execution time. Consider using a smaller model or caching results."
        );
      }
    }

    const successfulNodes = nodes.filter((n) => n.status === "completed");
    if (successfulNodes.length > 0) {
      const fastNodes = successfulNodes.filter((n) => n.duration < 100);
      if (fastNodes.length > successfulNodes.length * 0.5) {
        recommendations.push(
          "Many nodes execute quickly. Consider batching small operations for better efficiency."
        );
      }
    }

    return {
      totalDuration,
      averageNodeDuration,
      slowestNode,
      fastestNode,
      parallelizableNodes,
      recommendations
    };
  },

  clearProfile: (workflowId: string) => {
    const profiles = get().profiles;
    delete profiles[workflowId];
    set({ profiles });
  },

  setCurrentProfile: (profile: WorkflowProfile | null) => {
    set({ currentProfile: profile });
  }
}));

const formatDuration = (ms: number): string => {
  if (ms < 1000) {return `${Math.round(ms)}ms`;}
  if (ms < 60000) {return `${(ms / 1000).toFixed(1)}s`;}
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
};

export default usePerformanceProfileStore;
