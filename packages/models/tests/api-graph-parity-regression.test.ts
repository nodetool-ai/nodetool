/**
 * Regression tests for Python API graph transport parity.
 *
 * These lock in metadata fields that must survive TS serialization because
 * Python includes them in the serialized graph node shape.
 */

import { describe, it, expect } from "vitest";
import { toApiNode, toApiGraph } from "../src/api-graph.js";
import type { NodeDescriptor, GraphData } from "@nodetool/protocol";

describe("Python parity — API graph node serialization", () => {
  it("preserves ui/dynamic metadata and sync_mode on ApiNode", () => {
    const node: NodeDescriptor = {
      id: "router",
      type: "test.Router",
      parent_id: "group-1",
      properties: { prompt: "hello" },
      ui_properties: { x: 10, y: 20 },
      dynamic_properties: { model: "gpt" },
      dynamic_outputs: { branch_a: { type: "string" } as any },
      sync_mode: "zip_all",
    };

    expect(toApiNode(node)).toEqual({
      id: "router",
      parent_id: "group-1",
      type: "test.Router",
      data: { prompt: "hello" },
      ui_properties: { x: 10, y: 20 },
      dynamic_properties: { model: "gpt" },
      dynamic_outputs: { branch_a: { type: "string" } },
      sync_mode: "zip_all",
    });
  });

  it("applies Python-compatible defaults for omitted metadata fields", () => {
    expect(
      toApiNode({
        id: "plain",
        type: "test.Plain",
      }),
    ).toEqual({
      id: "plain",
      parent_id: null,
      type: "test.Plain",
      data: {},
      ui_properties: {},
      dynamic_properties: {},
      dynamic_outputs: {},
      sync_mode: "on_any",
    });
  });

  it("preserves metadata across full graph conversion", () => {
    const graph: GraphData = {
      nodes: [
        {
          id: "n1",
          type: "test.Dynamic",
          properties: { seed: 1 },
          ui_properties: { collapsed: false },
          dynamic_properties: { provider: "openai" },
          dynamic_outputs: { extra: { type: "number" } as any },
        },
      ],
      edges: [],
    };

    const apiGraph = toApiGraph(graph);
    expect(apiGraph.nodes[0]).toMatchObject({
      id: "n1",
      ui_properties: { collapsed: false },
      dynamic_properties: { provider: "openai" },
      dynamic_outputs: { extra: { type: "number" } },
      sync_mode: "on_any",
    });
  });
});
