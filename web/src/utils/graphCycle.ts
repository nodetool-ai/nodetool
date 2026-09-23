import { Edge } from "@xyflow/react";
import { isLoopBackEdge, isLoopFeedbackHandle } from "@nodetool-ai/protocol";

/** Resolves a node id to its node type. */
export type NodeTypeLookup = (nodeId: string) => string | null | undefined;

// The store replaces `edges` immutably on any change, so array identity
// safely keys these caches. Loop back edges are left out of the adjacency
// only when a node-type lookup is supplied, so the two views cache apart.
const adjacencyCache = new WeakMap<Edge[], Map<string, string[]>>();
const forwardAdjacencyCache = new WeakMap<Edge[], Map<string, string[]>>();

function getAdjacency(
  edges: Edge[],
  nodeTypeOf?: NodeTypeLookup
): Map<string, string[]> {
  const cache = nodeTypeOf ? forwardAdjacencyCache : adjacencyCache;
  const cached = cache.get(edges);
  if (cached) {
    return cached;
  }

  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (!edge.source || !edge.target) {
      continue;
    }
    if (nodeTypeOf && isLoopBackEdge(edge, nodeTypeOf)) {
      continue;
    }
    if (!adjacency.has(edge.source)) {
      adjacency.set(edge.source, []);
    }
    adjacency.get(edge.source)!.push(edge.target);
  }

  cache.set(edges, adjacency);
  return adjacency;
}

/** Node-type lookup over a node list, for {@link wouldCreateCycle}. */
export function nodeTypeLookup(
  nodes: ReadonlyArray<{ id: string; type?: string }>
): NodeTypeLookup {
  const types = new Map(nodes.map((node) => [node.id, node.type]));
  return (nodeId) => types.get(nodeId);
}

/**
 * Returns true if adding an edge from sourceId -> targetId would introduce a cycle.
 * Checks whether targetId can already reach sourceId through existing edges.
 *
 * With `loop`, a cycle that closes on a Loop node's feedback input (`next`,
 * `condition`) is allowed, and existing back edges are ignored when checking
 * other edges. See docs/workflow-loops.md.
 */
export function wouldCreateCycle(
  edges: Edge[],
  sourceId?: string | null,
  targetId?: string | null,
  loop?: { targetHandle?: string | null; nodeTypeOf: NodeTypeLookup }
): boolean {
  if (!sourceId || !targetId) {
    return false;
  }
  if (sourceId === targetId) {
    return true;
  }
  if (
    loop &&
    isLoopFeedbackHandle(loop.nodeTypeOf(targetId), loop.targetHandle)
  ) {
    return false;
  }

  const adjacency = getAdjacency(edges, loop?.nodeTypeOf);

  const stack: string[] = [targetId];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === sourceId) {
      return true;
    }
    if (visited.has(node)) {
      continue;
    }
    visited.add(node);
    const neighbors = adjacency.get(node);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          stack.push(neighbor);
        }
      }
    }
  }

  return false;
}
