/**
 * Graph Diff Utility
 *
 * Computes differences between two workflow graphs to visualize changes
 * between versions.
 */

import { Graph, Node, Edge } from "../stores/ApiTypes";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

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

export interface GraphDiff {
  addedNodes: Node[];
  removedNodes: Node[];
  modifiedNodes: NodeChange[];
  addedEdges: Edge[];
  removedEdges: Edge[];
  hasChanges: boolean;
}

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

  if (!isRecord(a) || !isRecord(b)) {
    return false;
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);

  if (aKeys.length !== bKeys.length) {
    return false;
  }

  return aKeys.every((key) => isEqual(a[key], b[key]));
};

const findNodePropertyChanges = (
  oldNode: Node,
  newNode: Node
): PropertyChange[] => {
  const changes: PropertyChange[] = [];

  const toRecord = (v: unknown): Record<string, unknown> =>
    isRecord(v) ? v : {};
  const oldData = toRecord(oldNode.data);
  const newData = toRecord(newNode.data);

  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

  for (const key of allKeys) {
    const oldValue = oldData[key];
    const newValue = newData[key];

    if (!isEqual(oldValue, newValue)) {
      changes.push({ key, oldValue, newValue });
    }
  }

  if (!isEqual(oldNode.ui_properties, newNode.ui_properties)) {
    changes.push({
      key: "ui_properties",
      oldValue: oldNode.ui_properties,
      newValue: newNode.ui_properties
    });
  }

  return changes;
};

const findModifiedNodes = (
  oldGraph: Graph,
  newGraph: Graph
): NodeChange[] => {
  const modifiedNodes: NodeChange[] = [];

  const oldNodesMap = new Map<string, Node>(oldGraph.nodes.map((n) => [n.id, n]));
  const newNodesMap = new Map<string, Node>(newGraph.nodes.map((n) => [n.id, n]));

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

/** Unique edge identifier for comparison. */
const getEdgeKey = (edge: Edge): string => {
  const source = edge.source ?? "unknown";
  const target = edge.target ?? "unknown";
  return `${source}:${edge.sourceHandle || "default"}->${target}:${edge.targetHandle || "default"}`;
};

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

  const addedNodes = newGraph.nodes.filter((n: Node) => !oldNodeIds.has(n.id));
  const removedNodes = oldGraph.nodes.filter((n: Node) => !newNodeIds.has(n.id));
  const modifiedNodes = findModifiedNodes(oldGraph, newGraph);

  const addedEdges: Edge[] = [];
  for (const [key, edge] of newEdgeKeys) {
    if (!oldEdgeKeys.has(key)) {
      addedEdges.push(edge);
    }
  }

  const removedEdges: Edge[] = [];
  for (const [key, edge] of oldEdgeKeys) {
    if (!newEdgeKeys.has(key)) {
      removedEdges.push(edge);
    }
  }

  const hasChanges =
    addedNodes.length > 0 ||
    removedNodes.length > 0 ||
    modifiedNodes.length > 0 ||
    addedEdges.length > 0 ||
    removedEdges.length > 0;

  return {
    addedNodes,
    removedNodes,
    modifiedNodes,
    addedEdges,
    removedEdges,
    hasChanges
  };
};

