/**
 * Tests for the runner-shape normalizer (src/normalize-graph.ts) — the boundary
 * every run surface (CLI, server routes, headless job runner) puts a stored or
 * hand-written graph through before the kernel sees it.
 */
import { describe, expect, it } from "vitest";
import { normalizeGraph } from "../src/normalize-graph.js";
import type { RawGraphInput } from "../src/types.js";

describe("normalizeGraph", () => {
  it("moves a node's data bag to properties and prunes editor-only nodes", () => {
    const { nodes, edges } = normalizeGraph({
      nodes: [
        {
          id: "in",
          type: "nodetool.input.StringInput",
          data: { name: "prompt" }
        },
        { id: "c", type: "nodetool.workflows.base_node.Comment" }
      ],
      edges: [{ id: "e1", source: "in", target: "in", sourceHandle: "output" }]
    });
    expect(nodes.map((n) => n.id)).toEqual(["in"]);
    expect(nodes[0].properties).toEqual({ name: "prompt" });
    expect(edges[0].edge_type).toBe("data");
  });

  // `"edges": -1` and `"nodes": {}` are fuzzer mutants of the shipped examples;
  // both used to reach `.filter()` here as a raw TypeError.
  it("rejects edges that are not an array", () => {
    expect(() =>
      normalizeGraph({
        nodes: [{ id: "in", type: "nodetool.input.StringInput" }],
        edges: -1
      } as unknown as RawGraphInput)
    ).toThrow("nodes and edges must be arrays");
  });

  it("rejects nodes that are not an array", () => {
    expect(() =>
      normalizeGraph({ nodes: {}, edges: [] } as unknown as RawGraphInput)
    ).toThrow("nodes and edges must be arrays");
  });
});
