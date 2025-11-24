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
 * Helper that wraps React Flow's getIntersectingNodes API with a predicate filter.
 * Used to select fully contained group nodes within a selection rectangle.
 */
export const getNodesWithinSelection = (
  instance: ReactFlowInstance<Node, Edge>,
  rect: SelectionRect | null,
  predicate?: (node: Node) => boolean
): Node[] => {
  if (!instance || !rect) {
    return [];
  }

  const intersectingNodes = instance.getIntersectingNodes(
    rect,
    false
  ) as Node[];

  if (!predicate) {
    return intersectingNodes;
  }

  return intersectingNodes.filter(predicate);
};
