/**
 * useNodeLineage
 *
 * Computes the chain of ancestor nodes (data flow lineage) for a given node.
 * This is useful for showing breadcrumb navigation to trace where data comes from.
 *
 * @example
 * ```tsx
 * const lineage = useNodeLineage(nodeId);
 * // lineage: [{ id: '1', label: 'Input A' }, { id: '2', label: 'Process B' }, ...]
 * ```
 */

import { useMemo } from "react";
import { useReactFlow } from "@xyflow/react";
import type { Edge, Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";

export interface LineageNode {
  id: string;
  label: string;
  type: string;
  position: { x: number; y: number };
}

export interface LineageEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
}

export interface NodeLineage {
  path: LineageNode[];
  edges: LineageEdge[];
}

/**
 * Result of useNodeLineage hook
 */
export interface UseNodeLineageResult {
  /** Ordered array of ancestor nodes from inputs to current node */
  path: LineageNode[];
  /** Edges connecting the nodes in the lineage path */
  edges: LineageEdge[];
  /** The complete lineage object */
  lineage: NodeLineage | null;
}

/**
 * Finds the primary input edge for a node.
 * Prioritizes edges connected to the first input handle, or returns any input edge.
 *
 * @param nodeId - The target node ID
 * @param allEdges - All edges in the workflow
 * @param allNodes - All nodes in the workflow
 * @returns The primary input edge or null
 */
function findPrimaryInputEdge(
  nodeId: string,
  allEdges: Edge[],
  allNodes: Node<NodeData>[]
): Edge | null {
  const inputEdges = allEdges.filter((edge) => edge.target === nodeId);

  if (inputEdges.length === 0) {
    return null;
  }

  // If there's only one input edge, use it
  if (inputEdges.length === 1) {
    return inputEdges[0];
  }

  // Try to find the edge connected to the "main" or first input handle
  // This is a heuristic - different node types may have different conventions
  const primaryEdge = inputEdges.find((edge) => {
    const targetNode = allNodes.find((n) => n.id === nodeId);
    if (!targetNode) {
      return false;
    }

    // Look for handles with specific naming patterns that indicate primary inputs
    const handle = edge.targetHandle || "";
    return (
      handle === "in" ||
      handle === "input" ||
      handle === "value" ||
      handle === "image" ||
      handle === "data" ||
      handle.includes("0") // First handle often has index 0
    );
  });

  // Fall back to the first input edge alphabetically by handle ID
  return (
    primaryEdge ||
    inputEdges.sort((a, b) =>
      (a.targetHandle || "").localeCompare(b.targetHandle || "")
    )[0]
  );
}

/**
 * Traces the lineage path from a node back through its input chain.
 *
 * @param startNodeId - The node to trace lineage from
 * @param allEdges - All edges in the workflow
 * @param allNodes - All nodes in the workflow
 * @param getNode - ReactFlow's getNode function
 * @param maxDepth - Maximum depth to trace (prevents infinite loops)
 * @returns The lineage path and connecting edges
 */
function traceLineage(
  startNodeId: string,
  allEdges: Edge[],
  allNodes: Node[],
  getNode: (id: string) => Node | undefined,
  maxDepth: number = 20
): NodeLineage | null {
  const path: LineageNode[] = [];
  const edges: LineageEdge[] = [];
  const visited = new Set<string>();
  let currentId = startNodeId;

  while (currentId && path.length < maxDepth) {
    // Prevent cycles
    if (visited.has(currentId)) {
      break;
    }
    visited.add(currentId);

    const node = getNode(currentId);
    if (!node) {
      break;
    }

    // Add current node to path
    const nodeData = node.data as NodeData & { metadata?: { title?: string } };

    path.push({
      id: node.id,
      label: nodeData.metadata?.title || node.id,
      type: node.type || "unknown",
      position: node.position
    });

    // Find the input edge to this node
    const inputEdge = findPrimaryInputEdge(currentId, allEdges, allNodes as Node<NodeData>[]);
    if (!inputEdge) {
      // This is an input node (no incoming edges)
      break;
    }

    // Add the edge to our lineage
    edges.push({
      id: inputEdge.id,
      source: inputEdge.source,
      target: inputEdge.target,
      sourceHandle: inputEdge.sourceHandle || null,
      targetHandle: inputEdge.targetHandle || null
    });

    // Move to the source node
    currentId = inputEdge.source;
  }

  // Reverse the path so it goes from inputs to current node
  return {
    path: path.reverse(),
    edges: edges.reverse()
  };
}

/**
 * React hook to compute the lineage (ancestor chain) for a node.
 *
 * @param nodeId - The node ID to compute lineage for, or null
 * @returns The lineage information
 */
export function useNodeLineage(nodeId: string | null): UseNodeLineageResult {
  const { getNode, getEdges, getNodes } = useReactFlow();

  const lineage = useMemo((): NodeLineage | null => {
    if (!nodeId) {
      return null;
    }

    const allEdges = getEdges();
    const allNodes = getNodes();

    return traceLineage(nodeId, allEdges, allNodes, getNode);
  }, [nodeId, getNode, getEdges, getNodes]);

  return {
    path: lineage?.path ?? [],
    edges: lineage?.edges ?? [],
    lineage
  };
}

export default useNodeLineage;
