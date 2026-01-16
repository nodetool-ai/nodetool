import { computeGraphDiff, getDiffSummary, GraphDiff } from "../graphDiff";
import { Graph, Node, Edge } from "../stores/ApiTypes";

const createMockNode = (id: string, data?: Record<string, unknown>, ui_properties?: Record<string, unknown>): Node => ({
  id,
  type: "test",
  data: data || {},
  ui_properties
}) as Node;

const createMockEdge = (id: string, source: string, target: string, sourceHandle?: string, targetHandle?: string): Edge => ({
  id,
  source,
  target,
  sourceHandle,
  targetHandle
}) as Edge;

const createMockGraph = (nodes: Node[], edges: Edge[]): Graph => ({
  nodes,
  edges
});

describe("graphDiff", () => {
  describe("computeGraphDiff", () => {
    it("returns no changes when graphs are identical", () => {
      const nodes = [createMockNode("1"), createMockNode("2")];
      const edges = [createMockEdge("e1", "1", "2")];
      const oldGraph = createMockGraph(nodes, edges);
      const newGraph = createMockGraph(nodes, edges);

      const result = computeGraphDiff(oldGraph, newGraph);

      expect(result.hasChanges).toBe(false);
      expect(result.addedNodes).toEqual([]);
      expect(result.removedNodes).toEqual([]);
      expect(result.modifiedNodes).toEqual([]);
      expect(result.addedEdges).toEqual([]);
      expect(result.removedEdges).toEqual([]);
    });

    it("detects added nodes", () => {
      const oldGraph = createMockGraph([createMockNode("1")], []);
      const newGraph = createMockGraph([createMockNode("1"), createMockNode("2")], []);

      const result = computeGraphDiff(oldGraph, newGraph);

      expect(result.hasChanges).toBe(true);
      expect(result.addedNodes).toHaveLength(1);
      expect(result.addedNodes[0].id).toBe("2");
      expect(result.removedNodes).toEqual([]);
    });

    it("detects removed nodes", () => {
      const oldGraph = createMockGraph([createMockNode("1"), createMockNode("2")], []);
      const newGraph = createMockGraph([createMockNode("1")], []);

      const result = computeGraphDiff(oldGraph, newGraph);

      expect(result.hasChanges).toBe(true);
      expect(result.removedNodes).toHaveLength(1);
      expect(result.removedNodes[0].id).toBe("2");
      expect(result.addedNodes).toEqual([]);
    });

    it("detects added edges", () => {
      const oldGraph = createMockGraph([createMockNode("1"), createMockNode("2")], []);
      const newGraph = createMockGraph(
        [createMockNode("1"), createMockNode("2")],
        [createMockEdge("e1", "1", "2")]
      );

      const result = computeGraphDiff(oldGraph, newGraph);

      expect(result.hasChanges).toBe(true);
      expect(result.addedEdges).toHaveLength(1);
      expect(result.addedEdges[0].id).toBe("e1");
    });

    it("detects removed edges", () => {
      const oldGraph = createMockGraph(
        [createMockNode("1"), createMockNode("2")],
        [createMockEdge("e1", "1", "2")]
      );
      const newGraph = createMockGraph([createMockNode("1"), createMockNode("2")], []);

      const result = computeGraphDiff(oldGraph, newGraph);

      expect(result.hasChanges).toBe(true);
      expect(result.removedEdges).toHaveLength(1);
      expect(result.removedEdges[0].id).toBe("e1");
    });

    it("detects modified node data", () => {
      const oldGraph = createMockGraph(
        [createMockNode("1", { value: "old" })],
        []
      );
      const newGraph = createMockGraph(
        [createMockNode("1", { value: "new" })],
        []
      );

      const result = computeGraphDiff(oldGraph, newGraph);

      expect(result.hasChanges).toBe(true);
      expect(result.modifiedNodes).toHaveLength(1);
      expect(result.modifiedNodes[0].nodeId).toBe("1");
      expect(result.modifiedNodes[0].changes).toHaveLength(1);
      expect(result.modifiedNodes[0].changes[0].key).toBe("value");
      expect(result.modifiedNodes[0].changes[0].oldValue).toBe("old");
      expect(result.modifiedNodes[0].changes[0].newValue).toBe("new");
    });

    it("detects modified node ui_properties", () => {
      const oldGraph = createMockGraph(
        [createMockNode("1", {}, { position: { x: 0, y: 0 } })],
        []
      );
      const newGraph = createMockGraph(
        [createMockNode("1", {}, { position: { x: 100, y: 100 } })],
        []
      );

      const result = computeGraphDiff(oldGraph, newGraph);

      expect(result.hasChanges).toBe(true);
      expect(result.modifiedNodes).toHaveLength(1);
      expect(result.modifiedNodes[0].changes).toHaveLength(1);
      expect(result.modifiedNodes[0].changes[0].key).toBe("ui_properties");
    });

    it("detects multiple types of changes simultaneously", () => {
      const oldGraph = createMockGraph(
        [createMockNode("1", { value: "old" })],
        []
      );
      const newGraph = createMockGraph(
        [
          createMockNode("1", { value: "new" }),
          createMockNode("2")
        ],
        [createMockEdge("e1", "1", "2")]
      );

      const result = computeGraphDiff(oldGraph, newGraph);

      expect(result.hasChanges).toBe(true);
      expect(result.modifiedNodes).toHaveLength(1);
      expect(result.addedNodes).toHaveLength(1);
      expect(result.addedEdges).toHaveLength(1);
    });

    it("handles edge with different handles as different edges", () => {
      const oldGraph = createMockGraph(
        [createMockNode("1"), createMockNode("2")],
        [createMockEdge("e1", "1", "2", "out1", "in1")]
      );
      const newGraph = createMockGraph(
        [createMockNode("1"), createMockNode("2")],
        [
          createMockEdge("e1", "1", "2", "out1", "in1"),
          createMockEdge("e2", "1", "2", "out2", "in2")
        ]
      );

      const result = computeGraphDiff(oldGraph, newGraph);

      expect(result.hasChanges).toBe(true);
      expect(result.addedEdges).toHaveLength(1);
      expect(result.addedEdges[0].sourceHandle).toBe("out2");
    });

    it("handles empty graphs", () => {
      const oldGraph = createMockGraph([], []);
      const newGraph = createMockGraph([], []);

      const result = computeGraphDiff(oldGraph, newGraph);

      expect(result.hasChanges).toBe(false);
    });

    it("handles adding to empty graph", () => {
      const oldGraph = createMockGraph([], []);
      const newGraph = createMockGraph([createMockNode("1")], []);

      const result = computeGraphDiff(oldGraph, newGraph);

      expect(result.hasChanges).toBe(true);
      expect(result.addedNodes).toHaveLength(1);
    });

    it("handles removing all nodes from graph", () => {
      const oldGraph = createMockGraph([createMockNode("1")], []);
      const newGraph = createMockGraph([], []);

      const result = computeGraphDiff(oldGraph, newGraph);

      expect(result.hasChanges).toBe(true);
      expect(result.removedNodes).toHaveLength(1);
    });

    it("detects new node with new data properties", () => {
      const oldGraph = createMockGraph([createMockNode("1", { a: 1 })], []);
      const newGraph = createMockGraph(
        [createMockNode("1", { a: 1, b: 2 })],
        []
      );

      const result = computeGraphDiff(oldGraph, newGraph);

      expect(result.hasChanges).toBe(true);
      expect(result.modifiedNodes[0].changes).toHaveLength(1);
      expect(result.modifiedNodes[0].changes[0].key).toBe("b");
    });

    it("detects removed node data properties", () => {
      const oldGraph = createMockGraph(
        [createMockNode("1", { a: 1, b: 2 })],
        []
      );
      const newGraph = createMockGraph([createMockNode("1", { a: 1 })], []);

      const result = computeGraphDiff(oldGraph, newGraph);

      expect(result.hasChanges).toBe(true);
      expect(result.modifiedNodes[0].changes).toHaveLength(1);
      expect(result.modifiedNodes[0].changes[0].key).toBe("b");
    });
  });

  describe("getDiffSummary", () => {
    it("returns 'No changes' for unchanged diff", () => {
      const diff: GraphDiff = {
        addedNodes: [],
        removedNodes: [],
        modifiedNodes: [],
        addedEdges: [],
        removedEdges: [],
        hasChanges: false
      };

      expect(getDiffSummary(diff)).toBe("No changes");
    });

    it("summarizes added nodes", () => {
      const diff: GraphDiff = {
        addedNodes: [{ id: "1" } as Node],
        removedNodes: [],
        modifiedNodes: [],
        addedEdges: [],
        removedEdges: [],
        hasChanges: true
      };

      expect(getDiffSummary(diff)).toBe("+1 node(s)");
    });

    it("summarizes removed nodes", () => {
      const diff: GraphDiff = {
        addedNodes: [],
        removedNodes: [{ id: "1" } as Node],
        modifiedNodes: [],
        addedEdges: [],
        removedEdges: [],
        hasChanges: true
      };

      expect(getDiffSummary(diff)).toBe("-1 node(s)");
    });

    it("summarizes modified nodes", () => {
      const diff: GraphDiff = {
        addedNodes: [],
        removedNodes: [],
        modifiedNodes: [{ nodeId: "1", nodeType: "test", changes: [] }],
        addedEdges: [],
        removedEdges: [],
        hasChanges: true
      };

      expect(getDiffSummary(diff)).toBe("~1 modified node(s)");
    });

    it("summarizes added edges", () => {
      const diff: GraphDiff = {
        addedNodes: [],
        removedNodes: [],
        modifiedNodes: [],
        addedEdges: [{ id: "e1" } as Edge],
        removedEdges: [],
        hasChanges: true
      };

      expect(getDiffSummary(diff)).toBe("+1 connection(s)");
    });

    it("summarizes removed edges", () => {
      const diff: GraphDiff = {
        addedNodes: [],
        removedNodes: [],
        modifiedNodes: [],
        addedEdges: [],
        removedEdges: [{ id: "e1" } as Edge],
        hasChanges: true
      };

      expect(getDiffSummary(diff)).toBe("-1 connection(s)");
    });

    it("combines multiple change types", () => {
      const diff: GraphDiff = {
        addedNodes: [{ id: "1" } as Node],
        removedNodes: [{ id: "2" } as Node],
        modifiedNodes: [{ nodeId: "3", nodeType: "test", changes: [] }],
        addedEdges: [{ id: "e1" } as Edge],
        removedEdges: [{ id: "e2" } as Edge],
        hasChanges: true
      };

      const summary = getDiffSummary(diff);
      expect(summary).toContain("+1 node(s)");
      expect(summary).toContain("-1 node(s)");
      expect(summary).toContain("~1 modified node(s)");
      expect(summary).toContain("+1 connection(s)");
      expect(summary).toContain("-1 connection(s)");
    });

    it("formats multiple items correctly", () => {
      const diff: GraphDiff = {
        addedNodes: [{ id: "1" } as Node, { id: "2" } as Node],
        removedNodes: [],
        modifiedNodes: [],
        addedEdges: [],
        removedEdges: [],
        hasChanges: true
      };

      expect(getDiffSummary(diff)).toBe("+2 node(s)");
    });
  });
});
