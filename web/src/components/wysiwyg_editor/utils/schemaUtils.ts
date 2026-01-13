/**
 * Schema Utilities
 *
 * Functions for manipulating UI schema nodes.
 */

import type { UISchemaNode, UISchema, MuiComponentType } from "../types";
import { componentRegistry, canBeChildOf } from "../types/registry";
import { v4 as uuidv4 } from "uuid";

/**
 * Generate a unique ID for a node
 */
export const generateNodeId = (): string => uuidv4();

/**
 * Create a new node with default props
 */
export const createNode = (type: MuiComponentType, props?: Record<string, unknown>): UISchemaNode => {
  const definition = componentRegistry[type];
  return {
    id: generateNodeId(),
    type,
    props: {
      ...definition.defaultProps,
      ...props,
    },
    children: definition.childPolicy === "none" ? undefined : [],
  };
};

/**
 * Create an empty schema with a root Box container
 */
export const createEmptySchema = (): UISchema => ({
  root: createNode("Box", { sx: { p: 2, minHeight: "100%" } }),
  version: "1.0",
});

/**
 * Find a node by ID in the schema tree
 */
export const findNodeById = (root: UISchemaNode, id: string): UISchemaNode | null => {
  if (root.id === id) {
    return root;
  }
  if (root.children) {
    for (const child of root.children) {
      const found = findNodeById(child, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
};

/**
 * Find the parent of a node by ID
 */
export const findParentNode = (
  root: UISchemaNode,
  id: string,
  parent: UISchemaNode | null = null
): UISchemaNode | null => {
  if (root.id === id) {
    return parent;
  }
  if (root.children) {
    for (const child of root.children) {
      const found = findParentNode(child, id, root);
      if (found !== null) {
        return found;
      }
    }
  }
  return null;
};

/**
 * Get the path to a node (array of parent IDs)
 */
export const getNodePath = (root: UISchemaNode, id: string): string[] => {
  const path: string[] = [];

  const findPath = (node: UISchemaNode, targetId: string): boolean => {
    if (node.id === targetId) {
      return true;
    }
    if (node.children) {
      for (const child of node.children) {
        if (findPath(child, targetId)) {
          path.unshift(node.id);
          return true;
        }
      }
    }
    return false;
  };

  findPath(root, id);
  return path;
};

/**
 * Deep clone a node with new IDs
 */
export const cloneNode = (node: UISchemaNode): UISchemaNode => ({
  id: generateNodeId(),
  type: node.type,
  props: JSON.parse(JSON.stringify(node.props)),
  children: node.children?.map(cloneNode),
});

/**
 * Add a child node to a parent
 */
export const addChildNode = (
  root: UISchemaNode,
  parentId: string,
  child: UISchemaNode,
  index?: number
): UISchemaNode => {
  if (root.id === parentId) {
    // Validate child can be added
    if (!canBeChildOf(child.type, root.type)) {
      console.warn(`Cannot add ${child.type} as child of ${root.type}`);
      return root;
    }

    const newChildren = root.children ? [...root.children] : [];
    if (index !== undefined && index >= 0 && index <= newChildren.length) {
      newChildren.splice(index, 0, child);
    } else {
      newChildren.push(child);
    }
    return { ...root, children: newChildren };
  }

  if (root.children) {
    return {
      ...root,
      children: root.children.map((c) => addChildNode(c, parentId, child, index)),
    };
  }

  return root;
};

/**
 * Remove a node by ID
 */
export const removeNode = (root: UISchemaNode, id: string): UISchemaNode | null => {
  // Cannot remove root
  if (root.id === id) {
    return root;
  }

  if (root.children) {
    const filteredChildren = root.children.filter((c) => c.id !== id);
    if (filteredChildren.length !== root.children.length) {
      return { ...root, children: filteredChildren };
    }
    return {
      ...root,
      children: root.children.map((c) => removeNode(c, id)).filter((c): c is UISchemaNode => c !== null),
    };
  }

  return root;
};

/**
 * Update a node's props
 */
export const updateNodeProps = (
  root: UISchemaNode,
  id: string,
  props: Record<string, unknown>
): UISchemaNode => {
  if (root.id === id) {
    return {
      ...root,
      props: { ...root.props, ...props },
    };
  }

  if (root.children) {
    return {
      ...root,
      children: root.children.map((c) => updateNodeProps(c, id, props)),
    };
  }

  return root;
};

/**
 * Move a node to a new parent
 */
export const moveNode = (
  root: UISchemaNode,
  nodeId: string,
  newParentId: string,
  index?: number
): UISchemaNode => {
  const node = findNodeById(root, nodeId);
  if (!node) {
    return root;
  }

  const newParent = findNodeById(root, newParentId);
  if (!newParent) {
    return root;
  }

  // Validate the move
  if (!canBeChildOf(node.type, newParent.type)) {
    console.warn(`Cannot move ${node.type} to ${newParent.type}`);
    return root;
  }

  // Remove from current location
  const withoutNode = removeNode(root, nodeId);
  if (!withoutNode) {
    return root;
  }

  // Add to new parent
  return addChildNode(withoutNode, newParentId, node, index);
};

/**
 * Reorder children within a parent
 */
export const reorderChildren = (
  root: UISchemaNode,
  parentId: string,
  fromIndex: number,
  toIndex: number
): UISchemaNode => {
  if (root.id === parentId && root.children) {
    const newChildren = [...root.children];
    const [removed] = newChildren.splice(fromIndex, 1);
    newChildren.splice(toIndex, 0, removed);
    return { ...root, children: newChildren };
  }

  if (root.children) {
    return {
      ...root,
      children: root.children.map((c) => reorderChildren(c, parentId, fromIndex, toIndex)),
    };
  }

  return root;
};

/**
 * Count total nodes in the tree
 */
export const countNodes = (root: UISchemaNode): number => {
  let count = 1;
  if (root.children) {
    for (const child of root.children) {
      count += countNodes(child);
    }
  }
  return count;
};

/**
 * Validate schema doesn't exceed max nodes
 */
export const validateNodeCount = (root: UISchemaNode, maxNodes = 200): boolean => {
  return countNodes(root) <= maxNodes;
};

/**
 * Flatten the tree into an array of { node, depth } pairs
 */
export const flattenTree = (
  root: UISchemaNode,
  depth = 0
): Array<{ node: UISchemaNode; depth: number }> => {
  const result: Array<{ node: UISchemaNode; depth: number }> = [{ node: root, depth }];
  if (root.children) {
    for (const child of root.children) {
      result.push(...flattenTree(child, depth + 1));
    }
  }
  return result;
};
