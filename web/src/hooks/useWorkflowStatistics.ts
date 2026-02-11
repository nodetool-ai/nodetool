/**
 * Hook to calculate workflow statistics.
 *
 * Provides real-time statistics about the current workflow including:
 * - Total node and edge counts
 * - Node type distribution
 * - Selected node count
 * - Workflow complexity estimation
 * - Special node detection (loops, bypassed nodes)
 *
 * @returns Object containing:
 *   - stats: Current workflow statistics
 *   - refresh: Function to manually refresh statistics
 *
 * @example
 * ```typescript
 * const { stats, refresh } = useWorkflowStatistics();
 *
 * console.log(`Nodes: ${stats.totalNodes}, Edges: ${stats.totalEdges}`);
 * console.log(`Complexity: ${stats.estimatedComplexity}`);
 * ```
 */

import { useMemo, useCallback } from "react";
import { Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import { useNodes } from "../contexts/NodeContext";
import type { WorkflowStats, NodeTypeStats } from "../stores/WorkflowStatisticsStore";

/**
 * Categorizes a node type into a broad category for statistics.
 */
const categorizeNodeType = (nodeType: string): NodeTypeStats["category"] => {
  if (nodeType.startsWith("nodetool.input")) {
    return "input";
  }
  if (nodeType.startsWith("nodetool.output")) {
    return "output";
  }
  if (nodeType.startsWith("nodetool.constant")) {
    return "constant";
  }
  if (nodeType.includes("Loop") || nodeType.includes("Group")) {
    return "group";
  }
  if (nodeType.includes("Comment")) {
    return "comment";
  }
  return "processing";
};

/**
 * Estimates workflow complexity based on node count, edge count, and structure.
 */
const estimateComplexity = (
  nodeCount: number,
  edgeCount: number,
  hasLoops: boolean
): WorkflowStats["estimatedComplexity"] => {
  // Simple workflows: fewer than 10 nodes, no loops
  if (nodeCount < 10 && !hasLoops) {
    return "simple";
  }

  // Complex workflows: many nodes or many connections relative to nodes
  if (nodeCount > 50 || edgeCount > nodeCount * 2 || hasLoops) {
    return "complex";
  }

  // Moderate: everything in between
  return "moderate";
};

/**
 * Formats a node type for display (shortens long names).
 */
const formatNodeType = (type: string): string => {
  if (!type) {
    return "unknown";
  }
  // Remove "nodetool." prefix if present
  let formatted = type.replace(/^nodetool\./, "");
  // Shorten common prefixes
  formatted = formatted
    .replace(/^input\./, "in:")
    .replace(/^output\./, "out:")
    .replace(/^constant\./, "const:")
    .replace(/^image\./, "img:")
    .replace(/^text\./, "txt:")
    .replace(/^audio\./, "aud:");
  return formatted;
};

export const useWorkflowStatistics = () => {
  const nodes = useNodes((state) => state.nodes);
  const edges = useNodes((state) => state.edges);
  const getSelectedNodes = useNodes((state) => state.getSelectedNodes);

  const stats = useMemo((): WorkflowStats => {
    // Calculate total counts
    const totalNodes = nodes.length;
    const totalEdges = edges.length;
    const selectedNodes = getSelectedNodes().length;

    // Calculate node type distribution
    const typeMap = new Map<string, NodeTypeStats>();

    for (const node of nodes) {
      const nodeType = node.type || "unknown";
      const category = categorizeNodeType(nodeType);
      const formattedType = formatNodeType(nodeType);

      const existing = typeMap.get(nodeType);
      if (existing) {
        existing.count += 1;
      } else {
        typeMap.set(nodeType, {
          type: formattedType,
          count: 1,
          category
        });
      }
    }

    // Convert to array and sort by count (descending)
    const nodeTypeStats = Array.from(typeMap.values()).sort(
      (a: NodeTypeStats, b: NodeTypeStats) => b.count - a.count
    );

    // Detect special features
    const hasLoops = nodes.some((node: Node<NodeData>) =>
      node.type?.toLowerCase().includes("loop")
    );
    const hasBypassedNodes = nodes.some(
      (node: Node<NodeData>) => (node.data as NodeData)?.bypassed === true
    );

    // Estimate complexity
    const estimatedComplexity = estimateComplexity(
      totalNodes,
      totalEdges,
      hasLoops
    );

    return {
      totalNodes,
      totalEdges,
      selectedNodes,
      nodeTypeStats,
      hasLoops,
      hasBypassedNodes,
      estimatedComplexity
    };
  }, [nodes, edges, getSelectedNodes]);

  const refresh = useCallback(() => {
    // Statistics are computed from store state, so this is a no-op
    // but it provides a consistent API if we want to add caching later
  }, []);

  return {
    stats,
    refresh
  };
};
