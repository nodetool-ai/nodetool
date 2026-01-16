import { useMemo } from "react";
import { WorkflowVersion } from "../stores/VersionHistoryStore";

export interface WorkflowDiff {
  addedNodes: AddedNode[];
  removedNodes: RemovedNode[];
  modifiedNodes: ModifiedNode[];
  addedEdges: AddedEdge[];
  removedEdges: RemovedEdge[];
  unchangedNodes: string[];
  unchangedEdges: string[];
}

export interface AddedNode {
  id: string;
  type: string;
  data?: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface RemovedNode {
  id: string;
  type: string;
  data?: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface ModifiedNode {
  id: string;
  type: string;
  changes: NodeChange[];
}

export interface NodeChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface AddedEdge {
  id: string;
  source: string;
  target: string;
}

export interface RemovedEdge {
  id: string;
  source: string;
  target: string;
}

export function useWorkflowDiff(
  oldVersion: WorkflowVersion | null,
  newVersion: WorkflowVersion | null
): WorkflowDiff {
  return useMemo(() => {
    if (!oldVersion && !newVersion) {
      return createEmptyDiff();
    }

    if (!oldVersion) {
      return createFullNewDiff(newVersion!);
    }

    if (!newVersion) {
      return createFullOldDiff(oldVersion);
    }

    return computeDiff(oldVersion, newVersion);
  }, [oldVersion, newVersion]);
}

function createEmptyDiff(): WorkflowDiff {
  return {
    addedNodes: [],
    removedNodes: [],
    modifiedNodes: [],
    addedEdges: [],
    removedEdges: [],
    unchangedNodes: [],
    unchangedEdges: [],
  };
}

function createFullNewDiff(version: WorkflowVersion): WorkflowDiff {
  return {
    addedNodes: version.graph.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      data: n.data,
      position: (n as { position?: { x: number; y: number } }).position,
    })),
    removedNodes: [],
    modifiedNodes: [],
    addedEdges: version.graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    })),
    removedEdges: [],
    unchangedNodes: [],
    unchangedEdges: [],
  };
}

function createFullOldDiff(version: WorkflowVersion): WorkflowDiff {
  return {
    addedNodes: [],
    removedNodes: version.graph.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      data: n.data,
      position: (n as { position?: { x: number; y: number } }).position,
    })),
    modifiedNodes: [],
    addedEdges: [],
    removedEdges: version.graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    })),
    unchangedNodes: [],
    unchangedEdges: [],
  };
}

function computeDiff(oldVersion: WorkflowVersion, newVersion: WorkflowVersion): WorkflowDiff {
  const oldNodeMap = new Map(oldVersion.graph.nodes.map((n) => [n.id, n]));
  const newNodeMap = new Map(newVersion.graph.nodes.map((n) => [n.id, n]));

  const addedNodes: AddedNode[] = [];
  const removedNodes: RemovedNode[] = [];
  const modifiedNodes: ModifiedNode[] = [];
  const unchangedNodes: string[] = [];

  for (const node of newVersion.graph.nodes) {
    const oldNode = oldNodeMap.get(node.id);
    if (!oldNode) {
      addedNodes.push({
        id: node.id,
        type: node.type,
        data: node.data,
        position: (node as { position?: { x: number; y: number } }).position,
      });
    } else {
      const changes = findNodeChanges(oldNode, node);
      if (changes.length > 0) {
        modifiedNodes.push({
          id: node.id,
          type: node.type,
          changes,
        });
      } else {
        unchangedNodes.push(node.id);
      }
    }
  }

  for (const node of oldVersion.graph.nodes) {
    if (!newNodeMap.has(node.id)) {
      removedNodes.push({
        id: node.id,
        type: node.type,
        data: node.data,
        position: (node as { position?: { x: number; y: number } }).position,
      });
    }
  }

  const oldEdgeMap = new Map(oldVersion.graph.edges.map((e) => [e.id, e]));
  const newEdgeMap = new Map(newVersion.graph.edges.map((e) => [e.id, e]));

  const addedEdges: AddedEdge[] = [];
  const removedEdges: RemovedEdge[] = [];
  const unchangedEdges: string[] = [];

  for (const edge of newVersion.graph.edges) {
    const oldEdge = oldEdgeMap.get(edge.id);
    if (!oldEdge) {
      addedEdges.push({
        id: edge.id,
        source: edge.source,
        target: edge.target,
      });
    } else {
      unchangedEdges.push(edge.id);
    }
  }

  for (const edge of oldVersion.graph.edges) {
    if (!newEdgeMap.has(edge.id)) {
      removedEdges.push({
        id: edge.id,
        source: edge.source,
        target: edge.target,
      });
    }
  }

  return {
    addedNodes,
    removedNodes,
    modifiedNodes,
    addedEdges,
    removedEdges,
    unchangedNodes,
    unchangedEdges,
  };
}

function findNodeChanges(
  oldNode: { id: string; type: string; data?: Record<string, unknown> },
  newNode: { id: string; type: string; data?: Record<string, unknown> }
): NodeChange[] {
  const changes: NodeChange[] = [];

  if (oldNode.type !== newNode.type) {
    changes.push({
      field: "type",
      oldValue: oldNode.type,
      newValue: newNode.type,
    });
  }

  if (JSON.stringify(oldNode.data) !== JSON.stringify(newNode.data)) {
    const oldData = oldNode.data || {};
    const newData = newNode.data || {};
    const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

    for (const key of allKeys) {
      const oldVal = oldData[key];
      const newVal = newData[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push({
          field: `data.${key}`,
          oldValue: oldVal,
          newValue: newVal,
        });
      }
    }
  }

  return changes;
}
