/**
 * Graph shape helpers shared by the app-debug target resolvers.
 *
 * A graph reaches the simulator in one of two shapes: the editor's ReactFlow
 * JSON, whose node props live under `data`, or the kernel's runner shape, whose
 * props live under `properties`. Every target resolver normalizes to the latter
 * so the simulator reads one shape.
 */
import type { DebugGraph } from "../debug/types.js";

/** ReactFlow `node.data` → kernel `node.properties`. */
export function normalizeDebugGraph(graph: DebugGraph): DebugGraph {
  return {
    nodes: (graph.nodes ?? []).map((node) => {
      if (node.properties !== undefined || node.data === undefined) return node;
      const { data, ...rest } = node;
      return { ...rest, properties: data };
    }),
    edges: graph.edges ?? []
  };
}

/** A value's graph, normalized — or null when it has no node/edge arrays. */
export function debugGraphOf(value: unknown): DebugGraph | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const graph = value as DebugGraph;
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return null;
  return normalizeDebugGraph(graph);
}
