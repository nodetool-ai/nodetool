/**
 * Narrow a runnable graph to the nodes a caller asked for plus everything
 * upstream of them. Nodes on unrelated branches and downstream of the targets
 * are dropped, so a run that wants one output does not execute (or bill) the
 * rest of the graph.
 */
import type { GraphData } from "@nodetool-ai/protocol";

export type NodeSubsetResult =
  | { kind: "graph"; graph: GraphData }
  | { kind: "unknown_nodes"; ids: string[] };

export function selectNodeSubset(
  graph: GraphData,
  nodeIds: readonly string[]
): NodeSubsetResult {
  const known = new Set(graph.nodes.map((n) => n.id));
  const unknown = nodeIds.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    return { kind: "unknown_nodes", ids: unknown };
  }

  const sourcesByTarget = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const sources = sourcesByTarget.get(edge.target);
    if (sources) {
      sources.push(edge.source);
    } else {
      sourcesByTarget.set(edge.target, [edge.source]);
    }
  }

  const keep = new Set<string>();
  const pending = [...nodeIds];
  while (pending.length > 0) {
    const id = pending.pop() as string;
    if (keep.has(id)) {
      continue;
    }
    keep.add(id);
    pending.push(...(sourcesByTarget.get(id) ?? []));
  }

  return {
    kind: "graph",
    graph: {
      nodes: graph.nodes.filter((n) => keep.has(n.id)),
      edges: graph.edges.filter(
        (e) => keep.has(e.source) && keep.has(e.target)
      )
    }
  };
}
