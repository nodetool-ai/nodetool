import { describe, expect, it } from "vitest";
import type { GraphData } from "@nodetool-ai/protocol";
import { selectNodeSubset } from "../src/node-subset.js";

// a → b → c, a → d (d is a sibling branch), e is disconnected.
const graph = {
  nodes: ["a", "b", "c", "d", "e"].map((id) => ({ id, type: "t" })),
  edges: [
    { source: "a", target: "b", sourceHandle: "o", targetHandle: "i" },
    { source: "b", target: "c", sourceHandle: "o", targetHandle: "i" },
    { source: "a", target: "d", sourceHandle: "o", targetHandle: "i" }
  ]
} as unknown as GraphData;

describe("selectNodeSubset", () => {
  it("keeps the target and its ancestors, drops branches and downstream", () => {
    const result = selectNodeSubset(graph, ["b"]);
    expect(result.kind).toBe("graph");
    if (result.kind !== "graph") return;
    expect(result.graph.nodes.map((n) => n.id).sort()).toEqual(["a", "b"]);
    expect(result.graph.edges).toHaveLength(1);
  });

  it("unions several targets", () => {
    const result = selectNodeSubset(graph, ["c", "e"]);
    if (result.kind !== "graph") throw new Error("expected graph");
    expect(result.graph.nodes.map((n) => n.id).sort()).toEqual([
      "a",
      "b",
      "c",
      "e"
    ]);
  });

  it("reports unknown ids", () => {
    expect(selectNodeSubset(graph, ["b", "zzz"])).toEqual({
      kind: "unknown_nodes",
      ids: ["zzz"]
    });
  });
});
