/**
 * E2E Legacy Compatibility Tests – LEGACY-001..003
 *
 * Tests for backwards-compatible graph behaviours.
 */

import { describe, it, expect } from "vitest";
import type { NodeDescriptor, Edge } from "@nodetool/protocol";
import { Graph, GraphValidationError } from "../../src/graph.js";
import {
  makeRegistry,
  makeRunner,
  inp,
  nd,
  de,
  Passthrough,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// LEGACY-002: Non-controlled node as "controller" (graph validation succeeds)
// ---------------------------------------------------------------------------

describe("LEGACY-002: Any node can be a controller (graph validation succeeds)", () => {
  it("Passthrough as controller with control edge validates OK", () => {
    const nodes: NodeDescriptor[] = [
      nd("src", "test.Source"),
      nd("ctrl", "test.Passthrough"),
      nd("tgt", "test.Target"),
    ];
    // Control edge from ctrl to tgt
    const edges: Edge[] = [
      {
        source: "ctrl",
        sourceHandle: "__control__",
        target: "tgt",
        targetHandle: "__control__",
        edge_type: "control",
      },
    ];

    // Should NOT throw – any node can have outgoing control edges
    expect(() => new Graph({ nodes, edges }).validate()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// LEGACY-003: Edge without edge_type defaults to data edge
// ---------------------------------------------------------------------------

describe("LEGACY-003: Edge without edge_type treated as data edge", () => {
  it("edge with no edge_type field routes data correctly", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);

    const nodes: NodeDescriptor[] = [
      inp("src", "val"),
      nd("sink", Passthrough.nodeType, { name: "result" }),
    ];
    // No edge_type field → defaults to data edge
    const edges: Edge[] = [
      { source: "src", sourceHandle: "value", target: "sink", targetHandle: "value" },
    ];

    const result = await runner.run(
      { job_id: "legacy-003", params: { val: 55 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    expect(result.outputs["result"]).toContain(55);
  });
});

// ---------------------------------------------------------------------------
// LEGACY-004: Graph with only control edge (no data edges) is valid
// ---------------------------------------------------------------------------

describe("LEGACY-004: Graph with only control edges is structurally valid", () => {
  it("graph with one control edge passes validation", () => {
    const nodes: NodeDescriptor[] = [
      nd("src", "test.Source"),
      nd("tgt", "test.Target"),
    ];
    const edges: Edge[] = [
      {
        source: "src",
        sourceHandle: "__control__",
        target: "tgt",
        targetHandle: "__control__",
        edge_type: "control",
      },
    ];

    expect(() => new Graph({ nodes, edges }).validate()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// LEGACY-005: Control edge with wrong targetHandle fails validation
// ---------------------------------------------------------------------------

describe("LEGACY-005: Control edge with wrong targetHandle is rejected", () => {
  it("control edge with targetHandle != '__control__' throws GraphValidationError", () => {
    const nodes: NodeDescriptor[] = [
      nd("src", "test.Source"),
      nd("tgt", "test.Target"),
    ];
    const edges: Edge[] = [
      {
        source: "src",
        sourceHandle: "__control__",
        target: "tgt",
        targetHandle: "wrong_handle", // invalid
        edge_type: "control",
      },
    ];

    expect(() => new Graph({ nodes, edges }).validate()).toThrow(GraphValidationError);
    expect(() => new Graph({ nodes, edges }).validate()).toThrow(/__control__/);
  });
});
