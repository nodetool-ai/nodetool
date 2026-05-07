import { describe, expect, it } from "vitest";
import { computeStaleSet } from "../src/staleSet.js";
import type { StaleSetGraph } from "../src/staleSet.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeInputNode(
  id: string,
  paramName: string,
  type = "nodetool.input.StringInput"
) {
  return { id, type, data: { name: paramName, value: "" } };
}

function makeNonInputNode(id: string, type = "nodetool.image.Resize") {
  return { id, type };
}

function makeEdge(source: string, target: string) {
  return { source, target };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("computeStaleSet", () => {
  it("returns an empty set when there are no edits", () => {
    const graph: StaleSetGraph = {
      nodes: [
        makeInputNode("in-1", "prompt"),
        makeInputNode("in-2", "steps")
      ],
      edges: []
    };
    const snapshot = { prompt: "hello", steps: 25 };
    const current = { prompt: "hello", steps: 25 };

    const stale = computeStaleSet(graph, snapshot, current);
    expect(stale.size).toBe(0);
  });

  it("marks a single changed Input* node as dirty", () => {
    const graph: StaleSetGraph = {
      nodes: [
        makeInputNode("in-1", "prompt"),
        makeInputNode("in-2", "steps")
      ],
      edges: []
    };
    const snapshot = { prompt: "hello", steps: 25 };
    const current = { prompt: "world", steps: 25 }; // prompt changed

    const stale = computeStaleSet(graph, snapshot, current);
    expect(stale).toContain("in-1");
    expect(stale).not.toContain("in-2");
  });

  it("marks the dirty Input* node and all its transitive downstream nodes as stale", () => {
    // prompt → resize → output
    const graph: StaleSetGraph = {
      nodes: [
        makeInputNode("in-prompt", "prompt"),
        makeNonInputNode("resize"),
        makeNonInputNode("output")
      ],
      edges: [
        makeEdge("in-prompt", "resize"),
        makeEdge("resize", "output")
      ]
    };
    const snapshot = { prompt: "hello" };
    const current = { prompt: "world" };

    const stale = computeStaleSet(graph, snapshot, current);
    expect(stale).toContain("in-prompt");
    expect(stale).toContain("resize");
    expect(stale).toContain("output");
  });

  it("marks multiple dirty inputs and all transitive dependents", () => {
    // in-prompt → node-a
    // in-steps  → node-b
    // node-a + node-b → output
    const graph: StaleSetGraph = {
      nodes: [
        makeInputNode("in-prompt", "prompt"),
        makeInputNode("in-steps", "steps"),
        makeNonInputNode("node-a"),
        makeNonInputNode("node-b"),
        makeNonInputNode("output")
      ],
      edges: [
        makeEdge("in-prompt", "node-a"),
        makeEdge("in-steps", "node-b"),
        makeEdge("node-a", "output"),
        makeEdge("node-b", "output")
      ]
    };
    const snapshot = { prompt: "hello", steps: 25 };
    const current = { prompt: "world", steps: 50 };

    const stale = computeStaleSet(graph, snapshot, current);
    expect(stale).toContain("in-prompt");
    expect(stale).toContain("in-steps");
    expect(stale).toContain("node-a");
    expect(stale).toContain("node-b");
    expect(stale).toContain("output");
  });

  it("excludes orphan nodes that are not downstream of any dirty Input* node", () => {
    // in-prompt → node-a → output
    // orphan-input (unchanged) → orphan-node  (NOT on the dirty path)
    const graph: StaleSetGraph = {
      nodes: [
        makeInputNode("in-prompt", "prompt"),
        makeNonInputNode("node-a"),
        makeNonInputNode("output"),
        makeInputNode("orphan-input", "seed"),
        makeNonInputNode("orphan-node")
      ],
      edges: [
        makeEdge("in-prompt", "node-a"),
        makeEdge("node-a", "output"),
        makeEdge("orphan-input", "orphan-node")
      ]
    };
    const snapshot = { prompt: "hello", seed: 42 };
    const current = { prompt: "world", seed: 42 }; // only prompt changed

    const stale = computeStaleSet(graph, snapshot, current);
    expect(stale).toContain("in-prompt");
    expect(stale).toContain("node-a");
    expect(stale).toContain("output");
    expect(stale).not.toContain("orphan-input");
    expect(stale).not.toContain("orphan-node");
  });

  it("handles Input* nodes whose name is stored in dynamic_properties", () => {
    const graph: StaleSetGraph = {
      nodes: [
        {
          id: "dyn-1",
          type: "nodetool.input.StringInput",
          dynamic_properties: { name: "caption" }
        }
      ],
      edges: []
    };
    const snapshot = { caption: "old" };
    const current = { caption: "new" };

    const stale = computeStaleSet(graph, snapshot, current);
    expect(stale).toContain("dyn-1");
  });

  it("handles object-typed values by value, not by reference", () => {
    const graph: StaleSetGraph = {
      nodes: [makeInputNode("in-size", "size", "nodetool.input.ImageSizeInput")]
    };
    const snapshot = { size: { width: 512, height: 512 } };
    const current = { size: { width: 512, height: 512 } }; // same value, different object

    const stale = computeStaleSet(graph, snapshot, current);
    expect(stale.size).toBe(0);
  });

  it("marks as dirty when an object-typed value changes", () => {
    const graph: StaleSetGraph = {
      nodes: [makeInputNode("in-size", "size", "nodetool.input.ImageSizeInput")]
    };
    const snapshot = { size: { width: 512, height: 512 } };
    const current = { size: { width: 1024, height: 512 } };

    const stale = computeStaleSet(graph, snapshot, current);
    expect(stale).toContain("in-size");
  });

  it("marks a key present in currentParamOverrides but absent in snapshot as dirty", () => {
    const graph: StaleSetGraph = {
      nodes: [makeInputNode("in-new", "newParam")]
    };
    const snapshot: Record<string, unknown> = {};
    const current = { newParam: "value" };

    const stale = computeStaleSet(graph, snapshot, current);
    expect(stale).toContain("in-new");
  });
});
