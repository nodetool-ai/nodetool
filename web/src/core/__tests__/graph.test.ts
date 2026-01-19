import { Edge, Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { topologicalSort, subgraph } from "../graph";

const createTestNode = (id: string): Node<NodeData> => ({
  id,
  type: "test",
  position: { x: 0, y: 0 },
  data: {
    properties: {},
    selectable: true,
    dynamic_properties: {},
    workflow_id: "test-workflow"
  }
});

describe("graph utilities", () => {
  describe("topologicalSort", () => {
    it("returns single layer for empty edges", () => {
      const nodes = [createTestNode("a"), createTestNode("b"), createTestNode("c")];
      const edges: Edge[] = [];

      const result = topologicalSort(edges, nodes);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(expect.arrayContaining(["a", "b", "c"]));
    });

    it("sorts linear chain correctly", () => {
      const nodes = [createTestNode("a"), createTestNode("b"), createTestNode("c")];
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "b", target: "c", sourceHandle: "out", targetHandle: "in" }
      ];

      const result = topologicalSort(edges, nodes);

      expect(result).toHaveLength(3);
      expect(result[0]).toContain("a");
      expect(result[1]).toContain("b");
      expect(result[2]).toContain("c");
    });

    it("handles parallel nodes at same level", () => {
      const nodes = [createTestNode("a"), createTestNode("b"), createTestNode("c")];
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "a", target: "c", sourceHandle: "out", targetHandle: "in" }
      ];

      const result = topologicalSort(edges, nodes);

      expect(result).toHaveLength(2);
      expect(result[0]).toContain("a");
      expect(result[1]).toEqual(expect.arrayContaining(["b", "c"]));
    });

    it("handles diamond pattern", () => {
      const nodes = [
        createTestNode("a"),
        createTestNode("b"),
        createTestNode("c"),
        createTestNode("d")
      ];
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "a", target: "c", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "b", target: "d", sourceHandle: "out", targetHandle: "in" },
        { id: "e4", source: "c", target: "d", sourceHandle: "out", targetHandle: "in" }
      ];

      const result = topologicalSort(edges, nodes);

      expect(result).toHaveLength(3);
      expect(result[0]).toContain("a");
      expect(result[1]).toEqual(expect.arrayContaining(["b", "c"]));
      expect(result[2]).toContain("d");
    });

    it("handles single node without edges", () => {
      const nodes = [createTestNode("solo")];
      const edges: Edge[] = [];

      const result = topologicalSort(edges, nodes);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain("solo");
    });

    it("handles nodes with no connections", () => {
      const nodes = [createTestNode("a"), createTestNode("b")];
      const edges: Edge[] = [];

      const result = topologicalSort(edges, nodes);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(2);
    });

    it("handles complex graph with multiple levels", () => {
      const nodes = [
        createTestNode("a"),
        createTestNode("b"),
        createTestNode("c"),
        createTestNode("d"),
        createTestNode("e")
      ];
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "a", target: "c", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "b", target: "d", sourceHandle: "out", targetHandle: "in" },
        { id: "e4", source: "c", target: "e", sourceHandle: "out", targetHandle: "in" },
        { id: "e5", source: "d", target: "e", sourceHandle: "out", targetHandle: "in" }
      ];

      const result = topologicalSort(edges, nodes);

      expect(result).toHaveLength(4);
      expect(result[0]).toContain("a");
      expect(result[1]).toEqual(expect.arrayContaining(["b", "c"]));
      expect(result[2]).toContain("d");
      expect(result[3]).toContain("e");
    });
  });

  describe("subgraph", () => {
    it("returns single node when start node has no connections", () => {
      const nodes = [createTestNode("a"), createTestNode("b")];
      const edges: Edge[] = [];
      const startNode = nodes[0];

      const result = subgraph(edges, nodes, startNode);

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].id).toBe("a");
      expect(result.edges).toHaveLength(0);
    });

    it("collects reachable nodes in linear chain", () => {
      const nodes = [
        createTestNode("a"),
        createTestNode("b"),
        createTestNode("c")
      ];
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "b", target: "c", sourceHandle: "out", targetHandle: "in" }
      ];
      const startNode = nodes[0];

      const result = subgraph(edges, nodes, startNode);

      expect(result.nodes).toHaveLength(3);
      const nodeIds = result.nodes.map(n => n.id);
      expect(nodeIds).toContain("a");
      expect(nodeIds).toContain("b");
      expect(nodeIds).toContain("c");
      expect(result.edges).toHaveLength(2);
    });

    it("stops at stopNode when specified", () => {
      const nodes = [
        createTestNode("a"),
        createTestNode("b"),
        createTestNode("c"),
        createTestNode("d")
      ];
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "b", target: "c", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "c", target: "d", sourceHandle: "out", targetHandle: "in" }
      ];
      const startNode = nodes[0];
      const stopNode = nodes[2];

      const result = subgraph(edges, nodes, startNode, stopNode);

      const nodeIds = result.nodes.map(n => n.id);
      expect(nodeIds).toContain("a");
      expect(nodeIds).toContain("b");
      expect(nodeIds).toContain("c");
      expect(nodeIds).not.toContain("d");
      expect(result.edges).toHaveLength(2);
    });

    it("handles diamond pattern correctly", () => {
      const nodes = [
        createTestNode("a"),
        createTestNode("b"),
        createTestNode("c"),
        createTestNode("d")
      ];
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "a", target: "c", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "b", target: "d", sourceHandle: "out", targetHandle: "in" },
        { id: "e4", source: "c", target: "d", sourceHandle: "out", targetHandle: "in" }
      ];
      const startNode = nodes[0];

      const result = subgraph(edges, nodes, startNode);

      expect(result.nodes).toHaveLength(4);
      expect(result.edges).toHaveLength(4);
    });

    it("handles disconnected graph", () => {
      const nodes = [
        createTestNode("a"),
        createTestNode("b"),
        createTestNode("c")
      ];
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b", sourceHandle: "out", targetHandle: "in" }
      ];
      const startNode = nodes[0];

      const result = subgraph(edges, nodes, startNode);

      const nodeIds = result.nodes.map(n => n.id);
      expect(nodeIds).toContain("a");
      expect(nodeIds).toContain("b");
      expect(nodeIds).not.toContain("c");
      expect(result.edges).toHaveLength(1);
    });

    it("handles graph with multiple paths to same node", () => {
      const nodes = [
        createTestNode("a"),
        createTestNode("b"),
        createTestNode("c")
      ];
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "a", target: "c", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "b", target: "c", sourceHandle: "out", targetHandle: "in" }
      ];
      const startNode = nodes[0];

      const result = subgraph(edges, nodes, startNode);

      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(3);
    });

    it("only includes edges where both endpoints are in visited set", () => {
      const nodes = [
        createTestNode("a"),
        createTestNode("b"),
        createTestNode("c"),
        createTestNode("d")
      ];
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "b", target: "c", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "c", target: "d", sourceHandle: "out", targetHandle: "in" }
      ];
      const startNode = nodes[0];
      const stopNode = nodes[2];

      const result = subgraph(edges, nodes, startNode, stopNode);

      const edgeIds = result.edges.map(e => e.id);
      expect(edgeIds).toContain("e1");
      expect(edgeIds).toContain("e2");
      expect(edgeIds).not.toContain("e3");
    });
  });
});
