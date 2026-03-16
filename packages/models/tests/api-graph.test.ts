/**
 * Tests for T-MSG-6: API graph representation.
 */
import { describe, it, expect } from "vitest";
import {
  toApiNode,
  toApiEdge,
  toApiGraph,
  removeConnectedSlots,
  type ApiGraph,
} from "../src/api-graph.js";
import type { Edge, GraphData, NodeDescriptor } from "@nodetool/protocol";

// ---------------------------------------------------------------------------
// toApiNode
// ---------------------------------------------------------------------------

describe("toApiNode", () => {
  it("converts a NodeDescriptor stripping runtime fields", () => {
    const node: NodeDescriptor = {
      id: "n1",
      type: "test.Add",
      name: "Add",
      properties: { a: 1, b: 2 },
      outputs: { result: "number" },
      is_streaming_input: false,
      is_streaming_output: false,
      sync_mode: "zip_all",
      is_controlled: false,
      is_dynamic: false,
      parent_id: "parent-1",
      ui_properties: { x: 10, y: 20 },
      dynamic_properties: { extra: "value" },
      dynamic_outputs: { alt: { type: "string" } as any },
    };
    const api = toApiNode(node);
    expect(api).toEqual({
      id: "n1",
      parent_id: "parent-1",
      type: "test.Add",
      data: { a: 1, b: 2 },
      ui_properties: { x: 10, y: 20 },
      dynamic_properties: { extra: "value" },
      dynamic_outputs: { alt: { type: "string" } },
      sync_mode: "zip_all",
    });
    // Runtime fields should NOT be present
    expect((api as Record<string, unknown>).outputs).toBeUndefined();
    expect((api as Record<string, unknown>).is_streaming_output).toBeUndefined();
  });

  it("defaults data to empty object when properties is undefined", () => {
    const node: NodeDescriptor = { id: "n2", type: "test.Noop" };
    const api = toApiNode(node);
    expect(api.data).toEqual({});
  });

  it("defaults parent_id to null when not set", () => {
    const node: NodeDescriptor = { id: "n3", type: "test.X" };
    expect(toApiNode(node).parent_id).toBeNull();
  });

  it("defaults optional API graph node fields to Python-compatible empty values", () => {
    const node: NodeDescriptor = { id: "n4", type: "test.Empty" };
    expect(toApiNode(node)).toEqual({
      id: "n4",
      parent_id: null,
      type: "test.Empty",
      data: {},
      ui_properties: {},
      dynamic_properties: {},
      dynamic_outputs: {},
      sync_mode: "on_any",
    });
  });
});

// ---------------------------------------------------------------------------
// toApiEdge
// ---------------------------------------------------------------------------

describe("toApiEdge", () => {
  it("converts a protocol Edge", () => {
    const edge: Edge = {
      id: "e1",
      source: "n1",
      sourceHandle: "result",
      target: "n2",
      targetHandle: "a",
      ui_properties: { color: "red" },
      edge_type: "data",
    };
    const api = toApiEdge(edge);
    expect(api).toEqual({
      id: "e1",
      source: "n1",
      sourceHandle: "result",
      target: "n2",
      targetHandle: "a",
      ui_properties: { color: "red" },
      edge_type: "data",
    });
  });

  it("defaults edge_type to data and id/ui_properties to null", () => {
    const edge: Edge = {
      source: "n1",
      sourceHandle: "out",
      target: "n2",
      targetHandle: "in",
    };
    const api = toApiEdge(edge);
    expect(api.id).toBeNull();
    expect(api.ui_properties).toBeNull();
    expect(api.edge_type).toBe("data");
  });

  it("preserves control edge type", () => {
    const edge: Edge = {
      source: "n1",
      sourceHandle: "__control__",
      target: "n2",
      targetHandle: "__control__",
      edge_type: "control",
    };
    expect(toApiEdge(edge).edge_type).toBe("control");
  });
});

// ---------------------------------------------------------------------------
// toApiGraph
// ---------------------------------------------------------------------------

