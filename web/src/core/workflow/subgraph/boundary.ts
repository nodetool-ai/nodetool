/**
 * Boundary analysis for subgraph conversion
 * 
 * Analyzes a selection of nodes/edges to determine:
 * - Which links cross the boundary (inputs/outputs)
 * - Which links are internal to the selection
 * - Which nodes are selected
 */

import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../../../stores/NodeData";
import { BoundaryAnalysis } from "../../../types/subgraph";

/**
 * Analyzes the boundary of a node selection
 * 
 * @param selectedNodes - Nodes selected for conversion to subgraph
 * @param allEdges - All edges in the graph
 * @returns Analysis of boundary links and internal structure
 */
export function analyzeBoundary(
  selectedNodes: Node<NodeData>[],
  allEdges: Edge[]
): BoundaryAnalysis {
  // Create set of selected node IDs for fast lookup
  const selectedNodeIds = new Set(selectedNodes.map(n => n.id));
  
  // Categorize edges
  const boundaryInputLinks: Edge[] = [];
  const boundaryOutputLinks: Edge[] = [];
  const internalLinks: Edge[] = [];
  
  for (const edge of allEdges) {
    const sourceSelected = selectedNodeIds.has(edge.source);
    const targetSelected = selectedNodeIds.has(edge.target);
    
    if (sourceSelected && targetSelected) {
      // Both nodes are in selection - internal link
      internalLinks.push(edge);
    } else if (!sourceSelected && targetSelected) {
      // Source outside, target inside - input link
      boundaryInputLinks.push(edge);
    } else if (sourceSelected && !targetSelected) {
      // Source inside, target outside - output link
      boundaryOutputLinks.push(edge);
    }
    // Both outside - ignore
  }
  
  return {
    boundaryInputLinks,
    boundaryOutputLinks,
    internalLinks,
    selectedNodes
  };
}

/**
 * Groups boundary links by their target node and slot
 * Used for creating subgraph input slots
 * 
 * @param links - Boundary input links
 * @returns Map of "nodeId:slotId" to array of edges
 */
export function groupBoundaryInputs(links: Edge[]): Map<string, Edge[]> {
  const grouped = new Map<string, Edge[]>();
  
  for (const link of links) {
    const key = `${link.target}:${link.targetHandle || "default"}`;
    const existing = grouped.get(key) || [];
    existing.push(link);
    grouped.set(key, existing);
  }
  
  return grouped;
}

/**
 * Groups boundary links by their source node and slot
 * Used for creating subgraph output slots
 * 
 * @param links - Boundary output links
 * @returns Map of "nodeId:slotId" to array of edges
 */
export function groupBoundaryOutputs(links: Edge[]): Map<string, Edge[]> {
  const grouped = new Map<string, Edge[]>();
  
  for (const link of links) {
    const key = `${link.source}:${link.sourceHandle || "default"}`;
    const existing = grouped.get(key) || [];
    existing.push(link);
    grouped.set(key, existing);
  }
  
  return grouped;
}

/**
 * Validates that a selection can be converted to a subgraph
 * 
 * @param selectedNodes - Nodes to validate
 * @returns Error message if invalid, null if valid
 */
export function validateSelection(selectedNodes: Node<NodeData>[]): string | null {
  if (selectedNodes.length === 0) {
    return "No nodes selected";
  }
  
  if (selectedNodes.length === 1) {
    return "At least 2 nodes required to create a subgraph";
  }
  
  // Check for special nodes that cannot be included
  const invalidTypes = [
    "nodetool.workflows.base_node.SubgraphInput",
    "nodetool.workflows.base_node.SubgraphOutput"
  ];
  
  for (const node of selectedNodes) {
    if (node.type && invalidTypes.includes(node.type)) {
      return `Cannot include ${node.type} nodes in a subgraph`;
    }
  }
  
  return null;
}

/**
 * Calculates the center position of a selection
 * Used for placing the subgraph instance node
 * 
 * @param nodes - Selected nodes
 * @returns Center position {x, y}
 */
export function calculateSelectionCenter(nodes: Node<NodeData>[]): { x: number; y: number } {
  if (nodes.length === 0) {
    return { x: 0, y: 0 };
  }
  
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  
  for (const node of nodes) {
    minX = Math.min(minX, node.position.x);
    maxX = Math.max(maxX, node.position.x + (node.width || 280));
    minY = Math.min(minY, node.position.y);
    maxY = Math.max(maxY, node.position.y + (node.height || 100));
  }
  
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2
  };
}
