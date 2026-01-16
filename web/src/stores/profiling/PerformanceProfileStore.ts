import { create } from "zustand";
import useExecutionTimeStore from "../ExecutionTimeStore";

export interface NodePerformanceData {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  duration: number;
  percentageOfTotal: number;
  isBottleneck: boolean;
}

export interface WorkflowPerformanceProfile {
  workflowId: string;
  workflowName: string;
  totalDuration: number;
  nodeCount: number;
  executedNodeCount: number;
  nodes: NodePerformanceData[];
  bottlenecks: NodePerformanceData[];
  averageNodeDuration: number;
  startTime: number;
  endTime: number;
  timestamp: number;
}

export interface PerformanceInsight {
  type: "info" | "warning" | "error";
  message: string;
  suggestion?: string;
}

interface PerformanceProfileStore {
  profiles: Record<string, WorkflowPerformanceProfile>;
  generateProfile: (
    workflowId: string,
    workflowName: string,
    nodeIds: string[],
    nodeData: Record<string, { label?: string; type?: string }>
  ) => WorkflowPerformanceProfile | null;
  getProfile: (workflowId: string) => WorkflowPerformanceProfile | null;
  clearProfile: (workflowId: string) => void;
  getInsights: (profile: WorkflowPerformanceProfile) => PerformanceInsight[];
}

const BOTTLENECK_THRESHOLD_PERCENT = 20;

const usePerformanceProfileStore = create<PerformanceProfileStore>((set, get) => ({
  profiles: {},

  generateProfile: (
    workflowId: string,
    workflowName: string,
    nodeIds: string[],
    nodeData: Record<string, { label?: string; type?: string }>
  ): WorkflowPerformanceProfile | null => {
    const executionTimeStore = useExecutionTimeStore.getState();
    const nodeTimings: NodePerformanceData[] = [];
    let totalDuration = 0;

    for (const nodeId of nodeIds) {
      const duration = executionTimeStore.getDuration(workflowId, nodeId);
      if (duration !== undefined && duration > 0) {
        const node = nodeData[nodeId] || {};
        nodeTimings.push({
          nodeId,
          nodeName: node.label || nodeId,
          nodeType: node.type || "unknown",
          duration,
          percentageOfTotal: 0,
          isBottleneck: false
        });
        totalDuration += duration;
      }
    }

    if (nodeTimings.length === 0 || totalDuration === 0) {
      return null;
    }

    for (const node of nodeTimings) {
      node.percentageOfTotal = (node.duration / totalDuration) * 100;
    }

    const sortedNodes = [...nodeTimings].sort((a, b) => b.duration - a.duration);

    const bottlenecks: NodePerformanceData[] = [];
    for (const node of sortedNodes) {
      if (node.percentageOfTotal >= BOTTLENECK_THRESHOLD_PERCENT) {
        node.isBottleneck = true;
        bottlenecks.push(node);
      } else {
        break;
      }
    }

    const startTimes = nodeTimings
      .map(n => executionTimeStore.getTiming(workflowId, n.nodeId)?.startTime)
      .filter((t): t is number => t !== undefined);
    const endTimes = nodeTimings
      .map(n => executionTimeStore.getTiming(workflowId, n.nodeId)?.endTime)
      .filter((t): t is number => t !== undefined);

    const profile: WorkflowPerformanceProfile = {
      workflowId,
      workflowName,
      totalDuration,
      nodeCount: nodeIds.length,
      executedNodeCount: nodeTimings.length,
      nodes: nodeTimings,
      bottlenecks,
      averageNodeDuration: totalDuration / nodeTimings.length,
      startTime: startTimes.length > 0 ? Math.min(...startTimes) : 0,
      endTime: endTimes.length > 0 ? Math.max(...endTimes) : 0,
      timestamp: Date.now()
    };

    set({
      profiles: {
        ...get().profiles,
        [workflowId]: profile
      }
    });

    return profile;
  },

  getProfile: (workflowId: string): WorkflowPerformanceProfile | null => {
    return get().profiles[workflowId] || null;
  },

  clearProfile: (workflowId: string): void => {
    const profiles = { ...get().profiles };
    delete profiles[workflowId];
    set({ profiles });
  },

  getInsights: (profile: WorkflowPerformanceProfile): PerformanceInsight[] => {
    const insights: PerformanceInsight[] = [];

    if (profile.bottlenecks.length > 0) {
      const topBottleneck = profile.bottlenecks[0];
      insights.push({
        type: "warning",
        message: `Performance bottleneck detected: "${topBottleneck.nodeName}" takes ${topBottleneck.percentageOfTotal.toFixed(1)}% of total execution time`,
        suggestion: `Consider optimizing "${topBottleneck.nodeName}" or using a more efficient model/configuration`
      });
    }

    if (profile.nodes.length > 5) {
      const slowNodes = profile.nodes.filter(n => n.duration > profile.averageNodeDuration * 3);
      if (slowNodes.length > 0) {
        insights.push({
          type: "info",
          message: `${slowNodes.length} node(s) are significantly slower than average`,
          suggestion: "Review slow nodes for optimization opportunities"
        });
      }
    }

    const parallelizableNodes = profile.nodes.filter(n => n.percentageOfTotal < 5 && n.duration > 500);
    if (parallelizableNodes.length >= 2) {
      insights.push({
        type: "info",
        message: "Multiple small nodes detected that could potentially run in parallel",
        suggestion: "Consider restructuring workflow to maximize parallel execution"
      });
    }

    const veryQuickNodes = profile.nodes.filter(n => n.duration < 50);
    if (veryQuickNodes.length > profile.nodes.length * 0.5) {
      insights.push({
        type: "info",
        message: "Over 50% of nodes complete very quickly (< 50ms)",
        suggestion: "These nodes may be adding overhead - consider combining operations"
      });
    }

    return insights;
  }
}));

export default usePerformanceProfileStore;
