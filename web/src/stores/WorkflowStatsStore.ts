import { create } from "zustand";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "./NodeData";

interface WorkflowStats {
  nodeCount: number;
  edgeCount: number;
  nodeCountByType: Record<string, number>;
  nodeCountByCategory: Record<string, number>;
  inputNodeCount: number;
  outputNodeCount: number;
  processingNodeCount: number;
  groupNodeCount: number;
  selectedNodeCount: number;
  selectedEdgeCount: number;
  complexityScore: number;
}

interface WorkflowStatsStore {
  stats: Record<string, WorkflowStats>;
  updateStats: (
    workflowId: string,
    nodes: Node<NodeData>[],
    edges: Edge[],
    selectedNodeIds: string[],
    selectedEdgeIds: string[]
  ) => void;
  getStats: (workflowId: string) => WorkflowStats;
  clearStats: (workflowId: string) => void;
}

const calculateComplexityScore = (
  nodeCount: number,
  edgeCount: number,
  groupNodeCount: number
): number => {
  const baseComplexity = nodeCount * 1;
  const edgeComplexity = edgeCount * 0.5;
  const groupPenalty = groupNodeCount * 2;
  return Math.round(baseComplexity + edgeComplexity + groupPenalty);
};

const getNodeCategory = (nodeType: string): string => {
  if (nodeType === "inputNode" || nodeType?.startsWith("nodetool.input.")) {
    return "Input";
  }
  if (nodeType === "outputNode" || nodeType?.startsWith("nodetool.output.")) {
    return "Output";
  }
  if (nodeType === "groupNode" || nodeType === "loopNode") {
    return "Group";
  }
  return "Processing";
};

const useWorkflowStatsStore = create<WorkflowStatsStore>((set, get) => ({
  stats: {},

  updateStats: (
    workflowId: string,
    nodes: Node<NodeData>[],
    edges: Edge[],
    selectedNodeIds: string[],
    selectedEdgeIds: string[]
  ) => {
    const nodeCount = nodes.length;
    const edgeCount = edges.length;

    const nodeCountByType: Record<string, number> = {};
    const nodeCountByCategory: Record<string, number> = {
      Input: 0,
      Output: 0,
      Processing: 0,
      Group: 0
    };

    let inputNodeCount = 0;
    let outputNodeCount = 0;
    let processingNodeCount = 0;
    let groupNodeCount = 0;

    for (const node of nodes) {
      const nodeType = node.type || "unknown";
      nodeCountByType[nodeType] = (nodeCountByType[nodeType] || 0) + 1;

      const category = getNodeCategory(nodeType);
      nodeCountByCategory[category] = (nodeCountByCategory[category] || 0) + 1;

      switch (category) {
        case "Input":
          inputNodeCount++;
          break;
        case "Output":
          outputNodeCount++;
          break;
        case "Group":
          groupNodeCount++;
          break;
        case "Processing":
          processingNodeCount++;
          break;
      }
    }

    const selectedNodeCount = selectedNodeIds.length;
    const selectedEdgeCount = selectedEdgeIds.length;

    const complexityScore = calculateComplexityScore(
      nodeCount,
      edgeCount,
      groupNodeCount
    );

    const newStats: WorkflowStats = {
      nodeCount,
      edgeCount,
      nodeCountByType,
      nodeCountByCategory,
      inputNodeCount,
      outputNodeCount,
      processingNodeCount,
      groupNodeCount,
      selectedNodeCount,
      selectedEdgeCount,
      complexityScore
    };

    set({
      stats: {
        ...get().stats,
        [workflowId]: newStats
      }
    });
  },

  getStats: (workflowId: string) => {
    return (
      get().stats[workflowId] || {
        nodeCount: 0,
        edgeCount: 0,
        nodeCountByType: {},
        nodeCountByCategory: {
          Input: 0,
          Output: 0,
          Processing: 0,
          Group: 0
        },
        inputNodeCount: 0,
        outputNodeCount: 0,
        processingNodeCount: 0,
        groupNodeCount: 0,
        selectedNodeCount: 0,
        selectedEdgeCount: 0,
        complexityScore: 0
      }
    );
  },

  clearStats: (workflowId: string) => {
    const newStats = { ...get().stats };
    delete newStats[workflowId];
    set({ stats: newStats });
  }
}));

export default useWorkflowStatsStore;
export type { WorkflowStats };
