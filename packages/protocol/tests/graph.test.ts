/**
 * Contract tests for graph types.
 */

import { describe, it, expect } from "vitest";
import type { Edge, NodeDescriptor, GraphData } from "../src/graph.js";
import { isControlEdge, isDataEdge } from "../src/graph.js";

describe("Edge helpers", () => {
  const dataEdge: Edge = {
    id: "e1",
    source: "n1",
    sourceHandle: "output",
    target: "n2",
    targetHandle: "input",
    edge_type: "data",
  };

  const controlEdge: Edge = {
    id: "e2",
    source: "n1",
    sourceHandle: "__control__",
    target: "n2",
    targetHandle: "__control__",
    edge_type: "control",
  };

  const defaultEdge: Edge = {
    source: "n1",
    sourceHandle: "out",
    target: "n2",
    targetHandle: "in",
  };

  it("isControlEdge returns true for control edges", () => {
    expect(isControlEdge(controlEdge)).toBe(true);
    expect(isControlEdge(dataEdge)).toBe(false);
  });

  it("isDataEdge returns true for data edges", () => {
    expect(isDataEdge(dataEdge)).toBe(true);
    expect(isDataEdge(controlEdge)).toBe(false);
  });

  it("edge without edge_type defaults to data (not control)", () => {
    expect(isControlEdge(defaultEdge)).toBe(false);
    expect(isDataEdge(defaultEdge)).toBe(true);
  });
});

describe("NodeDescriptor", () => {
  it("supports minimal descriptor", () => {
    const node: NodeDescriptor = {
      id: "n1",
      type: "math.Add",
    };
    expect(node.id).toBe("n1");
    expect(node.is_streaming_input).toBeUndefined();
    expect(node.sync_mode).toBeUndefined();
  });

  it("supports full descriptor", () => {
    const node: NodeDescriptor = {
      id: "n1",
      type: "math.Add",
      name: "adder",
      properties: { a: 0, b: 0 },
      outputs: { result: "float" },
      is_streaming_input: false,
      is_streaming_output: true,
      sync_mode: "zip_all",
      is_controlled: false,
      is_dynamic: false,
      ui_properties: { x: 1 },
      dynamic_properties: { mode: "fast" },
      dynamic_outputs: { extra: { type: "string" } as any },
    };
    expect(node.sync_mode).toBe("zip_all");
    expect(node.ui_properties).toEqual({ x: 1 });
    expect(node.dynamic_properties).toEqual({ mode: "fast" });
    expect(node.dynamic_outputs).toBeDefined();
  });
});

describe("GraphData", () => {
  it("can represent a simple two-node graph", () => {
    const graph: GraphData = {
      nodes: [
        { id: "n1", type: "input.FloatInput" },
        { id: "n2", type: "output.FloatOutput" },
      ],
      edges: [
        {
          id: "e1",
          source: "n1",
          sourceHandle: "value",
          target: "n2",
          targetHandle: "value",
          edge_type: "data",
        },
      ],
    };
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
  });
});
