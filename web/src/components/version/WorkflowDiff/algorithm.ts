import { type Node, type Edge } from '@xyflow/react';
import type { WorkflowDiff, NodeDiff, EdgeDiff } from './types';

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) { return true; }
  if (a == null || b == null) { return a === b; }
  if (typeof a !== typeof b) { return false; }
  if (typeof a !== 'object') { return a === b; }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) { return false; }
    return a.every((val, idx) => deepEqual(val, b[idx]));
  }

  if (Array.isArray(a) || Array.isArray(b)) { return false; }

  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) { return false; }

  return keysA.every(key =>
    deepEqual(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key]
    )
  );
}

function compareNodes(oldNode: Node, newNode: Node): NodeDiff['changes'] | null {
  const changes: NodeDiff['changes'] = {
    position: undefined,
    data: undefined,
    label: undefined,
  };

  if (oldNode.position.x !== newNode.position.x || oldNode.position.y !== newNode.position.y) {
    changes.position = {
      old: { x: oldNode.position.x, y: oldNode.position.y },
      new: { x: newNode.position.x, y: newNode.position.y },
    };
  }

  if (!deepEqual(oldNode.data, newNode.data)) {
    changes.data = {
      old: oldNode.data as Record<string, unknown>,
      new: newNode.data as Record<string, unknown>,
    };
  }

  const oldLabel = (oldNode.data as Record<string, unknown>)?.label as string || '';
  const newLabel = (newNode.data as Record<string, unknown>)?.label as string || '';
  if (oldLabel !== newLabel) {
    changes.label = { old: oldLabel, new: newLabel };
  }

  const result: NodeDiff['changes'] = {};
  if (changes.position) { result.position = changes.position; }
  if (changes.data) { result.data = changes.data; }
  if (changes.label) { result.label = changes.label; }

  return Object.keys(result).length > 0 ? result : null;
}

function compareEdges(oldEdge: Edge, newEdge: Edge): EdgeDiff['changes'] | null {
  const changes: EdgeDiff['changes'] = {
    source: undefined,
    target: undefined,
    label: undefined,
  };

  if (oldEdge.source !== newEdge.source) {
    changes.source = { old: oldEdge.source, new: newEdge.source };
  }

  if (oldEdge.target !== newEdge.target) {
    changes.target = { old: oldEdge.target, new: newEdge.target };
  }

  const oldLabel = String(oldEdge.label ?? '');
  const newLabel = String(newEdge.label ?? '');
  if (oldLabel !== newLabel) {
    changes.label = { old: oldLabel, new: newLabel };
  }

  const result: EdgeDiff['changes'] = {};
  if (changes.source) { result.source = changes.source; }
  if (changes.target) { result.target = changes.target; }
  if (changes.label) { result.label = changes.label; }

  return Object.keys(result).length > 0 ? result : null;
}

export function computeWorkflowDiff(
  oldNodes: Node[],
  oldEdges: Edge[],
  newNodes: Node[],
  newEdges: Edge[]
): WorkflowDiff {
  const oldNodeMap = new Map(oldNodes.map(n => [n.id, n]));
  const newNodeMap = new Map(newNodes.map(n => [n.id, n]));
  const oldEdgeMap = new Map(oldEdges.map(e => [e.id, e]));
  const newEdgeMap = new Map(newEdges.map(e => [e.id, e]));

  const addedNodes: NodeDiff[] = [];
  const removedNodes: NodeDiff[] = [];
  const modifiedNodes: NodeDiff[] = [];
  const unchangedNodes: NodeDiff[] = [];

  for (const newNode of newNodes) {
    const oldNode = oldNodeMap.get(newNode.id);
    if (!oldNode) {
      addedNodes.push({ nodeId: newNode.id, changeType: 'added', node: newNode });
    } else if (compareNodes(oldNode, newNode)) {
      modifiedNodes.push({
        nodeId: newNode.id,
        changeType: 'modified',
        node: newNode,
        changes: compareNodes(oldNode, newNode)!,
      });
    } else {
      unchangedNodes.push({ nodeId: newNode.id, changeType: 'unchanged', node: newNode });
    }
  }

  for (const oldNode of oldNodes) {
    if (!newNodeMap.has(oldNode.id)) {
      removedNodes.push({ nodeId: oldNode.id, changeType: 'removed', node: oldNode });
    }
  }

  const addedEdges: EdgeDiff[] = [];
  const removedEdges: EdgeDiff[] = [];
  const modifiedEdges: EdgeDiff[] = [];
  const unchangedEdges: EdgeDiff[] = [];

  for (const newEdge of newEdges) {
    const oldEdge = oldEdgeMap.get(newEdge.id);
    if (!oldEdge) {
      addedEdges.push({ edgeId: newEdge.id, changeType: 'added', edge: newEdge });
    } else if (compareEdges(oldEdge, newEdge)) {
      modifiedEdges.push({
        edgeId: newEdge.id,
        changeType: 'modified',
        edge: newEdge,
        changes: compareEdges(oldEdge, newEdge)!,
      });
    } else {
      unchangedEdges.push({ edgeId: newEdge.id, changeType: 'unchanged', edge: newEdge });
    }
  }

  for (const oldEdge of oldEdges) {
    if (!newEdgeMap.has(oldEdge.id)) {
      removedEdges.push({ edgeId: oldEdge.id, changeType: 'removed', edge: oldEdge });
    }
  }

  return {
    addedNodes,
    removedNodes,
    modifiedNodes,
    unchangedNodes,
    addedEdges,
    removedEdges,
    modifiedEdges,
    unchangedEdges,
    summary: {
      nodesAdded: addedNodes.length,
      nodesRemoved: removedNodes.length,
      nodesModified: modifiedNodes.length,
      edgesAdded: addedEdges.length,
      edgesRemoved: removedEdges.length,
      edgesModified: modifiedEdges.length,
    },
  };
}

export function getChangeColor(changeType: 'added' | 'removed' | 'modified' | 'unchanged'): string {
  switch (changeType) {
    case 'added':
      return 'success.main';
    case 'removed':
      return 'error.main';
    case 'modified':
      return 'warning.main';
    default:
      return 'text.secondary';
  }
}

export function getChangeIcon(changeType: 'added' | 'removed' | 'modified' | 'unchanged'): string {
  switch (changeType) {
    case 'added':
      return '+';
    case 'removed':
      return '-';
    case 'modified':
      return '~';
    default:
      return '=';
  }
}

export type { WorkflowDiff };
