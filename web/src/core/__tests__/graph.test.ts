import { Edge, Node, Position } from "@xyflow/react";
import { topologicalSort, subgraph } from "../graph";
import { NodeData } from "../../stores/NodeData";

describe("graph utilities", () => {
  describe("topologicalSort", () => {
    const createNode = (id: string): Node<NodeData> => ({
      id,
      type: "test",
      position: { x: 0, y: 0 },
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
      data: {
        properties: {},
        dynamic_properties: {},
        selectable: true,
        workflow_id: "test",
      },
    });

    const createEdge = (source: string, target: string): Edge => ({
      id: `${source}-${target}`,
      source,
      target,
      sourceHandle: null,
      targetHandle: null,
    });

    it("returns single layer with all nodes for empty edges", () => {
      const nodes = [createNode("A"), createNode("B"), createNode("C")];
      const edges: Edge[] = [];

      const result = topologicalSort(edges, nodes);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain("A");
      expect(result[0]).toContain("B");
      expect(result[0]).toContain("C");
    });

    it("sorts linear chain A->B->C into separate layers", () => {
      const nodes = [createNode("A"), createNode("B"), createNode("C")];
      const edges = [createEdge("A", "B"), createEdge("B", "C")];

      const result = topologicalSort(edges, nodes);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual(["A"]);
      expect(result[1]).toEqual(["B"]);
      expect(result[2]).toEqual(["C"]);
    });

    it("puts parallel nodes in same layer", () => {
      const nodes = [createNode("A"), createNode("B"), createNode("C"), createNode("D")];
      const edges = [
        createEdge("A", "B"),
        createEdge("A", "C"),
        createEdge("B", "D"),
        createEdge("C", "D"),
      ];

      const result = topologicalSort(edges, nodes);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual(["A"]);
      expect(result[1]).toContain("B");
      expect(result[1]).toContain("C");
      expect(result[1]).toHaveLength(2);
      expect(result[2]).toEqual(["D"]);
    });

    it("handles diamond pattern", () => {
      const nodes = [createNode("A"), createNode("B"), createNode("C"), createNode("D")];
      const edges = [
        createEdge("A", "B"),
        createEdge("A", "C"),
        createEdge("B", "D"),
        createEdge("C", "D"),
      ];

      const result = topologicalSort(edges, nodes);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual(["A"]);
      expect(result[2]).toEqual(["D"]);
    });

    it("handles multiple source nodes", () => {
      const nodes = [
        createNode("A"),
        createNode("B"),
        createNode("C"),
        createNode("D"),
      ];
      const edges = [
        createEdge("A", "D"),
        createEdge("B", "D"),
        createEdge("C", "D"),
      ];

      const result = topologicalSort(edges, nodes);

      expect(result).toHaveLength(2);
      expect(result[0]).toContain("A");
      expect(result[0]).toContain("B");
      expect(result[0]).toContain("C");
      expect(result[1]).toEqual(["D"]);
    });

    it("handles disconnected nodes", () => {
      const nodes = [
        createNode("A"),
        createNode("B"),
        createNode("C"),
        createNode("D"),
      ];
      const edges = [createEdge("A", "B")];

      const result = topologicalSort(edges, nodes);

      expect(result).toHaveLength(2);
      expect(result[0]).toContain("A");
      expect(result[0]).toContain("C");
      expect(result[0]).toContain("D");
      expect(result[1]).toEqual(["B"]);
    });

    it("handles nodes with no edges", () => {
      const nodes = [createNode("A")];
      const edges: Edge[] = [];

      const result = topologicalSort(edges, nodes);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(["A"]);
    });

    it("handles complex branching graph", () => {
      const nodes = [
        createNode("root"),
        createNode("child1"),
        createNode("child2"),
        createNode("grandchild1"),
        createNode("grandchild2"),
        createNode("greatgrandchild"),
      ];
      const edges = [
        createEdge("root", "child1"),
        createEdge("root", "child2"),
        createEdge("child1", "grandchild1"),
        createEdge("child1", "grandchild2"),
        createEdge("grandchild2", "greatgrandchild"),
      ];

      const result = topologicalSort(edges, nodes);

      expect(result[0]).toEqual(["root"]);
      expect(result[1]).toContain("child1");
      expect(result[1]).toContain("child2");
      expect(result[2]).toContain("grandchild1");
      expect(result[2]).toContain("grandchild2");
      expect(result[3]).toEqual(["greatgrandchild"]);
    });
  });

  describe("subgraph", () => {
    const createNode = (id: string): Node<NodeData> => ({
      id,
      type: "test",
      position: { x: 0, y: 0 },
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
      data: {
        properties: {},
        dynamic_properties: {},
        selectable: true,
        workflow_id: "test",
      },
    });

    const createEdge = (source: string, target: string): Edge => ({
      id: `${source}-${target}`,
      source,
      target,
      sourceHandle: null,
      targetHandle: null,
    });

    it("returns single node with no edges for isolated node", () => {
      const nodes = [createNode("A")];
      const edges: Edge[] = [];

      const result = subgraph(edges, nodes, nodes[0]);

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].id).toBe("A");
      expect(result.edges).toHaveLength(0);
    });

    it("extracts linear chain subgraph", () => {
      const nodes = [
        createNode("A"),
        createNode("B"),
        createNode("C"),
        createNode("D"),
      ];
      const edges = [
        createEdge("A", "B"),
        createEdge("B", "C"),
        createEdge("C", "D"),
      ];

      const result = subgraph(edges, nodes, nodes[0]);

      expect(result.nodes).toHaveLength(4);
      expect(result.edges).toHaveLength(3);
    });

    it("stops at stopNode when provided", () => {
      const nodes = [
        createNode("A"),
        createNode("B"),
        createNode("C"),
        createNode("D"),
      ];
      const edges = [
        createEdge("A", "B"),
        createEdge("B", "C"),
        createEdge("C", "D"),
      ];

      const result = subgraph(edges, nodes, nodes[0], nodes[2]);

      expect(result.nodes.map((n) => n.id)).toEqual(["A", "B", "C"]);
      expect(result.edges).toHaveLength(2);
    });

    it("extracts diamond subgraph", () => {
      const nodes = [
        createNode("A"),
        createNode("B"),
        createNode("C"),
        createNode("D"),
      ];
      const edges = [
        createEdge("A", "B"),
        createEdge("A", "C"),
        createEdge("B", "D"),
        createEdge("C", "D"),
      ];

      const result = subgraph(edges, nodes, nodes[0]);

      expect(result.nodes).toHaveLength(4);
      expect(result.edges).toHaveLength(4);
    });

    it("handles branching without cycles", () => {
      const nodes = [
        createNode("A"),
        createNode("B"),
        createNode("C"),
        createNode("D"),
        createNode("E"),
      ];
      const edges = [
        createEdge("A", "B"),
        createEdge("A", "C"),
        createEdge("B", "D"),
        createEdge("C", "E"),
      ];

      const result = subgraph(edges, nodes, nodes[0]);

      expect(result.nodes).toHaveLength(5);
      expect(result.edges).toHaveLength(4);
    });

    it("excludes edges pointing outside visited set", () => {
      const nodes = [
        createNode("A"),
        createNode("B"),
        createNode("C"),
        createNode("D"),
      ];
      const edges = [
        createEdge("A", "B"),
        createEdge("B", "C"),
        createEdge("C", "D"),
        createEdge("B", "D"),
      ];

      const result = subgraph(edges, nodes, nodes[0]);

      expect(result.nodes).toHaveLength(4);
      expect(result.edges).toHaveLength(4);
    });

    it("handles disconnected start node", () => {
      const nodes = [
        createNode("A"),
        createNode("B"),
        createNode("C"),
      ];
      const edges = [createEdge("B", "C")];

      const result = subgraph(edges, nodes, nodes[0]);

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].id).toBe("A");
      expect(result.edges).toHaveLength(0);
    });

    it("handles graph with cycles by visiting each node once", () => {
      const nodes = [
        createNode("A"),
        createNode("B"),
        createNode("C"),
      ];
      const edges = [
        createEdge("A", "B"),
        createEdge("B", "C"),
        createEdge("C", "A"),
      ];

      const result = subgraph(edges, nodes, nodes[0]);

      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(3);
    });
  });
});
