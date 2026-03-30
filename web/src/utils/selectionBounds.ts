import type { Edge, Node, ReactFlowInstance, XYPosition } from "@xyflow/react";

export type SelectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const MIN_SELECTION_SIZE = 4;

/**
 * Normalize two XY positions into a selection rectangle that React Flow can use.
 * Returns null when the selection is too small or positions are missing.
 */
export const getSelectionRect = (
  start: XYPosition | null,
  end: XYPosition | null,
  minSize = MIN_SELECTION_SIZE
): SelectionRect | null => {
  if (!start || !end) {
    return null;
  }

  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);

  const width = maxX - minX;
  const height = maxY - minY;

  if (width < minSize || height < minSize) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width,
    height
  };
};

/**
 * Check if a node is fully contained within a selection rectangle.
 * The node must be entirely inside the rect (all 4 corners within bounds).
 */
const isNodeFullyEnclosed = (node: Node, rect: SelectionRect): boolean => {
  const nodeX = node.position.x;
  const nodeY = node.position.y;
  const nodeWidth = node.measured?.width ?? node.width ?? 0;
  const nodeHeight = node.measured?.height ?? node.height ?? 0;

  const nodeRight = nodeX + nodeWidth;
  const nodeBottom = nodeY + nodeHeight;

  const rectRight = rect.x + rect.width;
  const rectBottom = rect.y + rect.height;

  // Node must be fully inside the rect
  return (
    nodeX >= rect.x &&
    nodeY >= rect.y &&
    nodeRight <= rectRight &&
    nodeBottom <= rectBottom
  );
};

/**
 * Helper that finds nodes fully contained within a selection rectangle.
 * Uses manual bounds checking instead of ReactFlow's getIntersectingNodes
 * which doesn't reliably check for full enclosure.
 */
export const getNodesWithinSelection = (
  instance: ReactFlowInstance<Node, Edge>,
  rect: SelectionRect | null,
  predicate?: (node: Node) => boolean
): Node[] => {
  if (!instance || !rect) {
    return [];
  }

  const allNodes = instance.getNodes();
  
  // Filter to nodes that match predicate (if provided) and are fully enclosed
  return allNodes.filter((node) => {
    if (predicate && !predicate(node)) {
      return false;
    }
    return isNodeFullyEnclosed(node, rect);
  });
};
