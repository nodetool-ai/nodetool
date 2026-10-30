/**
 * Tests for the debug/validate target resolver (src/debug/target.ts) — the
 * shape checks every file, DSL and database target passes through before the
 * harness treats it as a graph.
 */
import { describe, expect, it } from "vitest";
import { resolveTarget } from "../src/debug/target.js";
import type { DebugGraph } from "../src/debug/types.js";

const loader = (graph: unknown) => async () => ({ graph: graph as DebugGraph });

describe("resolveTarget", () => {
  it("normalizes a node's data bag into properties", async () => {
    const resolved = await resolveTarget(
      "wf-1",
      loader({
        nodes: [
          {
            id: "in",
            type: "nodetool.input.StringInput",
            data: { name: "prompt" }
          }
        ],
        edges: []
      })
    );
    expect(resolved.graph.nodes[0].properties).toEqual({ name: "prompt" });
    expect(resolved.info.nodeCount).toBe(1);
  });

  // A truthy `nodes`/`edges` used to pass the presence check and reach `.map()`
  // as a raw TypeError. Both literals come from fuzzer mutants of the shipped
  // examples.
  it("rejects nodes that are not an array", async () => {
    await expect(
      resolveTarget("wf-1", loader({ nodes: true, edges: [] }))
    ).rejects.toThrow("nodes and edges must be arrays");
  });

  it("rejects edges that are not an array", async () => {
    await expect(
      resolveTarget(
        "wf-1",
        loader({
          nodes: [{ id: "in", type: "nodetool.input.StringInput" }],
          edges: -1
        })
      )
    ).rejects.toThrow("nodes and edges must be arrays");
  });

  it("rejects a document with no graph at all", async () => {
    await expect(
      resolveTarget("wf-1", loader({ name: "not a workflow" }))
    ).rejects.toThrow("missing nodes or edges");
  });
});
