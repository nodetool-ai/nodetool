/**
 * WorkflowStatsStore
 *
 * Tracks workflow statistics for the current workflow.
 * Automatically updates when nodes or edges change.
 */

import { create } from "zustand";
import { Edge, Node } from "@xyflow/react";
import { Graph } from "../stores/ApiTypes";
import {
  calculateWorkflowStats,
  WorkflowStats,
  HealthIssue,
  ComplexityFactor
} from "../utils/workflowStats";

interface WorkflowStatsState {
  stats: WorkflowStats | null;
  lastUpdated: number | null;
  isComputing: boolean;
  computeStats: (nodes: Node[], edges: Edge[]) => void;
  computeStatsFromGraph: (graph: Graph) => void;
  clearStats: () => void;
}

interface SimplifiedNode {
  id: string;
  type: string;
}

interface SimplifiedEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

const convertNodeToGraphNode = (node: Node): SimplifiedNode => ({
  id: node.id,
  type: node.type || ""
});

const convertEdgeToGraphEdge = (edge: Edge): SimplifiedEdge => ({
  id: edge.id,
  source: edge.source,
  target: edge.target,
  sourceHandle: edge.sourceHandle || null,
  targetHandle: edge.targetHandle || null
});

export const useWorkflowStatsStore = create<WorkflowStatsState>((set) => ({
  stats: null,
  lastUpdated: null,
  isComputing: false,

  computeStats: (nodes: Node[], edges: Edge[]) => {
    set({ isComputing: true });

    const simplifiedNodes = nodes.map(convertNodeToGraphNode);
    const simplifiedEdges = edges.map(convertEdgeToGraphEdge);

    const graph: Graph = {
      nodes: simplifiedNodes as Graph["nodes"],
      edges: simplifiedEdges as Graph["edges"]
    };

    const stats = calculateWorkflowStats(graph);

    set({
      stats,
      lastUpdated: Date.now(),
      isComputing: false
    });
  },

  computeStatsFromGraph: (graph: Graph) => {
    set({ isComputing: true });

    const stats = calculateWorkflowStats(graph);

    set({
      stats,
      lastUpdated: Date.now(),
      isComputing: false
    });
  },

  clearStats: () => {
    set({
      stats: null,
      lastUpdated: null
    });
  }
}));

export default useWorkflowStatsStore;
