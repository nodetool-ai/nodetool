import { Edge } from "@xyflow/react";

/**
 * Returns true if adding an edge from sourceId -> targetId would introduce a cycle.
 * Checks whether targetId can already reach sourceId through existing edges.
 */
export function wouldCreateCycle(
  edges: Edge[],
  sourceId?: string | null,
  targetId?: string | null
): boolean {
  if (!sourceId || !targetId) {
    return false;
  }
  if (sourceId === targetId) {
    return true;
  }

  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (!edge.source || !edge.target) {
      continue;
    }
    if (!adjacency.has(edge.source)) {
      adjacency.set(edge.source, []);
    }
    adjacency.get(edge.source)!.push(edge.target);
  }

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