describe("toApiGraph", () => {
  it("converts a full GraphData", () => {
    const graph: GraphData = {
      nodes: [
        { id: "a", type: "test.A", properties: { x: 10 } },
        { id: "b", type: "test.B" },
      ],
      edges: [
        { source: "a", sourceHandle: "out", target: "b", targetHandle: "in" },
      ],
    };
    const api = toApiGraph(graph);
    expect(api.nodes).toHaveLength(2);
    expect(api.edges).toHaveLength(1);
    expect(api.nodes[0].data).toEqual({ x: 10 });
    expect(api.nodes[1].data).toEqual({});
  });

  it("handles empty graph", () => {
    const api = toApiGraph({ nodes: [], edges: [] });
    expect(api.nodes).toEqual([]);
    expect(api.edges).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// removeConnectedSlots
// ---------------------------------------------------------------------------

describe("removeConnectedSlots", () => {
  it("removes data keys that have incoming edges", () => {
    const graph: ApiGraph = {
      nodes: [
        { id: "n1", type: "test.A", data: { out: 1 } },
        { id: "n2", type: "test.B", data: { a: 10, b: 20 } },
      ],
      edges: [
        { source: "n1", sourceHandle: "out", target: "n2", targetHandle: "a" },
      ],
    };
    const cleaned = removeConnectedSlots(graph);
    // n2.data.a should be removed (connected via edge), b should remain
    expect(cleaned.nodes[1].data).toEqual({ b: 20 });
    // n1 should be unchanged
    expect(cleaned.nodes[0].data).toEqual({ out: 1 });
  });

  it("handles nodes with no incoming edges", () => {
    const graph: ApiGraph = {
      nodes: [{ id: "n1", type: "test.A", data: { x: 1 } }],
      edges: [],
    };
    const cleaned = removeConnectedSlots(graph);
    expect(cleaned.nodes[0].data).toEqual({ x: 1 });
  });

  it("does not mutate the original graph", () => {
    const original: ApiGraph = {
      nodes: [
        { id: "n1", type: "test.A", data: { out: 1 } },
        { id: "n2", type: "test.B", data: { a: 10 } },
      ],
      edges: [
        { source: "n1", sourceHandle: "out", target: "n2", targetHandle: "a" },
      ],
    };
    removeConnectedSlots(original);
    // Original should be unchanged
    expect(original.nodes[1].data).toEqual({ a: 10 });
  });

  it("removes multiple connected slots on same node", () => {
    const graph: ApiGraph = {
      nodes: [
        { id: "n1", type: "test.A", data: {} },
        { id: "n2", type: "test.A", data: {} },
        { id: "n3", type: "test.B", data: { a: 1, b: 2, c: 3 } },
      ],
      edges: [
        { source: "n1", sourceHandle: "out", target: "n3", targetHandle: "a" },
        { source: "n2", sourceHandle: "out", target: "n3", targetHandle: "b" },
      ],
    };
    const cleaned = removeConnectedSlots(graph);
    expect(cleaned.nodes[2].data).toEqual({ c: 3 });
  });

  it("two edges to same targetHandle removes slot only once (no crash)", () => {
    const graph: ApiGraph = {
      nodes: [
        { id: "n1", type: "test.A", data: {} },
        { id: "n2", type: "test.A", data: {} },
        { id: "n3", type: "test.B", data: { a: 99, b: 42 } },
      ],
      edges: [
        { source: "n1", sourceHandle: "out", target: "n3", targetHandle: "a" },
        { source: "n2", sourceHandle: "out", target: "n3", targetHandle: "a" },
      ],
    };
    const cleaned = removeConnectedSlots(graph);
    expect(cleaned.nodes[2].data).toEqual({ b: 42 });
    expect("a" in cleaned.nodes[2].data).toBe(false);
  });

  it("edge targets handle that does not exist in data — no crash", () => {
    const graph: ApiGraph = {
      nodes: [
        { id: "n1", type: "test.A", data: {} },
        { id: "n2", type: "test.B", data: { x: 1 } },
      ],
      edges: [
        { source: "n1", sourceHandle: "out", target: "n2", targetHandle: "nonexistent" },
      ],
    };
    const cleaned = removeConnectedSlots(graph);
    // x should remain, and no crash from deleting nonexistent key
    expect(cleaned.nodes[1].data).toEqual({ x: 1 });
  });

  it("preserves edge array reference in output", () => {
    const graph: ApiGraph = {
      nodes: [
        { id: "n1", type: "test.A", data: { out: 1 } },
        { id: "n2", type: "test.B", data: { a: 10 } },
      ],
      edges: [
        { source: "n1", sourceHandle: "out", target: "n2", targetHandle: "a" },
      ],
    };
    const cleaned = removeConnectedSlots(graph);
    // edges should be same reference (not cloned)
    expect(cleaned.edges).toBe(graph.edges);
  });
});

// ---------------------------------------------------------------------------
// Additional toApiNode tests
// ---------------------------------------------------------------------------

describe("toApiNode — additional coverage", () => {
  it("preserves ui_properties on ApiNode", () => {
    const node: NodeDescriptor = {
      id: "n-ui",
      type: "test.UI",
      name: "UINode",
      properties: { color: "red" },
      ui_properties: { x: 100, y: 200 },
    };
    const api = toApiNode(node);
    expect(api.id).toBe("n-ui");
    expect(api.type).toBe("test.UI");
    expect(api.data).toEqual({ color: "red" });
    expect(api.ui_properties).toEqual({ x: 100, y: 200 });
  });

  it("preserves complex nested data in properties", () => {
    const node: NodeDescriptor = {
      id: "n-complex",
      type: "test.Complex",
      properties: {
        nested: { deep: { value: 42 } },
        list: [1, "two", null, { three: 3 }],
        nullVal: null,
        emptyObj: {},
      },
    };
    const api = toApiNode(node);
    expect(api.data).toEqual({
      nested: { deep: { value: 42 } },
      list: [1, "two", null, { three: 3 }],
      nullVal: null,
      emptyObj: {},
    });
  });
});

// ---------------------------------------------------------------------------
// Additional toApiEdge tests
// ---------------------------------------------------------------------------

describe("toApiEdge — additional coverage", () => {
  it("converts control edge with explicit id", () => {
    const edge: Edge = {
      id: "ctrl-1",
      source: "n1",
      sourceHandle: "__control__",
      target: "n2",
      targetHandle: "__control__",
      edge_type: "control",
    };
    const api = toApiEdge(edge);
    expect(api.id).toBe("ctrl-1");
    expect(api.edge_type).toBe("control");
    expect(api.source).toBe("n1");
  });

  it("preserves all fields without data loss", () => {
    const edge: Edge = {
      id: "e-full",
      source: "src-node",
      sourceHandle: "output",
      target: "tgt-node",
      targetHandle: "input",
      ui_properties: { label: "my-edge", stroke: "blue" },
      edge_type: "data",
    };
    const api = toApiEdge(edge);
    expect(api.id).toBe("e-full");
    expect(api.source).toBe("src-node");
    expect(api.sourceHandle).toBe("output");
    expect(api.target).toBe("tgt-node");
    expect(api.targetHandle).toBe("input");
    expect(api.ui_properties).toEqual({ label: "my-edge", stroke: "blue" });
    expect(api.edge_type).toBe("data");
  });
});

// ---------------------------------------------------------------------------
// Additional toApiGraph tests
// ---------------------------------------------------------------------------

describe("toApiGraph — additional coverage", () => {
  it("converts a large graph (10+ nodes and edges)", () => {
    const nodes: NodeDescriptor[] = [];
    const edges: Edge[] = [];
    for (let i = 0; i < 12; i++) {
      nodes.push({ id: `n${i}`, type: `test.Node${i}`, properties: { idx: i } });
    }
    for (let i = 0; i < 11; i++) {
      edges.push({
        source: `n${i}`,
        sourceHandle: "out",
        target: `n${i + 1}`,
        targetHandle: "in",
      });
    }
    const api = toApiGraph({ nodes, edges });
    expect(api.nodes).toHaveLength(12);
    expect(api.edges).toHaveLength(11);
    // Verify all nodes converted
    for (let i = 0; i < 12; i++) {
      expect(api.nodes[i].id).toBe(`n${i}`);
      expect(api.nodes[i].data).toEqual({ idx: i });
    }
  });

  it("is idempotent — calling twice on same input produces same output", () => {
    const graph: GraphData = {
      nodes: [
        { id: "a", type: "test.A", properties: { x: 10 } },
        { id: "b", type: "test.B", properties: { y: 20 } },
      ],
      edges: [
        { source: "a", sourceHandle: "out", target: "b", targetHandle: "in" },
      ],
    };
    const api1 = toApiGraph(graph);
    const api2 = toApiGraph(graph);
    expect(api1).toEqual(api2);
  });
});
