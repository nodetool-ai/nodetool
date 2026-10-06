/**
 * Which part of the graph a run will not execute because an If or Switch
 * took the other branch.
 *
 * The kernel skips a node that is wired to data inputs and received nothing
 * on any of them (`packages/kernel/src/actor.ts`), and the skip cascades. A
 * branch node's untaken output shows up on its outgoing edges: the edge
 * reaches `completed` without ever carrying a message. This marks those
 * edges dead and applies the same rule downstream, so a node with one live
 * input still counts as running.
 */
import type { Edge } from "@xyflow/react";

export const BRANCH_NODE_TYPES: ReadonlySet<string> = new Set([
  "nodetool.control.If",
  "nodetool.control.Switch"
]);

export interface UntakenBranch {
  nodeIds: ReadonlySet<string>;
  edgeIds: ReadonlySet<string>;
}

export const EMPTY_UNTAKEN_BRANCH: UntakenBranch = {
  nodeIds: new Set(),
  edgeIds: new Set()
};

const isControlEdge = (edge: Edge): boolean =>
  edge.type === "control" || edge.data?.edge_type === "control";

/**
 * @param nodeTypes node id → node type, for the nodes on the canvas
 * @param edgeStatus focused-run status of an edge, or undefined before it
 *   reports one
 */
export function findUntakenBranch(
  nodeTypes: ReadonlyMap<string, string | undefined>,
  edges: readonly Edge[],
  edgeStatus: (edgeId: string) => { status: string; counter?: number } | undefined
): UntakenBranch {
  const deadEdges = new Set<string>();
  const outgoing = new Map<string, Edge[]>();
  const incomingCount = new Map<string, number>();
  const deadIncomingCount = new Map<string, number>();
  const queue: string[] = [];

  for (const edge of edges) {
    if (isControlEdge(edge)) {
      continue;
    }
    const list = outgoing.get(edge.source) ?? [];
    list.push(edge);
    outgoing.set(edge.source, list);
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
  }

  const markDead = (edge: Edge): void => {
    if (deadEdges.has(edge.id)) {
      return;
    }
    deadEdges.add(edge.id);
    const dead = (deadIncomingCount.get(edge.target) ?? 0) + 1;
    deadIncomingCount.set(edge.target, dead);
    if (dead === incomingCount.get(edge.target)) {
      queue.push(edge.target);
    }
  };

  for (const edge of edges) {
    if (isControlEdge(edge)) {
      continue;
    }
    if (!BRANCH_NODE_TYPES.has(nodeTypes.get(edge.source) ?? "")) {
      continue;
    }
    const status = edgeStatus(edge.id);
    if (status?.status === "completed" && !status.counter) {
      markDead(edge);
    }
  }

  const deadNodes = new Set<string>();
  for (let index = 0; index < queue.length; index += 1) {
    const nodeId = queue[index];
    if (deadNodes.has(nodeId) || !nodeTypes.has(nodeId)) {
      continue;
    }
    deadNodes.add(nodeId);
    for (const edge of outgoing.get(nodeId) ?? []) {
      markDead(edge);
    }
  }

  if (deadNodes.size === 0 && deadEdges.size === 0) {
    return EMPTY_UNTAKEN_BRANCH;
  }
  return { nodeIds: deadNodes, edgeIds: deadEdges };
}

/** True when both describe the same nodes and edges. */
export function sameUntakenBranch(a: UntakenBranch, b: UntakenBranch): boolean {
  if (a.nodeIds.size !== b.nodeIds.size || a.edgeIds.size !== b.edgeIds.size) {
    return false;
  }
  for (const id of a.nodeIds) {
    if (!b.nodeIds.has(id)) {
      return false;
    }
  }
  for (const id of a.edgeIds) {
    if (!b.edgeIds.has(id)) {
      return false;
    }
  }
  return true;
}
