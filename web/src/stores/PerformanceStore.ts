import { create } from "zustand";
import useExecutionTimeStore from "./ExecutionTimeStore";
import { Node } from "@xyflow/react";

export interface PerformanceMetrics {
  totalDuration: number;
  nodeCount: number;
  bottlenecks: BottleneckNode[];
  parallelizableChains: string[][];
  estimatedSpeedup: number;
}

export interface BottleneckNode {
  nodeId: string;
  nodeType: string;
  duration: number;
  percentage: number;
  label: string;
}

interface PerformanceStoreState {
  metrics: PerformanceMetrics | null;
  isAnalyzing: boolean;
  analyzePerformance: (workflowId: string, nodes: Node[]) => void;
  clearMetrics: () => void;
}

const calculateParallelChains = (
  nodes: Node[],
  edges: { source: string; target: string }[]
): string[][] => {
  const inDegree: Record<string, number> = {};
  const adj: Record<string, string[]> = {};
  const allNodes = new Set(nodes.map((n) => n.id));

  nodes.forEach((n) => {
    inDegree[n.id] = 0;
    adj[n.id] = [];
  });

  edges.forEach((e) => {
    if (allNodes.has(e.source) && allNodes.has(e.target)) {
      adj[e.source].push(e.target);
      inDegree[e.target]++;
    }
  });

  const roots = nodes.filter((n) => inDegree[n.id] === 0).map((n) => n.id);
  const visited = new Set<string>();
  const chains: string[][] = [];

  const dfs = (nodeId: string, path: string[]) => {
    visited.add(nodeId);
    path.push(nodeId);

    const children = adj[nodeId];
    if (!children || children.length === 0) {
      chains.push([...path]);
    } else {
      children.forEach((child) => {
        if (!visited.has(child)) {
          dfs(child, [...path]);
        }
      });
    }
  };

  roots.forEach((root) => {
    if (!visited.has(root)) {
      dfs(root, []);
    }
  });

  return chains;
};

const usePerformanceStore = create<PerformanceStoreState>((set) => ({
  metrics: null,
  isAnalyzing: false,

  analyzePerformance: (workflowId: string, nodes: Node[]) => {
    set({ isAnalyzing: true });
    void useExecutionTimeStore.getState().timings;

    const workflowTimings: Record<string, number> = {};
    const nodeMap: Record<string, Node> = {};

    nodes.forEach((node) => {
      nodeMap[node.id] = node;
      const duration = useExecutionTimeStore.getState().getDuration(workflowId, node.id);
      if (duration !== undefined) {
        workflowTimings[node.id] = duration;
      }
    });

    const durations = Object.values(workflowTimings);
    const totalDuration = durations.reduce((sum, d) => sum + d, 0);

    const bottlenecks: BottleneckNode[] = Object.entries(workflowTimings)
      .map(([nodeId, duration]) => ({
        nodeId,
        nodeType: nodeMap[nodeId]?.type || "unknown",
        duration,
        percentage: totalDuration > 0 ? (duration / totalDuration) * 100 : 0,
        label: String(nodeMap[nodeId]?.data?.label || nodeMap[nodeId]?.id || nodeId),
      }))
      .sort((a, b) => b.duration - a.duration);

    const bottleneckThreshold = 0.5;
    const significantBottlenecks = bottlenecks.filter(
      (b) => b.percentage > bottleneckThreshold * 100
    );

    const edges: { source: string; target: string }[] = [];
    nodes.forEach((node) => {
      const handleId = node.data?.handleId as string | undefined;
      if (handleId) {
        edges.push({ source: handleId, target: node.id });
      }
    });

    const parallelChains = calculateParallelChains(nodes, edges);

    let maxChainDuration = 0;
    parallelChains.forEach((chain) => {
      const chainDuration = chain.reduce((sum, nodeId) => {
        return sum + (workflowTimings[nodeId] || 0);
      }, 0);
      if (chainDuration > maxChainDuration) {
        maxChainDuration = chainDuration;
      }
    });

    const estimatedSpeedup =
      totalDuration > 0 && maxChainDuration > 0 ? totalDuration / maxChainDuration : 1;

    set({
      metrics: {
        totalDuration,
        nodeCount: nodes.length,
        bottlenecks: significantBottlenecks,
        parallelizableChains: parallelChains,
        estimatedSpeedup,
      },
      isAnalyzing: false,
    });
  },

  clearMetrics: () => {
    set({ metrics: null });
  },
}));

export default usePerformanceStore;
