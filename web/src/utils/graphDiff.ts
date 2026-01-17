/**
 * Graph Diff Utility
 *
 * Computes differences between two workflow graphs to visualize changes
 * between versions.
 */

import { Graph, Node, Edge } from "../stores/ApiTypes";

export interface PropertyChange {
  key: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface NodeChange {
  nodeId: string;
  nodeType: string;
  changes: PropertyChange[];
}

// export interface EdgeChange {
//   edgeId: string;
//   source: string;
//   target: string;
//   changes: PropertyChange[];
// }

export interface GraphDiff {
  addedNodes: Node[];
  removedNodes: Node[];
  modifiedNodes: NodeChange[];
  addedEdges: Edge[];
  removedEdges: Edge[];
  // modifiedEdges: EdgeChange[];
  hasChanges: boolean;
}

/**
 * Deep equality check for values
 */
const isEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) {
    return true;
  }

  if (a === null || b === null) {
    return a === b;
  }

  if (typeof a !== typeof b) {
    return false;
  }

  if (typeof a !== "object") {
    return a === b;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    return a.every((item, index) => isEqual(item, b[index]));
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    return false;
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);

  if (aKeys.length !== bKeys.length) {
    return false;
  }

  return aKeys.every((key) => isEqual(aObj[key], bObj[key]));
};

/**
 * Find property changes between two nodes
 */
const findNodePropertyChanges = (
  oldNode: Node,
  newNode: Node
): PropertyChange[] => {
  const changes: PropertyChange[] = [];

  // Compare data properties (data is unknown, cast to Record)
  const oldData = (oldNode.data || {}) as Record<string, unknown>;
  const newData = (newNode.data || {}) as Record<string, unknown>;

  // Get all keys from both objects
  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

  for (const key of allKeys) {
    const oldValue = oldData[key];
    const newValue = newData[key];

    if (!isEqual(oldValue, newValue)) {
      changes.push({ key, oldValue, newValue });
    }
  }

  // Also check UI properties that matter
  if (!isEqual(oldNode.ui_properties, newNode.ui_properties)) {
    changes.push({
      key: "ui_properties",
      oldValue: oldNode.ui_properties,
      newValue: newNode.ui_properties
    });
  }

  return changes;
};

/**
 * Find modified nodes between two graphs
 */
const findModifiedNodes = (
  oldGraph: Graph,
  newGraph: Graph
): NodeChange[] => {
  const modifiedNodes: NodeChange[] = [];

  const oldNodesMap = new Map(oldGraph.nodes.map((n: Node) => [n.id, n]));
  const newNodesMap = new Map(newGraph.nodes.map((n: Node) => [n.id, n]));

  // Check nodes that exist in both
  for (const [nodeId, newNode] of newNodesMap) {
    const oldNode = oldNodesMap.get(nodeId);
    if (oldNode) {
      const changes = findNodePropertyChanges(oldNode, newNode);
      if (changes.length > 0) {
        modifiedNodes.push({
          nodeId,
          nodeType: newNode.type,
          changes
        });
      }
    }
  }

  return modifiedNodes;
};

/**
 * Create a unique edge identifier for comparison
 */
const getEdgeKey = (edge: Edge): string => {
  const source = edge.source ?? "unknown";
  const target = edge.target ?? "unknown";
  return `${source}:${edge.sourceHandle || "default"}->${target}:${edge.targetHandle || "default"}`;
};

/**
 * Compute the differences between two graph versions
 */
export const computeGraphDiff = (
  oldGraph: Graph,
  newGraph: Graph
): GraphDiff => {
  const oldNodeIds = new Set(oldGraph.nodes.map((n: Node) => n.id));
  const newNodeIds = new Set(newGraph.nodes.map((n: Node) => n.id));

  const oldEdgeKeys = new Map<string, Edge>(
    oldGraph.edges.map((e: Edge) => [getEdgeKey(e), e])
  );
  const newEdgeKeys = new Map<string, Edge>(
    newGraph.edges.map((e: Edge) => [getEdgeKey(e), e])
  );

  // Find added nodes (in new but not in old)
  const addedNodes = newGraph.nodes.filter((n: Node) => !oldNodeIds.has(n.id));

  // Find removed nodes (in old but not in new)
  const removedNodes = oldGraph.nodes.filter((n: Node) => !newNodeIds.has(n.id));

  // Find modified nodes
  const modifiedNodes = findModifiedNodes(oldGraph, newGraph);

  // Find added edges
  const addedEdges: Edge[] = [];
  for (const [key, edge] of newEdgeKeys) {
    if (!oldEdgeKeys.has(key)) {
      addedEdges.push(edge);
    }
  }

  // Find removed edges
  const removedEdges: Edge[] = [];
  for (const [key, edge] of oldEdgeKeys) {
    if (!newEdgeKeys.has(key)) {
      removedEdges.push(edge);
    }
  }

  // Find modified edges (disabled - requires EdgeChange interface)
  const modifiedEdges = [];

  const hasChanges =
    addedNodes.length > 0 ||
    removedNodes.length > 0 ||
    modifiedNodes.length > 0 ||
    addedEdges.length > 0 ||
    removedEdges.length > 0 ||
    modifiedEdges.length > 0;

  return {
    addedNodes,
    removedNodes,
    modifiedNodes,
    addedEdges,
    removedEdges,
    hasChanges
  };
};

/**
 * Generate a human-readable summary of the diff
 */
export const getDiffSummary = (diff: GraphDiff): string => {
  const parts: string[] = [];

  if (diff.addedNodes.length > 0) {
    parts.push(`+${diff.addedNodes.length} node(s)`);
  }
  if (diff.removedNodes.length > 0) {
    parts.push(`-${diff.removedNodes.length} node(s)`);
  }
  if (diff.modifiedNodes.length > 0) {
    parts.push(`~${diff.modifiedNodes.length} modified node(s)`);
  }
  if (diff.addedEdges.length > 0) {
    parts.push(`+${diff.addedEdges.length} connection(s)`);
  }
  if (diff.removedEdges.length > 0) {
    parts.push(`-${diff.removedEdges.length} connection(s)`);
  }

  if (parts.length === 0) {
    return "No changes";
  }

  return parts.join(", ");
};
