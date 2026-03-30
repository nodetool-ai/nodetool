/**
 * Graph model tests.
 *
 * Covers:
 *  - Node/edge lookup
 *  - Topological sort
 *  - Edge validation
 *  - Control edge validation and cycle detection
 *  - Streaming upstream detection
 */

import { describe, it, expect } from "vitest";
import { Graph, GraphValidationError } from "../src/graph.js";
import type { NodeDescriptor, Edge } from "@nodetool/protocol";

function makeNode(id: string, overrides: Partial<NodeDescriptor> = {}): NodeDescriptor {
  return { id, type: `test.${id}`, ...overrides };
}

function makeEdge(
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
  overrides: Partial<Edge> = {}
): Edge {
  return { source, sourceHandle, target, targetHandle, ...overrides };
}

// ---------------------------------------------------------------------------

describe("Graph – lookups", () => {
  const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
  const edges = [
    makeEdge("a", "out", "b", "in"),
    makeEdge("b", "out", "c", "in"),
  ];
  const graph = new Graph({ nodes, edges });

  it("findNode returns node by id", () => {
    expect(graph.findNode("a")?.id).toBe("a");
    expect(graph.findNode("unknown")).toBeUndefined();
  });

  it("findIncomingEdges returns edges targeting a node", () => {
    expect(graph.findIncomingEdges("b")).toHaveLength(1);
    expect(graph.findIncomingEdges("b")[0].source).toBe("a");
  });

  it("findOutgoingEdges returns edges from a node", () => {
    expect(graph.findOutgoingEdges("a")).toHaveLength(1);
    expect(graph.findOutgoingEdges("a")[0].target).toBe("b");
  });

  it("findDataEdges excludes control edges", () => {
    const nodes2 = [makeNode("x"), makeNode("y")];
    const edges2 = [
      makeEdge("x", "out", "y", "in"),
      makeEdge("x", "__control__", "y", "__control__", { edge_type: "control" }),
    ];
    const g2 = new Graph({ nodes: nodes2, edges: edges2 });
    expect(g2.findDataEdges("y")).toHaveLength(1);
    expect(g2.findIncomingEdges("y")).toHaveLength(2);
  });
});

describe("Graph – input/output nodes", () => {
  it("identifies input nodes (no incoming data edges)", () => {
    const nodes = [makeNode("in"), makeNode("mid"), makeNode("out")];
    const edges = [
      makeEdge("in", "out", "mid", "in"),
      makeEdge("mid", "out", "out", "in"),
    ];
    const graph = new Graph({ nodes, edges });
    const inputs = graph.inputNodes();
    expect(inputs).toHaveLength(1);
    expect(inputs[0].id).toBe("in");
  });

  it("identifies output nodes (no outgoing data edges)", () => {
    const nodes = [makeNode("in"), makeNode("out")];
    const edges = [makeEdge("in", "out", "out", "in")];
    const graph = new Graph({ nodes, edges });
    expect(graph.outputNodes()).toHaveLength(1);
    expect(graph.outputNodes()[0].id).toBe("out");
  });
});

describe("Graph – topological sort", () => {
  it("returns nodes in dependency order", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
    const edges = [
      makeEdge("a", "out", "b", "in"),
      makeEdge("b", "out", "c", "in"),
    ];
    const graph = new Graph({ nodes, edges });
    const levels = graph.topologicalSort();
    expect(levels).toHaveLength(3);
    expect(levels[0][0].id).toBe("a");
    expect(levels[1][0].id).toBe("b");
    expect(levels[2][0].id).toBe("c");
  });

  it("groups parallel nodes into same level", () => {
    const nodes = [makeNode("a"), makeNode("b1"), makeNode("b2"), makeNode("c")];
    const edges = [
      makeEdge("a", "out", "b1", "in"),
      makeEdge("a", "out", "b2", "in"),
      makeEdge("b1", "out", "c", "in1"),
      makeEdge("b2", "out", "c", "in2"),
    ];
    const graph = new Graph({ nodes, edges });
    const levels = graph.topologicalSort();
    expect(levels).toHaveLength(3);
    expect(levels[1]).toHaveLength(2); // b1, b2 in parallel
  });

  it("returns partial ordering for cycles instead of throwing", () => {
    const nodes = [makeNode("a"), makeNode("b")];
    const edges = [
      makeEdge("a", "out", "b", "in"),
      makeEdge("b", "out", "a", "in"),
    ];
    const graph = new Graph({ nodes, edges });
    expect(graph.topologicalSort()).toEqual([]);
  });

  it("filters to nodes matching parent_id", () => {
    const nodes = [
      makeNode("top", { parent_id: null }),
      makeNode("child1", { parent_id: "group1" }),
      makeNode("child2", { parent_id: "group1" }),
      makeNode("other", { parent_id: "group2" }),
    ];
    const edges = [makeEdge("child1", "out", "child2", "in")];
    const graph = new Graph({ nodes, edges });
    const levels = graph.topologicalSort("group1");
    expect(levels).toHaveLength(2);
    expect(levels[0][0].id).toBe("child1");
    expect(levels[1][0].id).toBe("child2");
  });
});

