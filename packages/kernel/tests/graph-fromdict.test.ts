/**
 * Tests for T-K-14: Graph.fromDict.
 */
import { describe, it, expect } from "vitest";
import { Graph, GraphValidationError } from "../src/graph.js";

describe("T-K-14: Graph.fromDict", () => {
  it("creates graph from valid dict", () => {
    const graph = Graph.fromDict({
      nodes: [
        { id: "n1", type: "test.Add" },
        { id: "n2", type: "test.Mul" },
      ],
      edges: [
        { source: "n1", sourceHandle: "output", target: "n2", targetHandle: "a" },
      ],
    });
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
    expect(graph.findNode("n1")).toBeDefined();
    expect(graph.findNode("n2")).toBeDefined();
  });

  it("creates graph with empty nodes and edges", () => {
    const graph = Graph.fromDict({ nodes: [], edges: [] });
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
  });

  it("throws on missing nodes field", () => {
    expect(() => Graph.fromDict({} as any)).toThrow(GraphValidationError);
  });

  it("throws on missing edges field", () => {
    expect(() => Graph.fromDict({ nodes: [] } as any)).toThrow(GraphValidationError);
  });

  it("throws when nodes is not an array", () => {
    expect(() => Graph.fromDict({ nodes: "bad", edges: [] } as any)).toThrow(GraphValidationError);
  });

  it("throws when edges is not an array", () => {
    expect(() => Graph.fromDict({ nodes: [], edges: "bad" } as any)).toThrow(GraphValidationError);
  });

  it("preserves node properties", () => {
    const graph = Graph.fromDict({
      nodes: [
        {
          id: "n1",
          type: "test.Node",
          name: "my_node",
          is_streaming_output: true,
          outputs: { result: "int" },
        },
      ],
      edges: [],
    });
    const node = graph.findNode("n1");
    expect(node?.name).toBe("my_node");
    expect(node?.is_streaming_output).toBe(true);
    expect(node?.outputs?.result).toBe("int");
  });

  it("maps API graph data to kernel properties", () => {
    const graph = Graph.fromDict({
      nodes: [
        {
          id: "n1",
          type: "test.Node",
          data: { value: 42, label: "x" },
        },
      ],
      edges: [],
    });
    expect(graph.findNode("n1")?.properties).toEqual({ value: 42, label: "x" });
  });

  it("filters connected properties from incoming API graph data by default", () => {
    const graph = Graph.fromDict({
      nodes: [
        { id: "src", type: "test.Source", data: { out: 1 } },
        { id: "dst", type: "test.Target", data: { value: 42, keep: true } },
      ],
      edges: [
        { source: "src", sourceHandle: "out", target: "dst", targetHandle: "value" },
      ],
    });
    expect(graph.findNode("dst")?.properties).toEqual({ keep: true });
  });

  it("skips malformed edges by default", () => {
    const graph = Graph.fromDict({
      nodes: [
        { id: "n1", type: "test.A" },
        { id: "n2", type: "test.B" },
      ],
      edges: [
        { source: "n1", sourceHandle: "out", target: "n2", targetHandle: "in" },
        { source: "n1", target: "n2" },
      ],
    });
    expect(graph.edges).toHaveLength(1);
  });

  it("skips dangling edges by default", () => {
    const graph = Graph.fromDict({
      nodes: [{ id: "n1", type: "test.A" }],
      edges: [
        { source: "n1", sourceHandle: "out", target: "ghost", targetHandle: "in" },
      ],
    });
    expect(graph.edges).toHaveLength(0);
  });

  it("throws on malformed edges when skipErrors is false", () => {
    expect(() =>
      Graph.fromDict(
        {
          nodes: [
            { id: "n1", type: "test.A" },
            { id: "n2", type: "test.B" },
          ],
          edges: [{ source: "n1", target: "n2" }],
        },
        { skipErrors: false },
      ),
    ).toThrow(GraphValidationError);
  });

  it("drops unrecognized node types when skipErrors is true and a validator is provided", () => {
    const graph = Graph.fromDict(
      {
        nodes: [
          { id: "ok", type: "test.Allowed" },
          { id: "bad", type: "test.Unknown" },
        ],
        edges: [
          { source: "ok", sourceHandle: "out", target: "bad", targetHandle: "in" },
          { source: "bad", sourceHandle: "out", target: "ok", targetHandle: "in" },
        ],
      },
      {
        validateNodeType: (nodeType) => nodeType === "test.Allowed",
        skipErrors: true,
      },
    );
    expect(graph.nodes.map((node) => node.id)).toEqual(["ok"]);
    expect(graph.edges).toEqual([]);
  });

  it("throws on unrecognized node types when skipErrors is false and a validator is provided", () => {
    expect(() =>
      Graph.fromDict(
        {
          nodes: [{ id: "bad", type: "test.Unknown" }],
          edges: [],
        },
        {
          validateNodeType: (nodeType) => nodeType !== "test.Unknown",
          skipErrors: false,
        },
      ),
    ).toThrow("Invalid node type");
  });

  it("strips undefined properties when skipErrors is true and allowUndefinedProperties is false", () => {
    const graph = Graph.fromDict(
      {
        nodes: [
          {
            id: "n1",
            type: "test.Node",
            propertyTypes: { allowed: "string" },
            data: { allowed: "ok", deprecated: "remove-me" },
          },
        ],
        edges: [],
      },
      { allowUndefinedProperties: false, skipErrors: true },
    );
    expect(graph.findNode("n1")?.properties).toEqual({ allowed: "ok" });
  });

  it("throws on undefined properties when allowUndefinedProperties is false", () => {
    expect(() =>
      Graph.fromDict(
        {
          nodes: [
            {
              id: "n1",
              type: "test.Node",
              propertyTypes: { allowed: "string" },
              data: { allowed: "ok", deprecated: "boom" },
            },
          ],
          edges: [],
        },
        { allowUndefinedProperties: false, skipErrors: false },
      ),
    ).toThrow("Property deprecated does not exist");
  });

  it("preserves edge properties", () => {
    const graph = Graph.fromDict({
      nodes: [
        { id: "n1", type: "test.A" },
        { id: "n2", type: "test.B" },
      ],
      edges: [
        {
          id: "e1",
          source: "n1",
          sourceHandle: "out",
          target: "n2",
          targetHandle: "in",
          edge_type: "control",
        },
      ],
    });
    expect(graph.edges[0].id).toBe("e1");
    expect(graph.edges[0].edge_type).toBe("control");
  });
});
