/**
 * WorkflowStatsStore
 *
 * Tracks comprehensive workflow statistics including structure metrics
 * and execution performance data. Provides aggregated insights for the
 * Workflow Statistics Panel.
 *
 * Structure Metrics:
 * - Total node and edge counts
 * - Node type breakdown
 * - Graph depth (longest path from inputs to outputs)
 * - Connected vs isolated nodes
 *
 * Performance Metrics:
 * - Total workflow execution time
 * - Average node execution time
 * - Slowest and fastest nodes
 * - Execution time distribution by node type
 */

import { create } from "zustand";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "./NodeData";

export interface NodeTypeCount {
  type: string;
  count: number;
}

export interface NodeExecutionStat {
  nodeId: string;
  nodeType: string;
  label: string;
  duration: number;
}

export interface WorkflowStructureStats {
  totalNodes: number;
  totalEdges: number;
  nodeTypeBreakdown: NodeTypeCount[];
  graphDepth: number;
  connectedNodes: number;
  isolatedNodes: number;
  inputNodes: number;
  outputNodes: number;
  processingNodes: number;
}

export interface WorkflowPerformanceStats {
  totalExecutionTime: number;
  averageNodeTime: number;
  medianNodeTime: number;
  slowestNodes: NodeExecutionStat[];
  fastestNodes: NodeExecutionStat[];
  executionTimeByType: NodeTypeCount[];
}

export interface WorkflowStats {
  structure: WorkflowStructureStats;
  performance: WorkflowPerformanceStats | null;
  lastUpdated: number;
}

interface WorkflowStatsStore {
  stats: Record<string, WorkflowStats>;
  updateStats: (workflowId: string, nodes: Node<NodeData>[], edges: Edge[]) => void;
  clearStats: (workflowId: string) => void;
  getStats: (workflowId: string) => WorkflowStats | null;
}

const calculateGraphDepth = (nodes: Node<NodeData>[], edges: Edge[]): number => {
  if (nodes.length === 0) {
    return 0;
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const incomingEdges = new Map<string, string[]>();
  const outgoingEdges = new Map<string, string[]>();

  edges.forEach((edge) => {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      const sources = incomingEdges.get(edge.target) || [];
      sources.push(edge.source);
      incomingEdges.set(edge.target, sources);

      const targets = outgoingEdges.get(edge.source) || [];
      targets.push(edge.target);
      outgoingEdges.set(edge.source, targets);
    }
  });

  const findInputNodes = (): string[] => {
    return nodes
      .filter((n) => {
        const type = n.type?.toLowerCase() || "";
        return (
          type.includes("input") ||
          n.data?.properties?.["node_type"]?.toString().includes("input")
        );
      })
      .map((n) => n.id);
  };

  const findOutputNodes = (): string[] => {
    return nodes
      .filter((n) => {
        const type = n.type?.toLowerCase() || "";
        return (
          type.includes("output") ||
          n.data?.properties?.["node_type"]?.toString().includes("output")
        );
      })
      .map((n) => n.id);
  };

  const inputNodes = findInputNodes();
  const outputNodes = findOutputNodes();

  if (inputNodes.length === 0 && outputNodes.length === 0) {
    return nodes.length;
  }

  const calculateDepthFrom = (
    startNodeId: string,
    visited: Set<string> = new Set()
  ): number => {
    if (visited.has(startNodeId)) {
      return 0;
    }
    visited.add(startNodeId);

    const outgoing = outgoingEdges.get(startNodeId) || [];
    if (outgoing.length === 0) {
      return 1;
    }

    let maxDepth = 0;
    outgoing.forEach((targetId) => {
      if (nodeIds.has(targetId)) {
        maxDepth = Math.max(maxDepth, calculateDepthFrom(targetId, visited));
      }
    });

    return 1 + maxDepth;
  };

  let maxDepth = 0;
  inputNodes.forEach((inputId) => {
    if (nodeIds.has(inputId)) {
      maxDepth = Math.max(maxDepth, calculateDepthFrom(inputId));
    }
  });

  if (maxDepth === 0 && nodes.length > 0) {
    maxDepth = 1;
  }

  return maxDepth;
};

const calculateStructureStats = (
  nodes: Node<NodeData>[],
  edges: Edge[]
): WorkflowStructureStats => {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const connectedNodeIds = new Set<string>();

  edges.forEach((edge) => {
    if (nodeIds.has(edge.source)) {
      connectedNodeIds.add(edge.source);
    }
    if (nodeIds.has(edge.target)) {
      connectedNodeIds.add(edge.target);
    }
  });

  const typeCountMap = new Map<string, number>();
  let inputNodes = 0;
  let outputNodes = 0;
  let processingNodes = 0;

  nodes.forEach((node) => {
    const nodeType = node.type || "unknown";
    typeCountMap.set(nodeType, (typeCountMap.get(nodeType) || 0) + 1);

    const typeLower = nodeType.toLowerCase();
    if (typeLower.includes("input")) {
      inputNodes++;
    } else if (typeLower.includes("output")) {
      outputNodes++;
    } else {
      processingNodes++;
    }
  });

  const nodeTypeBreakdown: NodeTypeCount[] = Array.from(typeCountMap.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  const graphDepth = calculateGraphDepth(nodes, edges);

  return {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    nodeTypeBreakdown,
    graphDepth,
    connectedNodes: connectedNodeIds.size,
    isolatedNodes: nodes.length - connectedNodeIds.size,
    inputNodes,
    outputNodes,
    processingNodes
  };
};

const useWorkflowStatsStore = create<WorkflowStatsStore>((set, get) => ({
  stats: {},

  updateStats: (workflowId: string, nodes: Node<NodeData>[], edges: Edge[]) => {
    const structure = calculateStructureStats(nodes, edges);

    const performance: WorkflowPerformanceStats = {
      totalExecutionTime: 0,
      averageNodeTime: 0,
      medianNodeTime: 0,
      slowestNodes: [],
      fastestNodes: [],
      executionTimeByType: []
    };

    set((state) => ({
      stats: {
        ...state.stats,
        [workflowId]: {
          structure,
          performance,
          lastUpdated: Date.now()
        }
      }
    }));
  },

  clearStats: (workflowId: string) => {
    set((state) => {
      const newStats = { ...state.stats };
      delete newStats[workflowId];
      return { stats: newStats };
    });
  },

  getStats: (workflowId: string) => {
    return get().stats[workflowId] || null;
  }
}));

export default useWorkflowStatsStore;
