/**
 * useWorkflowStatistics calculates comprehensive statistics about a workflow.
 *
 * This hook analyzes the workflow graph to provide insights including:
 * - Node counts by category (input, output, processing, group)
 * - Connection statistics (total edges, connectivity density)
 * - Workflow complexity metrics (depth, branching factor, cyclomatic complexity)
 * - Node type distribution
 * - Graph health metrics (orphan nodes, cycles)
 *
 * @returns An object containing various workflow statistics
 *
 * @example
 * ```tsx
 * const stats = useWorkflowStatistics();
 * console.log(`Total nodes: ${stats.totalNodes}`);
 * console.log(`Complexity: ${stats.complexity}`);
 * ```
 */

import { useMemo } from "react";
import { useNodes } from "../contexts/NodeContext";
import type { Node, Edge } from "@xyflow/react";
import type { NodeData } from "../stores/NodeData";

export interface NodeCategoryStats {
  input: number;
  output: number;
  processing: number;
  group: number;
  other: number;
}

export interface NodeTypeDistribution {
  [nodeType: string]: number;
}

export interface WorkflowStatistics {
  // Basic counts
  totalNodes: number;
  totalEdges: number;
  selectedNodes: number;

  // Node categories
  nodeCategories: NodeCategoryStats;

  // Node type distribution
  nodeTypeDistribution: NodeTypeDistribution;

  // Graph metrics
  avgConnectionsPerNode: number;
  maxConnections: number;
  minConnections: number;

  // Complexity metrics
  graphDepth: number;
  branchingFactor: number;
  cyclomaticComplexity: number;

  // Graph health
  orphanNodes: number;
  hasCycles: boolean;
  connectivityDensity: number;

  // Helper to get the most used node types
  topNodeTypes: Array<{ type: string; count: number }>;
}

const getNodeCategory = (nodeType: string): keyof NodeCategoryStats => {
  if (nodeType.startsWith("nodetool.input")) {return "input";}
  if (nodeType.startsWith("nodetool.output")) {return "output";}
  if (nodeType.includes("Group") || nodeType.includes("Loop")) {return "group";}
  if (nodeType.startsWith("nodetool.")) {return "processing";}
  return "other";
};

/**
 * Calculate the depth of the graph using BFS from input nodes
 */
const calculateGraphDepth = (
  nodes: Node<NodeData>[],
  edges: Edge[]
): number => {
  const inputNodes = nodes.filter(
    (node) => getNodeCategory(node.type || "") === "input"
  );

  if (inputNodes.length === 0) {return 0;}

  // Build adjacency list
  const adjacency = new Map<string, string[]>();
  nodes.forEach((node) => adjacency.set(node.id, []));
  edges.forEach((edge) => {
    const targets = adjacency.get(edge.source) || [];
    targets.push(edge.target);
    adjacency.set(edge.source, targets);
  });

  let maxDepth = 0;
  const visited = new Set<string>();
  const queue: Array<{ nodeId: string; depth: number }> = inputNodes.map(
    (node) => ({ nodeId: node.id, depth: 0 })
  );

  while (queue.length > 0) {
    const { nodeId, depth } = queue.shift()!;
    if (visited.has(nodeId)) {continue;}
    visited.add(nodeId);
    maxDepth = Math.max(maxDepth, depth);

    const neighbors = adjacency.get(nodeId) || [];
    neighbors.forEach((neighbor) => {
      if (!visited.has(neighbor)) {
        queue.push({ nodeId: neighbor, depth: depth + 1 });
      }
    });
  }

  return maxDepth;
};

/**
 * Detect cycles in the graph using DFS
 */
const detectCycles = (nodes: Node<NodeData>[], edges: Edge[]): boolean => {
  const adjacency = new Map<string, string[]>();
  nodes.forEach((node) => adjacency.set(node.id, []));
  edges.forEach((edge) => {
    const targets = adjacency.get(edge.source) || [];
    targets.push(edge.target);
    adjacency.set(edge.source, targets);
  });

  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  const hasCycle = (nodeId: string): boolean => {
    visited.add(nodeId);
    recursionStack.add(nodeId);

    const neighbors = adjacency.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (hasCycle(neighbor)) {return true;}
      } else if (recursionStack.has(neighbor)) {
        return true;
      }
    }

    recursionStack.delete(nodeId);
    return false;
  };

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      if (hasCycle(node.id)) {return true;}
    }
  }

  return false;
};

