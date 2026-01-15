import { create } from "zustand";
import { Node } from "@xyflow/react";
import { Edge } from "@xyflow/react";
import { NodeData } from "./NodeData";

interface WorkflowStatistics {
  totalNodes: number;
  totalEdges: number;
  nodeTypeCounts: Record<string, number>;
  inputNodes: number;
  outputNodes: number;
  processingNodes: number;
  connectedNodes: number;
  disconnectedNodes: number;
  longestPathEstimate: number;
  complexityScore: number;
}

interface WorkflowStatisticsStore {
  statistics: WorkflowStatistics | null;
  calculateStatistics: (nodes: Node<NodeData>[], edges: Edge[]) => void;
  clearStatistics: () => void;
}

const countNodeType = (type: string | undefined): string => {
  if (!type) {return "unknown";}
  const parts = type.split(".");
  if (parts.length >= 2) {
    return parts.slice(0, -1).join(".");
  }
  return type;
};

const calculateComplexityScore = (
  nodeTypeCounts: Record<string, number>,
  totalNodes: number,
  totalEdges: number,
  disconnectedNodes: number
): number => {
  let score = 0;

  score += totalNodes * 10;

  score += totalEdges * 5;

  const uniqueNodeTypes = Object.keys(nodeTypeCounts).length;
  score += uniqueNodeTypes * 15;

  if (disconnectedNodes > 0) {
    score -= disconnectedNodes * 10;
  }

  score = Math.max(0, Math.min(100, score));

  return Math.round(score);
};

export const useWorkflowStatisticsStore = create<WorkflowStatisticsStore>((set) => ({
  statistics: null,

  calculateStatistics: (nodes: Node<NodeData>[], edges: Edge[]) => {
    const nodeTypeCounts: Record<string, number> = {};
    let inputNodes = 0;
    let outputNodes = 0;
    let processingNodes = 0;

    const connectedNodeIds = new Set<string>();
    edges.forEach((edge) => {
      if (edge.source) {connectedNodeIds.add(edge.source);}
      if (edge.target) {connectedNodeIds.add(edge.target);}
    });

    nodes.forEach((node) => {
      const type = node.type ?? "unknown";
      const category = countNodeType(type);

      nodeTypeCounts[category] = (nodeTypeCounts[category] ?? 0) + 1;

      if (type === "workflowInput" || category === "nodetool.input") {
        inputNodes++;
      } else if (type === "workflowOutput" || category === "nodetool.output") {
        outputNodes++;
      } else {
        processingNodes++;
      }
    });

    const totalNodes = nodes.length;
    const totalEdges = edges.length;
    const connectedNodes = connectedNodeIds.size;
    const disconnectedNodes = totalNodes - connectedNodes;

    const longestPathEstimate = Math.max(inputNodes + processingNodes, totalNodes * 0.75);

    const complexityScore = calculateComplexityScore(
      nodeTypeCounts,
      totalNodes,
      totalEdges,
      disconnectedNodes
    );

    set({
      statistics: {
        totalNodes,
        totalEdges,
        nodeTypeCounts,
        inputNodes,
        outputNodes,
        processingNodes,
        connectedNodes,
        disconnectedNodes,
        longestPathEstimate: Math.round(longestPathEstimate),
        complexityScore
      }
    });
  },

  clearStatistics: () => {
    set({ statistics: null });
  }
}));

export default useWorkflowStatisticsStore;
