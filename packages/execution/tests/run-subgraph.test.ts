import { describe, expect, it } from "vitest";
import type { GraphData } from "@nodetool-ai/protocol";
import { selectRunSubgraph } from "../src/service/run-subgraph.js";

const node = (id: string) => ({ id, type: "test.Node", properties: {} });
const edge = (source: string, target: string, edge_type: "data" | "control" = "data") => ({
  source,
  target,
  sourceHandle: "output",
  targetHandle: "value",
  edge_type
});

// a -> b -> c, a -> d, e -> d, f (isolated), g --control--> c
const graph: GraphData = {
  nodes: ["a", "b", "c", "d", "e", "f", "g"].map(node),
  edges: [
    edge("a", "b"),
    edge("b", "c"),
    edge("a", "d"),
    edge("e", "d"),
    edge("g", "c", "control")
  ]
};

const ids = (g: GraphData) => g.nodes.map((n) => n.id).sort();

describe("selectRunSubgraph", () => {
  it("keeps the target and everything upstream, including control sources", () => {
    const result = selectRunSubgraph(graph, ["c"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ids(result.graph)).toEqual(["a", "b", "c", "g"]);
    expect(result.graph.edges).toHaveLength(3);
  });

  it("drops downstream and unrelated nodes", () => {
    const result = selectRunSubgraph(graph, ["b"]);
    if (!result.ok) throw new Error("expected ok");
    expect(ids(result.graph)).toEqual(["a", "b"]);
  });

  it("unions several targets", () => {
    const result = selectRunSubgraph(graph, ["b", "f"]);
    if (!result.ok) throw new Error("expected ok");
    expect(ids(result.graph)).toEqual(["a", "b", "f"]);
  });

  it("reports unknown ids instead of running an empty graph", () => {
    const result = selectRunSubgraph(graph, ["c", "nope"]);
    expect(result).toEqual({ ok: false, unknown: ["nope"] });
  });
});