export const useWorkflowStatistics = (): WorkflowStatistics => {
  const nodes = useNodes((state) => state.nodes);
  const edges = useNodes((state) => state.edges);

  const statistics = useMemo<WorkflowStatistics>(() => {
    // Basic counts
    const totalNodes = nodes.length;
    const totalEdges = edges.length;
    const selectedNodes = nodes.filter((node) => node.selected).length;

    // Node categories
    const nodeCategories: NodeCategoryStats = {
      input: 0,
      output: 0,
      processing: 0,
      group: 0,
      other: 0
    };

    // Node type distribution
    const nodeTypeDistribution: NodeTypeDistribution = {};

    // Calculate connections per node
    const connectionCounts = new Map<string, number>();
    nodes.forEach((node: Node<NodeData>) => connectionCounts.set(node.id, 0));
    edges.forEach((edge: Edge) => {
      const sourceCount = connectionCounts.get(edge.source) || 0;
      const targetCount = connectionCounts.get(edge.target) || 0;
      connectionCounts.set(edge.source, sourceCount + 1);
      connectionCounts.set(edge.target, targetCount + 1);
    });

    const countsArray = Array.from(connectionCounts.values());
    const maxConnections =
      countsArray.length > 0 ? Math.max(...countsArray) : 0;
    const minConnections =
      countsArray.length > 0 ? Math.min(...countsArray) : 0;
    const avgConnectionsPerNode =
      totalNodes > 0 ? (totalEdges * 2) / totalNodes : 0;

    // Analyze nodes
    nodes.forEach((node) => {
      const category = getNodeCategory(node.type || "");
      nodeCategories[category]++;

      const type = node.type || "unknown";
      nodeTypeDistribution[type] = (nodeTypeDistribution[type] || 0) + 1;
    });

    // Top node types
    const topNodeTypes = Object.entries(nodeTypeDistribution)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Graph metrics
    const graphDepth = calculateGraphDepth(nodes, edges);
    const hasCycles = detectCycles(nodes, edges);

    // Branching factor (average number of outputs per node)
    const outputCounts = new Map<string, number>();
    nodes.forEach((node: Node<NodeData>) => outputCounts.set(node.id, 0));
    edges.forEach((edge: Edge) => {
      const count = outputCounts.get(edge.source) || 0;
      outputCounts.set(edge.source, count + 1);
    });
    const branchingFactor =
      totalNodes > 0
        ? Array.from(outputCounts.values()).reduce((a, b) => a + b, 0) /
          totalNodes
        : 0;

    // Cyclomatic complexity: M = E - N + 2P
    // Where E = edges, N = nodes, P = connected components
    // Simplified: M = E - N + 2 (assuming single connected component)
    const cyclomaticComplexity = Math.max(1, totalEdges - totalNodes + 2);

    // Orphan nodes (no connections)
    const connectedNodeIds = new Set<string>();
    edges.forEach((edge: Edge) => {
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    });
    const orphanNodes = nodes.filter(
      (node) => !connectedNodeIds.has(node.id)
    ).length;

    // Connectivity density (actual edges / possible edges)
    // For a directed graph: possible edges = n * (n - 1)
    const possibleEdges =
      totalNodes > 1 ? totalNodes * (totalNodes - 1) : 1;
    const connectivityDensity = totalEdges / possibleEdges;

    return {
      totalNodes,
      totalEdges,
      selectedNodes,
      nodeCategories,
      nodeTypeDistribution,
      avgConnectionsPerNode,
      maxConnections,
      minConnections,
      graphDepth,
      branchingFactor,
      cyclomaticComplexity,
      orphanNodes,
      hasCycles,
      connectivityDensity,
      topNodeTypes
    };
  }, [nodes, edges]);

  return statistics;
};

export default useWorkflowStatistics;
