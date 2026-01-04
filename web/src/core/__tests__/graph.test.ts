import { subgraph, topologicalSort } from "../graph";
import type { Edge, Node } from "@xyflow/react";
import type { NodeData } from "../../stores/NodeData";

// Helper function to create a test node
const createNode = (id: string): Node<NodeData> => ({
  id,
  type: "test-node",
  position: { x: 0, y: 0 },
  data: {
    properties: {},
    selectable: true,
    dynamic_properties: {},
    workflow_id: "test-workflow"
  }
});

// Helper function to create a test edge
const createEdge = (
  source: string,
  target: string,
  sourceHandle = "output",
  targetHandle = "input"
): Edge => ({
  id: `${source}-${target}`,
  source,
  target,
  sourceHandle,
  targetHandle
});

describe("graph utilities", () => {
  describe("subgraph", () => {
    it("returns just the start node when there are no outgoing edges", () => {
      const nodes = [createNode("A"), createNode("B"), createNode("C")];
      const edges: Edge[] = [];

      const result = subgraph(edges, nodes, nodes[0]);

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].id).toBe("A");
      expect(result.edges).toHaveLength(0);
    });

    it("returns downstream nodes from the start node", () => {
      const nodes = [
        createNode("A"),
        createNode("B"),
        createNode("C"),
        createNode("D")
      ];
      const edges = [
        createEdge("A", "B"),
        createEdge("B", "C"),
        createEdge("C", "D")
      ];

      const result = subgraph(edges, nodes, nodes[0]); // Start from A

      expect(result.nodes).toHaveLength(4);
      expect(result.nodes.map((n) => n.id).sort()).toEqual(["A", "B", "C", "D"]);
      expect(result.edges).toHaveLength(3);
    });

    it("returns partial subgraph when starting from middle node", () => {
      const nodes = [
        createNode("A"),
        createNode("B"),
        createNode("C"),
        createNode("D")
      ];
      const edges = [
        createEdge("A", "B"),
        createEdge("B", "C"),
        createEdge("C", "D")
      ];

      const result = subgraph(edges, nodes, nodes[1]); // Start from B

      expect(result.nodes).toHaveLength(3);
      expect(result.nodes.map((n) => n.id).sort()).toEqual(["B", "C", "D"]);
      // Should include edges B->C and C->D but not A->B
      expect(result.edges).toHaveLength(2);
      expect(result.edges.map((e) => e.id).sort()).toEqual([
        "B-C",
        "C-D"
      ]);
    });

    it("handles branching graphs", () => {
      const nodes = [
        createNode("A"),
        createNode("B"),
        createNode("C"),
        createNode("D"),
        createNode("E")
      ];
      const edges = [
        createEdge("A", "B"),
        createEdge("A", "C"),
        createEdge("B", "D"),
        createEdge("C", "E")
      ];

      const result = subgraph(edges, nodes, nodes[0]); // Start from A

      expect(result.nodes).toHaveLength(5);
      expect(result.nodes.map((n) => n.id).sort()).toEqual([
        "A",
        "B",
        "C",
        "D",
        "E"
      ]);
      expect(result.edges).toHaveLength(4);
    });

    it("handles diamond/merge pattern", () => {
      const nodes = [
        createNode("A"),
        createNode("B"),
        createNode("C"),
        createNode("D")
      ];
      const edges = [
        createEdge("A", "B"),
        createEdge("A", "C"),
        createEdge("B", "D"),
        createEdge("C", "D")
      ];

      const result = subgraph(edges, nodes, nodes[0]); // Start from A

      expect(result.nodes).toHaveLength(4);
      expect(result.nodes.map((n) => n.id).sort()).toEqual(["A", "B", "C", "D"]);
      // Note: Due to DFS, edges are collected before target is marked visited,
      // but when target is already visited, the edge is not added.
      // In a diamond pattern, only 3 edges are captured because the second
      // path to D (either B->D or C->D depending on traversal order) is skipped.
      // This is intentional as we only need connectivity, not all edges.
      expect(result.edges).toHaveLength(3);
    });

    it("excludes nodes that are not downstream", () => {
      const nodes = [
        createNode("A"),
        createNode("B"),
        createNode("C"),
        createNode("D"),
        createNode("E")
      ];
      const edges = [
        createEdge("A", "B"),
        createEdge("B", "C"),
        createEdge("D", "E") // Separate unconnected component
      ];

      const result = subgraph(edges, nodes, nodes[0]); // Start from A

      expect(result.nodes).toHaveLength(3);
      expect(result.nodes.map((n) => n.id).sort()).toEqual(["A", "B", "C"]);
      expect(result.edges).toHaveLength(2);
    });

    it("stops at stopNode when provided", () => {
      const nodes = [
        createNode("A"),
        createNode("B"),
        createNode("C"),
        createNode("D")
      ];
      const edges = [
        createEdge("A", "B"),
        createEdge("B", "C"),
        createEdge("C", "D")
      ];

      const result = subgraph(edges, nodes, nodes[0], nodes[2]); // Start from A, stop at C

      // Should include A and B, but stop before processing C's outgoing edges
      expect(result.nodes.map((n) => n.id).sort()).toEqual(["A", "B", "C"]);
      // Edge A->B should be included
      expect(result.edges).toHaveLength(2);
    });
  });

  describe("topologicalSort", () => {
    it("returns single layer for nodes with no edges", () => {
      const nodes = [createNode("A"), createNode("B"), createNode("C")];
      const edges: Edge[] = [];

      const result = topologicalSort(edges, nodes);

      expect(result).toHaveLength(1);
      expect(result[0].sort()).toEqual(["A", "B", "C"]);
    });

    it("returns correct layers for linear chain", () => {
      const nodes = [
        createNode("A"),
        createNode("B"),
        createNode("C")
      ];
      const edges = [createEdge("A", "B"), createEdge("B", "C")];

      const result = topologicalSort(edges, nodes);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual(["A"]);
      expect(result[1]).toEqual(["B"]);
      expect(result[2]).toEqual(["C"]);
    });

    it("groups parallel nodes in same layer", () => {
      const nodes = [
        createNode("A"),
        createNode("B"),
        createNode("C"),
        createNode("D")
      ];
      const edges = [
        createEdge("A", "B"),
        createEdge("A", "C"),
        createEdge("B", "D"),
        createEdge("C", "D")
      ];

      const result = topologicalSort(edges, nodes);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual(["A"]);
      expect(result[1].sort()).toEqual(["B", "C"]); // B and C can be processed in parallel
      expect(result[2]).toEqual(["D"]);
    });
  });
});
