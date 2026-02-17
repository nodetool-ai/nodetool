/**
 * Hook that calculates and provides statistics about the current workflow.
 *
 * This includes:
 * - Total node count
 * - Total edge count
 * - Node type distribution (by category)
 * - Input/output node counts
 * - Group node count
 * - Comment node count
 *
 * @example
 * ```typescript
 * const stats = useWorkflowStats();
 * console.log(`Nodes: ${stats.nodeCount}, Edges: ${stats.edgeCount}`);
 * ```
 */

import { useMemo } from "react";
import { useNodes } from "../contexts/NodeContext";
import type { Node } from "@xyflow/react";
import type { NodeData } from "../stores/NodeData";

export interface NodeTypeStats {
  type: string;
  count: number;
  category: string;
}

export interface WorkflowStats {
  nodeCount: number;
  edgeCount: number;
  inputNodeCount: number;
  outputNodeCount: number;
  groupNodeCount: number;
  commentNodeCount: number;
  processingNodeCount: number;
  constantNodeCount: number;
  nodeTypeDistribution: NodeTypeStats[];
  selectedNodeCount: number;
}

/**
 * Categorizes a node type into a human-readable category.
 */
const getNodeCategory = (nodeType: string): string => {
  if (nodeType.startsWith("nodetool.input.")) {
    return "Input";
  }
  if (nodeType.startsWith("nodetool.output.")) {
    return "Output";
  }
  if (nodeType === "nodetool.Group") {
    return "Group";
  }
  if (nodeType === "nodetool.Comment") {
    return "Comment";
  }
  if (nodeType.startsWith("nodetool.constant.") || nodeType === "Constant") {
    return "Constant";
  }
  if (nodeType.startsWith("nodetool.")) {
    return "Processing";
  }
  return "Other";
};

/**
 * Hook that computes workflow statistics.
 * Uses useMemo to avoid recalculating on every render unless nodes/edges change.
 */
const useWorkflowStats = (): WorkflowStats => {
  const nodes = useNodes((state) => state.nodes);
  const edges = useNodes((state) => state.edges);
  const selectedNodeCount = useNodes((state) => state.getSelectedNodeCount());

  const stats = useMemo((): WorkflowStats => {
    // Initialize counters
    let inputCount = 0;
    let outputCount = 0;
    let groupCount = 0;
    let commentCount = 0;
    let processingCount = 0;
    let constantCount = 0;

    // Track node type distribution
    const typeMap = new Map<string, { count: number; category: string }>();

    nodes.forEach((node: Node<NodeData>) => {
      const nodeType = node.type || "unknown";
      const category = getNodeCategory(nodeType);

      // Update category counters
      switch (category) {
        case "Input":
          inputCount++;
          break;
        case "Output":
          outputCount++;
          break;
        case "Group":
          groupCount++;
          break;
        case "Comment":
          commentCount++;
          break;
        case "Constant":
          constantCount++;
          break;
        case "Processing":
          processingCount++;
          break;
      }

      // Update type distribution
      const existing = typeMap.get(nodeType);
      if (existing) {
        existing.count++;
      } else {
        typeMap.set(nodeType, { count: 1, category });
      }
    });

    // Convert type map to array and sort by count (descending)
    const nodeTypeDistribution: NodeTypeStats[] = Array.from(
      typeMap.entries()
    )
      .map(([type, { count, category }]) => ({ type, count, category }))
      .sort((a, b) => b.count - a.count);

    return {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      inputNodeCount: inputCount,
      outputNodeCount: outputCount,
      groupNodeCount: groupCount,
      commentNodeCount: commentCount,
      processingNodeCount: processingCount,
      constantNodeCount: constantCount,
      nodeTypeDistribution,
      selectedNodeCount
    };
  }, [nodes, edges, selectedNodeCount]);

  return stats;
};

export default useWorkflowStats;