describe("Graph – validation", () => {
  it("rejects edge referencing non-existent source", () => {
    const nodes = [makeNode("a")];
    const edges = [makeEdge("missing", "out", "a", "in")];
    const graph = new Graph({ nodes, edges });
    expect(() => graph.validate()).toThrow("unknown source");
  });

  it("rejects edge referencing non-existent target", () => {
    const nodes = [makeNode("a")];
    const edges = [makeEdge("a", "out", "missing", "in")];
    const graph = new Graph({ nodes, edges });
    expect(() => graph.validate()).toThrow("unknown target");
  });

  it("rejects control edge with wrong target handle", () => {
    const nodes = [makeNode("a"), makeNode("b")];
    const edges = [
      makeEdge("a", "__control__", "b", "wrong_handle", { edge_type: "control" }),
    ];
    const graph = new Graph({ nodes, edges });
    expect(() => graph.validate()).toThrow("__control__");
  });

  it("accepts valid control edge", () => {
    const nodes = [makeNode("a"), makeNode("b")];
    const edges = [
      makeEdge("a", "__control__", "b", "__control__", { edge_type: "control" }),
    ];
    const graph = new Graph({ nodes, edges });
    expect(() => graph.validate()).not.toThrow();
  });

  it("rejects cycle in control edges", () => {
    const nodes = [makeNode("a"), makeNode("b")];
    const edges = [
      makeEdge("a", "__control__", "b", "__control__", { edge_type: "control" }),
      makeEdge("b", "__control__", "a", "__control__", { edge_type: "control" }),
    ];
    const graph = new Graph({ nodes, edges });
    expect(() => graph.validate()).toThrow("cycle");
  });
});

describe("Graph – streaming upstream", () => {
  it("detects downstream of streaming-output node", () => {
    const nodes = [
      makeNode("src", { is_streaming_output: true }),
      makeNode("mid"),
      makeNode("sink"),
    ];
    const edges = [
      makeEdge("src", "out", "mid", "in"),
      makeEdge("mid", "out", "sink", "in"),
    ];
    const graph = new Graph({ nodes, edges });
    expect(graph.hasStreamingUpstream("mid")).toBe(true);
    expect(graph.hasStreamingUpstream("sink")).toBe(true);
    expect(graph.hasStreamingUpstream("src")).toBe(false);
  });

  it("control edges do not propagate streaming", () => {
    const nodes = [
      makeNode("src", { is_streaming_output: true }),
      makeNode("ctrl"),
    ];
    const edges = [
      makeEdge("src", "__control__", "ctrl", "__control__", { edge_type: "control" }),
    ];
    const graph = new Graph({ nodes, edges });
    expect(graph.hasStreamingUpstream("ctrl")).toBe(false);
  });
});

describe("Graph – control edge adjacency with multiple targets", () => {
  it("handles controller with multiple control edges (adjacency append)", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
    const edges = [
      makeEdge("a", "__control__", "b", "__control__", { edge_type: "control" }),
      makeEdge("a", "__control__", "c", "__control__", { edge_type: "control" }),
    ];
    const graph = new Graph({ nodes, edges });
    // This exercises the adj.get(edge.source) truthy branch (line 330)
    expect(() => graph.validate()).not.toThrow();
    expect(graph.getControllerNodes()).toHaveLength(1);
    expect(graph.getControlledNodes()).toHaveLength(2);
  });
});

describe("Graph – control node queries", () => {
  it("getControlEdges returns only control edges targeting the requested node", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
    const edges = [
      makeEdge("a", "__control__", "b", "__control__", { edge_type: "control" }),
      makeEdge("c", "__control__", "b", "__control__", { edge_type: "control" }),
      makeEdge("a", "out", "c", "in"),
    ];
    const graph = new Graph({ nodes, edges });
    expect(graph.getControlEdges("b")).toHaveLength(2);
    expect(graph.getControlEdges("c")).toEqual([]);
  });

  it("getControllerNodes(targetId) returns controllers for a specific target", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
    const edges = [
      makeEdge("a", "__control__", "b", "__control__", { edge_type: "control" }),
      makeEdge("c", "__control__", "b", "__control__", { edge_type: "control" }),
    ];
    const graph = new Graph({ nodes, edges });
    expect(graph.getControllerNodes("b").map((node) => node.id).sort()).toEqual(["a", "c"]);
  });

  it("getControlledNodes(sourceId) returns controlled node ids for a specific controller", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
    const edges = [
      makeEdge("a", "__control__", "b", "__control__", { edge_type: "control" }),
      makeEdge("a", "__control__", "c", "__control__", { edge_type: "control" }),
    ];
    const graph = new Graph({ nodes, edges });
    expect(graph.getControlledNodes("a")).toEqual(["b", "c"]);
  });

  it("global helpers still return aggregated controller/controlled nodes", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
    const edges = [
      makeEdge("a", "__control__", "b", "__control__", { edge_type: "control" }),
      makeEdge("a", "__control__", "c", "__control__", { edge_type: "control" }),
    ];
    const graph = new Graph({ nodes, edges });
    expect(graph.getControllerNodes()).toHaveLength(1);
    expect(graph.getControllerNodes()[0].id).toBe("a");
    expect(graph.getControlledNodes()).toHaveLength(2);
    expect(graph.getControlledNodes().map((node) => node.id).sort()).toEqual(["b", "c"]);
  });
});

