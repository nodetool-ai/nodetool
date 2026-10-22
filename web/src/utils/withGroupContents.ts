import type { Node } from "@xyflow/react";

/**
 * The nodes named by `ids` plus everything inside them: a group's children,
 * their children, and so on. Copy, cut, duplicate and delete act on a group
 * as a whole. The result keeps the order of `nodes`, so a group still comes
 * before its children.
 */
export const withGroupContents = <T extends Record<string, unknown>>(
  ids: Iterable<string>,
  nodes: readonly Node<T>[]
): Node<T>[] => {
  const included = new Set(ids);
  const childrenByParent = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.parentId) {
      const children = childrenByParent.get(node.parentId) ?? [];
      children.push(node.id);
      childrenByParent.set(node.parentId, children);
    }
  }
  const pending = [...included];
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    for (const child of childrenByParent.get(id) ?? []) {
      if (!included.has(child)) {
        included.add(child);
        pending.push(child);
      }
    }
  }
  return nodes.filter((node) => included.has(node.id));
};
