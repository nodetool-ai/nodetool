/**
 * Graph utility tests – parity with Python graph_utils.py.
 */

import { describe, it, expect } from "vitest";
import { Graph } from "../src/graph.js";
import {
  findNodeOrThrow,
  getNodeInputTypes,
  getDownstreamSubgraph
} from "../src/graph-utils.js";
import type { NodeDescriptor, Edge } from "@nodetool/protocol";

// Helper to build a simple graph
function makeGraph(nodes: NodeDescriptor[], edges: Edge[]): Graph {
  return new Graph({ nodes, edges });
}

describe("findNodeOrThrow", () => {
  it("returns the node when it exists", () => {
    const graph = makeGraph([{ id: "n1", type: "test" }], []);
    const node = findNodeOrThrow(graph, "n1");
    expect(node.id).toBe("n1");
  });

  it("throws when node does not exist", () => {
    const graph = makeGraph([], []);
    expect(() => findNodeOrThrow(graph, "missing")).toThrow(
      "Node with ID missing does not exist"
    );
  });
});

describe("getNodeInputTypes", () => {
  it("returns correct handle -> type mapping", () => {
    const nodes: NodeDescriptor[] = [
      { id: "src", type: "source", outputs: { out: "string", num: "int" } },
      { id: "dst", type: "dest" }
    ];
    const edges: Edge[] = [
      {
        source: "src",
        sourceHandle: "out",
        target: "dst",
        targetHandle: "text_in"
      },
      {
        source: "src",
        sourceHandle: "num",
        target: "dst",
        targetHandle: "number_in"
      }
    ];
    const graph = makeGraph(nodes, edges);
    const types = getNodeInputTypes(graph, "dst");
    expect(types).toEqual({
      text_in: "string",
      number_in: "int"
    });
  });

  it("returns undefined for missing source outputs", () => {
    const nodes: NodeDescriptor[] = [
      { id: "src", type: "source" }, // no outputs declared
      { id: "dst", type: "dest" }
    ];
    const edges: Edge[] = [
      {
        source: "src",
        sourceHandle: "out",
        target: "dst",
        targetHandle: "in"
      }
    ];
    const graph = makeGraph(nodes, edges);
    const types = getNodeInputTypes(graph, "dst");
    expect(types).toEqual({ in: undefined });
  });

  it("returns empty object when node has no incoming edges", () => {
    const graph = makeGraph([{ id: "n1", type: "test" }], []);
    const types = getNodeInputTypes(graph, "n1");
    expect(types).toEqual({});
  });
});

describe("getDownstreamSubgraph", () => {
  it("returns correct BFS subgraph", () => {
    //  A --out--> B --out--> C
    //             B --alt--> D
    const nodes: NodeDescriptor[] = [
      { id: "A", type: "t" },
      { id: "B", type: "t" },
      { id: "C", type: "t" },
      { id: "D", type: "t" }
    ];
    const edges: Edge[] = [
      { source: "A", sourceHandle: "out", target: "B", targetHandle: "in" },
      { source: "B", sourceHandle: "out", target: "C", targetHandle: "in" },
      { source: "B", sourceHandle: "alt", target: "D", targetHandle: "in" }
    ];
    const graph = makeGraph(nodes, edges);

    const result = getDownstreamSubgraph(graph, "A", "out");

    // Initial edges: A->B
    expect(result.initialEdges).toHaveLength(1);
    expect(result.initialEdges[0].target).toBe("B");

    // Nodes: A, B, C, D (all reachable)
    const nodeIds = result.nodes.map((n) => n.id).sort();
    expect(nodeIds).toEqual(["A", "B", "C", "D"]);

    // Edges: A->B, B->C, B->D
    expect(result.edges).toHaveLength(3);
  });

  it("returns empty when no matching source handle", () => {
    const nodes: NodeDescriptor[] = [
      { id: "A", type: "t" },
      { id: "B", type: "t" }
    ];
    const edges: Edge[] = [
      { source: "A", sourceHandle: "out", target: "B", targetHandle: "in" }
    ];
    const graph = makeGraph(nodes, edges);

    const result = getDownstreamSubgraph(graph, "A", "nonexistent");
    expect(result.initialEdges).toHaveLength(0);
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it("handles diamond-shaped graphs without duplicates", () => {
    //  A --out--> B --out--> D
    //  A --out--> C --out--> D
    const nodes: NodeDescriptor[] = [
      { id: "A", type: "t" },
      { id: "B", type: "t" },
      { id: "C", type: "t" },
      { id: "D", type: "t" }
    ];
    const edges: Edge[] = [
      { source: "A", sourceHandle: "out", target: "B", targetHandle: "in" },
      { source: "A", sourceHandle: "out", target: "C", targetHandle: "in" },
      { source: "B", sourceHandle: "out", target: "D", targetHandle: "in" },
      { source: "C", sourceHandle: "out", target: "D", targetHandle: "in" }
    ];
    const graph = makeGraph(nodes, edges);

    const result = getDownstreamSubgraph(graph, "A", "out");

    // All 4 nodes reachable
    const nodeIds = result.nodes.map((n) => n.id).sort();
    expect(nodeIds).toEqual(["A", "B", "C", "D"]);

    // Initial edges: A->B and A->C
    expect(result.initialEdges).toHaveLength(2);

    // All 4 edges included
    expect(result.edges).toHaveLength(4);
  });

  it("only follows specified source handle", () => {
    //  A --out1--> B
    //  A --out2--> C
    const nodes: NodeDescriptor[] = [
      { id: "A", type: "t" },
      { id: "B", type: "t" },
      { id: "C", type: "t" }
    ];
    const edges: Edge[] = [
      { source: "A", sourceHandle: "out1", target: "B", targetHandle: "in" },
      { source: "A", sourceHandle: "out2", target: "C", targetHandle: "in" }
    ];
    const graph = makeGraph(nodes, edges);

    const result = getDownstreamSubgraph(graph, "A", "out1");

    expect(result.initialEdges).toHaveLength(1);
    const nodeIds = result.nodes.map((n) => n.id).sort();
    expect(nodeIds).toEqual(["A", "B"]);
    expect(result.edges).toHaveLength(1);
  });
});
