/**
 * WorkflowProfilerStore
 *
 * Manages performance profiling data for workflow executions.
 * Tracks node execution times, identifies bottlenecks, and provides
 * analytics for workflow performance optimization.
 */

import { create } from "zustand";

export interface NodeProfile {
  nodeId: string;
  nodeType: string;
  nodeName: string;
  duration: number;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startTime?: number;
  endTime?: number;
  outputSize?: number;
  memoryUsage?: number;
}

export interface WorkflowProfile {
  workflowId: string;
  workflowName: string;
  startedAt: number;
  completedAt?: number;
  totalDuration: number;
  nodes: NodeProfile[];
  bottlenecks: NodeProfile[];
  averageNodeDuration: number;
  parallelizableNodes: string[];
}

interface WorkflowProfilerState {
  currentProfile: WorkflowProfile | null;
  historicalProfiles: WorkflowProfile[];

  startProfiling: (workflowId: string, workflowName: string, nodes: any[]) => void;
  updateNodeStatus: (nodeId: string, status: NodeProfile["status"]) => void;
  recordNodeCompletion: (nodeId: string, outputSize?: number) => void;
  finishProfiling: () => void;
  cancelProfiling: () => void;
  clearCurrentProfile: () => void;
  getCurrentProfile: () => WorkflowProfile | null;
  getHistoricalProfiles: () => WorkflowProfile[];
  clearHistory: () => void;
}

const calculateBottlenecks = (nodes: NodeProfile[], thresholdPercent: number = 20): NodeProfile[] => {
  const totalDuration = nodes.reduce((sum, n) => sum + n.duration, 0);
  if (totalDuration === 0) {return [];}

  return nodes
    .filter(n => (n.duration / totalDuration) * 100 >= thresholdPercent)
    .sort((a, b) => b.duration - a.duration);
};

const detectParallelizableNodes = (nodes: NodeProfile[]): string[] => {
  const parallelizable: string[] = [];

  for (const node of nodes) {
    const hasDependencies = nodes.some(n =>
      n.duration > 100 && n.nodeId !== node.nodeId
    );

    if (node.duration < 500 && hasDependencies) {
      parallelizable.push(node.nodeId);
    }
  }

  return parallelizable;
};

export const useWorkflowProfilerStore = create<WorkflowProfilerState>((set, get) => ({
  currentProfile: null,
  historicalProfiles: [],

  startProfiling: (workflowId: string, workflowName: string, nodes: any[]) => {
    const nodeProfiles: NodeProfile[] = nodes.map(node => ({
      nodeId: node.id,
      nodeType: node.type,
      nodeName: (node.data as Record<string, unknown>)?.title as string || node.type.split(".").pop() || "Node",
      duration: 0,
      status: "pending",
      startTime: undefined,
      endTime: undefined
    }));

    set({
      currentProfile: {
        workflowId,
        workflowName,
        startedAt: Date.now(),
        completedAt: undefined,
        totalDuration: 0,
        nodes: nodeProfiles,
        bottlenecks: [],
        averageNodeDuration: 0,
        parallelizableNodes: []
      }
    });
  },

  updateNodeStatus: (nodeId: string, status: NodeProfile["status"]) => {
    const { currentProfile } = get();
    if (!currentProfile) {return;}

    const updatedNodes = currentProfile.nodes.map(node => {
      if (node.nodeId === nodeId) {
        const updated = { ...node, status };
        if (status === "running" && !node.startTime) {
          updated.startTime = Date.now();
        }
        if (status === "completed" || status === "failed") {
          updated.endTime = Date.now();
          if (node.startTime) {
            updated.duration = (updated.endTime - node.startTime);
          }
        }
        return updated;
      }
      return node;
    });

    set({
      currentProfile: {
        ...currentProfile,
        nodes: updatedNodes
      }
    });
  },

  recordNodeCompletion: (nodeId: string, outputSize?: number) => {
    const { currentProfile } = get();
    if (!currentProfile) {return;}

    const updatedNodes = currentProfile.nodes.map(node => {
      if (node.nodeId === nodeId) {
        return { ...node, outputSize, status: "completed" as const };
      }
      return node;
    });

    set({
      currentProfile: {
        ...currentProfile,
        nodes: updatedNodes
      }
    });
  },

  finishProfiling: () => {
    const { currentProfile } = get();
    if (!currentProfile) {return;}

    const completedAt = Date.now();
    const totalDuration = completedAt - currentProfile.startedAt;

    const finalNodes = currentProfile.nodes.map(node => {
      if (node.status === "pending" || node.status === "running") {
        return { ...node, status: "skipped" as const };
      }
      return node;
    });

    const bottlenecks = calculateBottlenecks(finalNodes);
    const parallelizableNodes = detectParallelizableNodes(finalNodes);
    const completedNodes = finalNodes.filter(n => n.status === "completed");
    const averageNodeDuration = completedNodes.length > 0
      ? completedNodes.reduce((sum, n) => sum + n.duration, 0) / completedNodes.length
      : 0;

    const finalProfile: WorkflowProfile = {
      ...currentProfile,
      completedAt,
      totalDuration,
      nodes: finalNodes,
      bottlenecks,
      averageNodeDuration,
      parallelizableNodes
    };

    set(state => ({
      currentProfile: null,
      historicalProfiles: [finalProfile, ...state.historicalProfiles].slice(0, 20)
    }));
  },

  cancelProfiling: () => {
    const { currentProfile } = get();
    if (!currentProfile) {return;}

    const cancelledNodes = currentProfile.nodes.map(node => {
      if (node.status === "pending" || node.status === "running") {
        return { ...node, status: "skipped" as const };
      }
      return node;
    });

    const cancelledProfile: WorkflowProfile = {
      ...currentProfile,
      completedAt: Date.now(),
      totalDuration: Date.now() - currentProfile.startedAt,
      nodes: cancelledNodes,
      bottlenecks: [],
      averageNodeDuration: 0,
      parallelizableNodes: []
    };

    set(state => ({
      currentProfile: null,
      historicalProfiles: [cancelledProfile, ...state.historicalProfiles].slice(0, 20)
    }));
  },

  clearCurrentProfile: () => {
    set({ currentProfile: null });
  },

  getCurrentProfile: () => {
    return get().currentProfile;
  },

  getHistoricalProfiles: () => {
    return get().historicalProfiles;
  },

  clearHistory: () => {
    set({ historicalProfiles: [] });
  }
}));

export default useWorkflowProfilerStore;
