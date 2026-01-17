/**
 * Utility for computing differences between workflow versions.
 */

import isEqual from "lodash/isEqual";
import type { WorkflowVersion as ApiWorkflowVersion } from "../stores/ApiTypes";
import type { WorkflowDiff, DiffNode, DiffEdge } from "../stores/WorkflowDiffStore";

interface NodeData {
  label?: string;
  [key: string]: unknown;
}

interface GraphNode {
  id: string;
  type: string;
  data?: NodeData;
}

interface GraphEdge {
  id: string;
  source?: string | null;
  target?: string | null;
}

export function computeWorkflowDiff(
  oldVersion: ApiWorkflowVersion,
  newVersion: ApiWorkflowVersion
): WorkflowDiff {
  const oldNodes = (oldVersion.graph.nodes || []) as unknown as GraphNode[];
  const newNodes = (newVersion.graph.nodes || []) as unknown as GraphNode[];
  const oldEdges = (oldVersion.graph.edges || []) as unknown as GraphEdge[];
  const newEdges = (newVersion.graph.edges || []) as unknown as GraphEdge[];

  const nodeMap = new Map<string, DiffNode>();
  const edgeMap = new Map<string, DiffEdge>();

  const oldNodeIds = new Set(oldNodes.map((n) => n.id));
  const newNodeIds = new Set(newNodes.map((n) => n.id));

  const addedNodes = newNodes.filter((n) => !oldNodeIds.has(n.id));
  const removedNodes = oldNodes.filter((n) => !newNodeIds.has(n.id));

  for (const node of addedNodes) {
    const nodeData = node.data || {};
    nodeMap.set(node.id, {
      id: node.id,
      type: node.type,
      status: "added",
      label: (nodeData.label as string) || node.type,
      modifiedData: nodeData as Record<string, unknown>
    });
  }

  for (const node of removedNodes) {
    const nodeData = node.data || {};
    nodeMap.set(node.id, {
      id: node.id,
      type: node.type,
      status: "removed",
      label: (nodeData.label as string) || node.type,
      originalData: nodeData as Record<string, unknown>
    });
  }

  for (const newNode of newNodes) {
    if (!oldNodeIds.has(newNode.id)) {
      continue;
    }

    const oldNode = oldNodes.find((n) => n.id === newNode.id);
    if (!oldNode) {
      continue;
    }

    const typeChanged = oldNode.type !== newNode.type;
    const oldData = oldNode.data || {};
    const newData = newNode.data || {};
    const dataChanged = !isEqual(oldData, newData);

    if (typeChanged) {
      nodeMap.set(newNode.id, {
        id: newNode.id,
        type: newNode.type,
        status: "modified",
        label: (newData.label as string) || newNode.type,
        originalData: { type: oldNode.type, ...oldData },
        modifiedData: { type: newNode.type, ...newData }
      });
    } else if (dataChanged) {
      nodeMap.set(newNode.id, {
        id: newNode.id,
        type: newNode.type,
        status: "modified",
        label: (newData.label as string) || newNode.type,
        originalData: oldData,
        modifiedData: newData
      });
    } else {
      nodeMap.set(newNode.id, {
        id: newNode.id,
        type: newNode.type,
        status: "unchanged",
        label: (newData.label as string) || newNode.type
      });
    }
  }

  const oldEdgeIds = new Set(oldEdges.map((e) => e.id));
  const newEdgeIds = new Set(newEdges.map((e) => e.id));

  const addedEdges = newEdges.filter((e) => !oldEdgeIds.has(e.id));
  const removedEdges = oldEdges.filter((e) => !newEdgeIds.has(e.id));

  for (const edge of addedEdges) {
    const source = edge.source ?? "";
    const target = edge.target ?? "";
    edgeMap.set(edge.id, {
      id: edge.id,
      source,
      target,
      status: "added"
    });
  }

  for (const edge of removedEdges) {
    const source = edge.source ?? "";
    const target = edge.target ?? "";
    edgeMap.set(edge.id, {
      id: edge.id,
      source,
      target,
      status: "removed"
    });
  }

  for (const newEdge of newEdges) {
    if (!oldEdgeIds.has(newEdge.id)) {
      continue;
    }

    const oldEdge = oldEdges.find((e) => e.id === newEdge.id);
    if (oldEdge) {
      const newSource = newEdge.source ?? "";
      const newTarget = newEdge.target ?? "";
      const oldSource = oldEdge.source ?? "";
      const oldTarget = oldEdge.target ?? "";
      const changed = oldSource !== newSource || oldTarget !== newTarget;
      if (changed) {
        edgeMap.set(newEdge.id, {
          id: newEdge.id,
          source: newSource,
          target: newTarget,
          status: "modified"
        });
      } else {
        edgeMap.set(newEdge.id, {
          id: newEdge.id,
          source: newSource,
          target: newTarget,
          status: "unchanged"
        });
      }
    }
  }

  const nodes = Array.from(nodeMap.values());
  const edges = Array.from(edgeMap.values());

  const summary = {
    added: nodes.filter((n) => n.status === "added").length + edges.filter((e) => e.status === "added").length,
    removed: nodes.filter((n) => n.status === "removed").length + edges.filter((e) => e.status === "removed").length,
    modified: nodes.filter((n) => n.status === "modified").length + edges.filter((e) => e.status === "modified").length,
    unchanged: nodes.filter((n) => n.status === "unchanged").length + edges.filter((e) => e.status === "unchanged").length
  };

  return { nodes, edges, summary };
}
