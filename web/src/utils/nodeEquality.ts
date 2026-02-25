import { Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";

/**
 * Compares two arrays of nodes for equality, ignoring position and other volatile properties
 * like 'selected', 'dragging', 'measured'.
 *
 * Only compares:
 * - Array length
 * - Node ID
 * - Node Type
 * - Node Data (by reference)
 *
 * This is useful for preventing re-renders in components like Inspector or NodeExplorer
 * when nodes are dragged but their data/structure hasn't changed.
 */
export const areNodesEqualIgnoringPosition = (
  prev: Node<NodeData>[],
  next: Node<NodeData>[]
): boolean => {
  if (prev === next) {
    return true;
  }
  if (prev.length !== next.length) {
    return false;
  }
  for (let i = 0; i < prev.length; i++) {
    const a = prev[i];
    const b = next[i];
    if (a.id !== b.id || a.type !== b.type || a.data !== b.data) {
      return false;
    }
  }
  return true;
};
