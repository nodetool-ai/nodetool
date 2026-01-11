import { useMemo } from "react";
import { useNodes } from "../contexts/NodeContext";
import { Node, Edge } from "@xyflow/react";

interface WorkflowStats {
  nodeCount: number;
  edgeCount: number;
  selectedNodeCount: number;
  connectedNodeCount: number;
  disconnectedNodeCount: number;
  connectionDensity: number;
  nodeTypeBreakdown: Record<string, number>;
  inputNodeCount: number;
  outputNodeCount: number;
  processingNodeCount: number;
  groupNodeCount: number;
  averageNodesPerGroup: number;
  maxConnectionDepth: number;
}

interface UseWorkflowStatsReturn {
  stats: WorkflowStats;
  isLoading: boolean;
}

export const useWorkflowStats = (): UseWorkflowStatsReturn => {
  const { nodes, edges } = useNodes((state) => ({
    nodes: state.nodes,
    edges: (state as { edges: Edge[] }).edges
  }), (prev, next) => prev.nodes === next.nodes && prev.edges === next.edges);

  const stats = useMemo((): WorkflowStats => {
    const nodeCount = nodes.length;
    const edgeCount = edges.length;
    const selectedNodes = nodes.filter((node) => node.selected);
    const selectedNodeCount = selectedNodes.length;

    const nodeIdsWithInputs = new Set<string>();
    const nodeIdsWithOutputs = new Set<string>();

    edges.forEach((edge) => {
      nodeIdsWithInputs.add(edge.target);
      nodeIdsWithOutputs.add(edge.source);
    });

    const connectedNodeCount = nodeIdsWithInputs.size;
    const disconnectedNodeCount = nodeCount - connectedNodeCount;

    const connectionDensity =
      nodeCount > 0 ? (edgeCount / (nodeCount * (nodeCount - 1))) * 100 : 0;

    const nodeTypeBreakdown: Record<string, number> = {};
    let inputNodeCount = 0;
    let outputNodeCount = 0;
    let processingNodeCount = 0;
    let groupNodeCount = 0;

    nodes.forEach((node) => {
      const nodeType = node.type || "unknown";
      nodeTypeBreakdown[nodeType] = (nodeTypeBreakdown[nodeType] || 0) + 1;

      if (nodeType === "group") {
        groupNodeCount++;
      } else if (nodeType?.includes("input")) {
        inputNodeCount++;
      } else if (nodeType?.includes("output")) {
        outputNodeCount++;
      } else {
        processingNodeCount++;
      }
    });

    const groupNodes = nodes.filter((node) => node.type === "group");
    let totalNodesInGroups = 0;
    let maxNodesInGroup = 0;

    groupNodes.forEach((groupNode) => {
      const nodesInGroup = nodes.filter(
        (node) => node.parentId === groupNode.id
      ).length;
      totalNodesInGroups += nodesInGroup;
      if (nodesInGroup > maxNodesInGroup) {
        maxNodesInGroup = nodesInGroup;
      }
    });

    const averageNodesPerGroup =
      groupNodeCount > 0 ? totalNodesInGroups / groupNodeCount : 0;

    const maxConnectionDepth = calculateMaxConnectionDepth(nodes, edges);

    return {
      nodeCount,
      edgeCount,
      selectedNodeCount,
      connectedNodeCount,
      disconnectedNodeCount,
      connectionDensity: Math.round(connectionDensity * 100) / 100,
      nodeTypeBreakdown,
      inputNodeCount,
      outputNodeCount,
      processingNodeCount,
      groupNodeCount,
      averageNodesPerGroup: Math.round(averageNodesPerGroup * 100) / 100,
      maxConnectionDepth,
    };
  }, [nodes, edges]);

  return {
    stats,
    isLoading: false,
  };
};

function calculateMaxConnectionDepth(nodes: Node[], edges: Edge[]): number {
  const adjacencyList: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};
  const nodeIds = new Set(nodes.map((n) => n.id));

  nodes.forEach((node) => {
    adjacencyList[node.id] = [];
    inDegree[node.id] = 0;
  });

  edges.forEach((edge) => {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      adjacencyList[edge.source].push(edge.target);
      inDegree[edge.target] = (inDegree[edge.target] || 0) + 1;
    }
  });

  const rootNodes = nodes.filter((node) => inDegree[node.id] === 0);

  const calculateDepth = (nodeId: string, memo: Map<string, number>): number => {
    if (memo.has(nodeId)) {
      return memo.get(nodeId)!;
    }

    const children = adjacencyList[nodeId];
    if (children.length === 0) {
      memo.set(nodeId, 1);
      return 1;
    }

    const maxChildDepth = Math.max(
      ...children.map((childId) => calculateDepth(childId, memo))
    );
    const depth = maxChildDepth + 1;
    memo.set(nodeId, depth);
    return depth;
  };

  const memo = new Map<string, number>();
  let maxDepth = 0;

  rootNodes.forEach((rootNode) => {
    const depth = calculateDepth(rootNode.id, memo);
    if (depth > maxDepth) {
      maxDepth = depth;
    }
  });

  if (maxDepth === 0 && nodes.length > 0) {
    return 1;
  }

  return maxDepth;
}

export default useWorkflowStats;
