import type { Node, XYPosition } from "@xyflow/react";

/**
 * A node's canvas position: its own position plus the offset of every
 * ancestor group. A missing parent or a parent cycle ends the walk.
 */
export const absoluteNodePosition = <T extends Record<string, unknown>>(
  node: Node<T>,
  nodeById: ReadonlyMap<string, Node<T>>
): XYPosition => {
  const position = { x: node.position.x, y: node.position.y };
  const visited = new Set<string>([node.id]);
  let parent = node.parentId ? nodeById.get(node.parentId) : undefined;
  while (parent && !visited.has(parent.id)) {
    visited.add(parent.id);
    position.x += parent.position.x;
    position.y += parent.position.y;
    parent = parent.parentId ? nodeById.get(parent.parentId) : undefined;
  }
  return position;
};
