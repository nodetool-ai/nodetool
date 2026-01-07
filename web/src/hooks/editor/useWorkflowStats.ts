import { useMemo } from "react";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";

export interface WorkflowStats {
  totalNodes: number;
  totalEdges: number;
  nodeCountByType: Record<string, number>;
  nodeCountByNamespace: Record<string, number>;
  connectionDensity: number;
  isolatedNodes: number;
  leafNodes: number;
  rootNodes: number;
  complexityScore: number;
}

export const useWorkflowStats = (
  nodes: Node<NodeData>[],
  edges: Edge[]
): WorkflowStats => {
  return useMemo(() => {
    const totalNodes = nodes.length;
    const totalEdges = edges.length;

    const nodeCountByType: Record<string, number> = {};
    const nodeCountByNamespace: Record<string, number> = {};

    let isolatedNodes = 0;
    let leafNodes = 0;
    let rootNodes = 0;

    const nodeIds = new Set(nodes.map((n) => n.id));
    const nodeTypeMap = new Map<string, string>();

    for (const node of nodes) {
      const nodeType = node.type || "unknown";
      nodeTypeMap.set(node.id, nodeType);

      nodeCountByType[nodeType] = (nodeCountByType[nodeType] || 0) + 1;

      const namespace = nodeType.split(".").slice(0, -1).join(".") || "default";
      nodeCountByNamespace[namespace] = (nodeCountByNamespace[namespace] || 0) + 1;

      const hasIncomingEdges = edges.some((e) => e.target === node.id);
      const hasOutgoingEdges = edges.some((e) => e.source === node.id);

      if (!hasIncomingEdges && !hasOutgoingEdges) {
        isolatedNodes++;
      } else if (!hasIncomingEdges && hasOutgoingEdges) {
        rootNodes++;
      } else if (hasIncomingEdges && !hasOutgoingEdges) {
        leafNodes++;
      }
    }

    const connectedNodes = new Set<string>();
    for (const edge of edges) {
      if (nodeIds.has(edge.source)) {
        connectedNodes.add(edge.source);
      }
      if (nodeIds.has(edge.target)) {
        connectedNodes.add(edge.target);
      }
    }

    const connectionDensity =
      totalNodes > 0 ? (totalEdges / (totalNodes * (totalNodes - 1))) * 100 : 0;

    const complexityScore = calculateComplexityScore(
      totalNodes,
      totalEdges,
      isolatedNodes,
      rootNodes,
      leafNodes
    );

    return {
      totalNodes,
      totalEdges,
      nodeCountByType,
      nodeCountByNamespace,
      connectionDensity: Math.round(connectionDensity * 100) / 100,
      isolatedNodes,
      leafNodes,
      rootNodes,
      complexityScore
    };
  }, [nodes, edges]);
};

function calculateComplexityScore(
  nodes: number,
  edges: number,
  isolated: number,
  roots: number,
  leaves: number
): number {
  if (nodes === 0) return 0;

  const baseScore = Math.log2(nodes + 1) * 10;
  const edgeFactor = edges > 0 ? Math.log2(edges + 1) * 5 : 0;
  const structureFactor =
    nodes > 1
      ? ((roots / nodes) * 10 + (leaves / nodes) * 5 + (isolated / nodes) * 2)
      : 0;

  return Math.round(baseScore + edgeFactor + structureFactor);
}

export const formatComplexityScore = (score: number): string => {
  if (score < 20) {
    return "Simple";
  }
  if (score < 40) {
    return "Moderate";
  }
  if (score < 60) {
    return "Complex";
  }
  if (score < 80) {
    return "Very Complex";
  }
  return "Extremely Complex";
};

export const getTopNodeTypes = (
  nodeCountByType: Record<string, number>,
  limit: number = 5
): { type: string; count: number }[] => {
  return Object.entries(nodeCountByType)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
};

export const getTopNamespaces = (
  nodeCountByNamespace: Record<string, number>,
  limit: number = 5
): { namespace: string; count: number }[] => {
  return Object.entries(nodeCountByNamespace)
    .map(([namespace, count]) => ({ namespace, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
};
