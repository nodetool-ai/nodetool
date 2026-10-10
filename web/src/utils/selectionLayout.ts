import type { XYPosition } from "@xyflow/react";

/**
 * The node members layout actions read. A group child's `position` is
 * relative to its parent; everything else is in canvas coordinates.
 */
export interface LayoutNode {
  id: string;
  position: XYPosition;
  parentId?: string;
  selected?: boolean;
}

const indexById = <T extends LayoutNode>(nodes: readonly T[]): Map<string, T> =>
  new Map(nodes.map((node) => [node.id, node]));

/** Canvas position of `node`: its position plus every ancestor's. */
const absolutePosition = (
  node: LayoutNode,
  byId: ReadonlyMap<string, LayoutNode>
): XYPosition => {
  let x = node.position.x;
  let y = node.position.y;
  const seen = new Set<string>([node.id]);
  let parent = node.parentId ? byId.get(node.parentId) : undefined;
  while (parent && !seen.has(parent.id)) {
    seen.add(parent.id);
    x += parent.position.x;
    y += parent.position.y;
    parent = parent.parentId ? byId.get(parent.parentId) : undefined;
  }
  return { x, y };
};

/**
 * Whether a selected ancestor already carries `node` along, so moving `node`
 * too would move it twice relative to its group.
 */
export const hasSelectedAncestor = (
  node: LayoutNode,
  byId: ReadonlyMap<string, LayoutNode>,
  isSelected: (node: LayoutNode) => boolean = (candidate) =>
    candidate.selected === true
): boolean => {
  const seen = new Set<string>([node.id]);
  let parent = node.parentId ? byId.get(node.parentId) : undefined;
  while (parent && !seen.has(parent.id)) {
    if (isSelected(parent)) {
      return true;
    }
    seen.add(parent.id);
    parent = parent.parentId ? byId.get(parent.parentId) : undefined;
  }
  return false;
};

/**
 * The selected nodes a layout action places, with `position` in canvas
 * coordinates. A node inside a selected group is left out: it moves with
 * the group.
 */
export const layoutSelection = <T extends LayoutNode>(
  selected: readonly T[],
  allNodes: readonly LayoutNode[]
): T[] => {
  const byId = indexById(allNodes);
  const selectedIds = new Set(selected.map((node) => node.id));
  return selected
    .filter(
      (node) =>
        !hasSelectedAncestor(node, byId, (candidate) =>
          selectedIds.has(candidate.id)
        )
    )
    .map((node) => ({ ...node, position: absolutePosition(node, byId) }));
};

/**
 * Returns `nodes` with each node in `positions` moved to that canvas
 * position, written back relative to the node's parent.
 */
export const applyAbsolutePositions = <T extends LayoutNode>(
  nodes: readonly T[],
  positions: ReadonlyMap<string, XYPosition>
): T[] => {
  const byId = indexById(nodes);
  return nodes.map((node) => {
    const position = positions.get(node.id);
    if (!position) {
      return node;
    }
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    const origin = parent ? absolutePosition(parent, byId) : { x: 0, y: 0 };
    return {
      ...node,
      position: { x: position.x - origin.x, y: position.y - origin.y }
    };
  });
};
