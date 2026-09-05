import { Edge, Node, Position } from "@xyflow/react";
import type { ElkNode } from "elkjs/lib/elk.bundled.js";
import { subgraph, autoLayout } from "../graph";
import { NodeData } from "../../stores/NodeData";
import { COMMENT_NODE_TYPE } from "../../constants/nodeTypes";

// Every graph handed to ELK, in call order — `autoLayout` calls `layout` once
// per group, so this is what the node/edge partitioning is asserted against.
const elkGraphs: ElkNode[] = [];

jest.mock("elkjs/lib/elk.bundled.js", () => ({
  __esModule: true,
  default: class {
    async layout(graph: ElkNode): Promise<ElkNode> {
      elkGraphs.push(graph);
      return {
        ...graph,
        children: (graph.children ?? []).map((child, i) => ({
          ...child,
          x: i * 100,
          y: i * 10,
        })),
      };
    }
  },
}));

describe("graph utilities", () => {
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

  describe("autoLayout", () => {
    const createNode = (
      id: string,
      parentId?: string,
      type = "test"
    ): Node<NodeData> => ({
      id,
      type,
      parentId,
      position: { x: 0, y: 0 },
      measured: { width: 200, height: 80 },
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

    const graphFor = (groupId: string): ElkNode | undefined =>
      elkGraphs.find((g) => g.id === groupId);

    beforeEach(() => {
      elkGraphs.length = 0;
    });

    it("lays out each group with only its own nodes and internal edges", async () => {
      const nodes = [
        createNode("group-1"),
        createNode("A", "group-1"),
        createNode("B", "group-1"),
        createNode("C"),
      ];
      const edges = [
        createEdge("A", "B"), // internal to group-1
        createEdge("B", "C"), // crosses the group boundary
        createEdge("group-1", "C"), // internal to root
      ];

      await autoLayout(edges, nodes);

      const group = graphFor("group-1");
      expect(group?.children?.map((c) => c.id).sort()).toEqual(["A", "B"]);
      expect(group?.edges?.map((e) => e.id)).toEqual(["A-B"]);

      const root = graphFor("root");
      expect(root?.children?.map((c) => c.id).sort()).toEqual([
        "C",
        "group-1",
      ]);
      // "B-C" spans two groups, so it belongs to neither.
      expect(root?.edges?.map((e) => e.id)).toEqual(["group-1-C"]);
    });

    it("returns comment nodes untouched and repositions the rest", async () => {
      const comment = createNode("note", undefined, COMMENT_NODE_TYPE);
      comment.position = { x: 42, y: 7 };
      const nodes = [createNode("A"), createNode("B"), comment];

      const result = await autoLayout([createEdge("A", "B")], nodes);

      expect(graphFor("root")?.children?.map((c) => c.id).sort()).toEqual([
        "A",
        "B",
      ]);
      expect(result).toHaveLength(3);
      expect(result.find((n) => n.id === "note")?.position).toEqual({
        x: 42,
        y: 7,
      });
      // The stub places the i-th child at (i * 100, i * 10).
      expect(result.find((n) => n.id === "A")?.position).toEqual({
        x: 0,
        y: 0,
      });
      expect(result.find((n) => n.id === "B")?.position).toEqual({
        x: 100,
        y: 10,
      });
    });

    it("ignores edges that touch a comment node", async () => {
      const nodes = [
        createNode("A"),
        createNode("B"),
        createNode("note", undefined, COMMENT_NODE_TYPE),
      ];
      const edges = [createEdge("A", "B"), createEdge("note", "A")];

      await autoLayout(edges, nodes);

      expect(graphFor("root")?.edges?.map((e) => e.id)).toEqual(["A-B"]);
    });

    it("sizes a group node to fit its laid-out children", async () => {
      const nodes = [
        createNode("group-1"),
        createNode("A", "group-1"),
        createNode("B", "group-1"),
      ];

      const result = await autoLayout([createEdge("A", "B")], nodes);

      // Child B lands at (100, 10) and measures 200x80, so the group spans
      // 300x90 before the 50px padding.
      const group = result.find((n) => n.id === "group-1");
      expect(group?.width).toBe(350);
      expect(group?.height).toBe(140);
    });
  });
});