// ---------------------------------------------------------------------------
// findEdges (source, sourceHandle) lookup
// ---------------------------------------------------------------------------

describe("Graph – findEdges", () => {
  it("returns matching edges for a valid (source, sourceHandle) pair", () => {
    const nodes = [makeNode("a"), makeNode("b")];
    const edges = [makeEdge("a", "out", "b", "in")];
    const graph = new Graph({ nodes, edges });
    const found = graph.findEdges("a", "out");
    expect(found).toHaveLength(1);
    expect(found[0].target).toBe("b");
    expect(found[0].sourceHandle).toBe("out");
  });

  it("returns empty array when no edges match", () => {
    const nodes = [makeNode("a"), makeNode("b")];
    const edges = [makeEdge("a", "out", "b", "in")];
    const graph = new Graph({ nodes, edges });
    expect(graph.findEdges("a", "other_handle")).toEqual([]);
  });

  it("returns multiple edges when source handle fans out to multiple targets", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
    const edges = [
      makeEdge("a", "out", "b", "in"),
      makeEdge("a", "out", "c", "in"),
    ];
    const graph = new Graph({ nodes, edges });
    const found = graph.findEdges("a", "out");
    expect(found).toHaveLength(2);
    const targets = found.map((e) => e.target).sort();
    expect(targets).toEqual(["b", "c"]);
  });

  it("returns empty array for nonexistent source node", () => {
    const nodes = [makeNode("a")];
    const edges: Edge[] = [];
    const graph = new Graph({ nodes, edges });
    expect(graph.findEdges("nonexistent", "out")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// validateEdgeTypes (TypeMetadata-based)
// ---------------------------------------------------------------------------

describe("Graph – validateEdgeTypes (TypeMetadata)", () => {
  /** Helper to build a graph with typed source output and target input. */
  function makeTypedGraph(sourceType: string, targetType: string): Graph {
    const nodes = [
      makeNode("src", { outputs: { out: sourceType } }),
      makeNode("dst", { properties: { in: { type: targetType } } }),
    ];
    const edges = [makeEdge("src", "out", "dst", "in")];
    return new Graph({ nodes, edges });
  }

  it("passes for compatible types (string→string)", () => {
    const graph = makeTypedGraph("string", "string");
    expect(() => graph.validateEdgeTypes()).not.toThrow();
  });

  it("passes for compatible types (int→int)", () => {
    const graph = makeTypedGraph("int", "int");
    expect(() => graph.validateEdgeTypes()).not.toThrow();
  });

  it("passes for numeric widening (int→float)", () => {
    const graph = makeTypedGraph("int", "float");
    expect(() => graph.validateEdgeTypes()).not.toThrow();
  });

  it("passes for numeric widening (int→number)", () => {
    const graph = makeTypedGraph("int", "number");
    expect(() => graph.validateEdgeTypes()).not.toThrow();
  });

  it("passes when either side is 'any'", () => {
    expect(() => makeTypedGraph("any", "string").validateEdgeTypes()).not.toThrow();
    expect(() => makeTypedGraph("int", "any").validateEdgeTypes()).not.toThrow();
  });

  it("throws for incompatible types (string→int)", () => {
    const graph = makeTypedGraph("string", "int");
    expect(() => graph.validateEdgeTypes()).toThrow(GraphValidationError);
    expect(() => graph.validateEdgeTypes()).toThrow("Type mismatch");
  });

  it("passes for list element compatibility (list[int]→list[number])", () => {
    const graph = makeTypedGraph("list[int]", "list[number]");
    expect(() => graph.validateEdgeTypes()).not.toThrow();
  });

  it("throws for incompatible list elements (list[string]→list[int])", () => {
    const graph = makeTypedGraph("list[string]", "list[int]");
    expect(() => graph.validateEdgeTypes()).toThrow(GraphValidationError);
    expect(() => graph.validateEdgeTypes()).toThrow("Type mismatch");
  });

  it("skips edges with no type information (no throw)", () => {
    // Source has no outputs defined
    const g1 = new Graph({
      nodes: [makeNode("src"), makeNode("dst", { properties: { in: { type: "int" } } })],
      edges: [makeEdge("src", "out", "dst", "in")],
    });
    expect(() => g1.validateEdgeTypes()).not.toThrow();

    // Target has no properties defined
    const g2 = new Graph({
      nodes: [makeNode("src", { outputs: { out: "int" } }), makeNode("dst")],
      edges: [makeEdge("src", "out", "dst", "in")],
    });
    expect(() => g2.validateEdgeTypes()).not.toThrow();
  });
});
