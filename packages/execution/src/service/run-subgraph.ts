import type { GraphData } from "@nodetool-ai/protocol";

export type RunSubgraphResult =
  | { ok: true; graph: GraphData }
  | { ok: false; unknown: string[] };

/**
 * The part of `graph` needed to run `targetIds`: the targets plus every node
 * upstream of them, over data and control edges. Nodes nothing in the selection
 * depends on are dropped, so their providers are never called.
 *
 * Unknown ids are reported rather than ignored. A typo would otherwise run an
 * empty graph and read as a success.
 */
export function selectRunSubgraph(
  graph: GraphData,
  targetIds: readonly string[]
): RunSubgraphResult {
  const known = new Set(graph.nodes.map((n) => n.id));
  const unknown = targetIds.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    return { ok: false, unknown };
  }

  const inbound = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const sources = inbound.get(edge.target);
    if (sources) sources.push(edge.source);
    else inbound.set(edge.target, [edge.source]);
  }

  const included = new Set<string>(targetIds);
  const stack = [...included];
  while (stack.length > 0) {
    for (const source of inbound.get(stack.pop()!) ?? []) {
      if (!included.has(source)) {
        included.add(source);
        stack.push(source);
      }
    }
  }

  return {
    ok: true,
    graph: {
      nodes: graph.nodes.filter((n) => included.has(n.id)),
      edges: graph.edges.filter(
        (e) => included.has(e.source) && included.has(e.target)
      )
    }
  };
}
