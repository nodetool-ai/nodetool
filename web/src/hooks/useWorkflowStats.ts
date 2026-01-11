/**
 * useWorkflowStats hook computes real-time statistics from the workflow graph.
 */
import { useCallback, useMemo } from "react";
import { useNodes } from "../contexts/NodeContext";
import { useWorkflowStatsStore, WorkflowStats } from "../stores/WorkflowStatsStore";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";

interface ExtendedNodeData extends NodeData {
  nodeType?: string;
}

interface UseWorkflowStatsReturn {
  stats: WorkflowStats;
  refreshStats: () => void;
}

export const useWorkflowStats = (): UseWorkflowStatsReturn => {
  const nodes = useNodes((state) => state.nodes);
  const edges = useNodes((state) => state.edges);
  const setStats = useWorkflowStatsStore((state) => state.setStats);

  const computeStats = useCallback((): WorkflowStats => {
    const nodeCount = nodes.length;
    const edgeCount = edges.length;

    const nodeTypeBreakdown: Record<string, number> = {};
    let inputNodeCount = 0;
    let outputNodeCount = 0;
    let processingNodeCount = 0;
    let groupNodeCount = 0;
    let commentNodeCount = 0;

    const connectedNodeIds = new Set<string>();
    const disconnectedNodeIds = new Set<string>();

    edges.forEach((edge) => {
      if (edge.source) {
        connectedNodeIds.add(edge.source);
      }
      if (edge.target) {
        connectedNodeIds.add(edge.target);
      }
    });

    nodes.forEach((node) => {
      const nodeType = node.type || "unknown";

      nodeTypeBreakdown[nodeType] = (nodeTypeBreakdown[nodeType] || 0) + 1;

      if (nodeType === "group") {
        groupNodeCount++;
      } else if (nodeType === "comment") {
        commentNodeCount++;
      } else {
        const nodeTypeStr = (node.data as ExtendedNodeData).nodeType || "";
        if (nodeTypeStr.includes(".input.")) {
          inputNodeCount++;
        } else if (nodeTypeStr.includes(".output.")) {
          outputNodeCount++;
        } else {
          processingNodeCount++;
        }
      }
    });

    nodes.forEach((node) => {
      if (!connectedNodeIds.has(node.id)) {
        disconnectedNodeIds.add(node.id);
      }
    });

    const connectedNodeCount = connectedNodeIds.size;
    const disconnectedNodeCount = disconnectedNodeIds.size;

    const maxDepth = computeMaxDepth(nodes, edges);

    const complexityScore = computeComplexityScore(
      nodeCount,
      edgeCount,
      maxDepth,
      processingNodeCount
    );

    return {
      nodeCount,
      edgeCount,
      nodeTypeBreakdown,
      connectedNodeCount,
      disconnectedNodeCount,
      inputNodeCount,
      outputNodeCount,
      processingNodeCount,
      groupNodeCount,
      commentNodeCount,
      complexityScore,
      maxDepth,
      lastUpdated: Date.now()
    };
  }, [nodes, edges]);

  const stats = useMemo(() => {
    return computeStats();
  }, [computeStats]);

  const refreshStats = useCallback(() => {
    const newStats = computeStats();
    setStats(newStats);
  }, [computeStats, setStats]);

  return { stats, refreshStats };
};

export function computeMaxDepth(nodes: Node<NodeData>[], edges: Edge[]): number {
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  nodes.forEach((node) => {
    adjacency.set(node.id, []);
    inDegree.set(node.id, 0);
  });

  edges.forEach((edge) => {
    if (edge.source && edge.target) {
      const sourceAdj = adjacency.get(edge.source);
      if (sourceAdj) {
        sourceAdj.push(edge.target);
      }
      const targetInDegree = inDegree.get(edge.target);
      if (targetInDegree !== undefined) {
        inDegree.set(edge.target, targetInDegree + 1);
      }
    }
  });

  const queue: string[] = [];
  inDegree.forEach((degree, nodeId) => {
    if (degree === 0) {
      queue.push(nodeId);
    }
  });

  const distances = new Map<string, number>();
  nodes.forEach((node) => {
    distances.set(node.id, 0);
  });

  let maxDistance = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) {
      continue;
    }

    const currentDistance = distances.get(current) || 0;
    maxDistance = Math.max(maxDistance, currentDistance);

    const neighbors = adjacency.get(current);
    if (neighbors) {
      neighbors.forEach((neighbor) => {
        const neighborDistance = distances.get(neighbor) || 0;
        distances.set(neighbor, Math.max(neighborDistance, currentDistance + 1));

        const neighborInDegree = inDegree.get(neighbor);
        if (neighborInDegree !== undefined) {
          inDegree.set(neighbor, neighborInDegree - 1);
          if (neighborInDegree - 1 === 0) {
            queue.push(neighbor);
          }
        }
      });
    }
  }

  return maxDistance;
}

export function computeComplexityScore(
  nodeCount: number,
  edgeCount: number,
  maxDepth: number,
  processingNodeCount: number
): number {
  const nodeWeight = 1;
  const edgeWeight = 2;
  const depthWeight = 3;
  const processingWeight = 1.5;

  const score =
    nodeCount * nodeWeight +
    edgeCount * edgeWeight +
    maxDepth * depthWeight +
    processingNodeCount * processingWeight;

  return Math.round(score);
}
