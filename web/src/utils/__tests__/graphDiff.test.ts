import { computeGraphDiff, getDiffSummary, GraphDiff } from "../graphDiff";
import { Graph, Node, Edge } from "../../stores/ApiTypes";

describe("graphDiff", () => {
  const createNode = (id: string, data: Record<string, unknown> = {}): Node => ({
    id,
    type: "test",
    data,
    dynamic_properties: {},
    sync_mode: "automatic" as const,
    ui_properties: {
      position: { x: 0, y: 0 },
      selected: false,
      selectable: true
    }
  });

  const createEdge = (id: string, source: string, target: string, sourceHandle?: string, targetHandle?: string): Edge => ({
    id,
    source,
    target,
    sourceHandle: sourceHandle || "",
    targetHandle: targetHandle || "",
    ui_properties: {}
  });

  const createGraph = (nodes: Node[], edges: Edge[]): Graph => ({
    nodes,
    edges
  });

  describe("computeGraphDiff", () => {
    it("returns empty diff for identical graphs", () => {
      const nodes = [createNode("1"), createNode("2")];
      const edges = [createEdge("e1", "1", "2")];
      const oldGraph = createGraph(nodes, edges);
      const newGraph = createGraph([...nodes], [...edges]);

      const diff = computeGraphDiff(oldGraph, newGraph);

      expect(diff.addedNodes).toHaveLength(0);
      expect(diff.removedNodes).toHaveLength(0);
      expect(diff.modifiedNodes).toHaveLength(0);
      expect(diff.addedEdges).toHaveLength(0);
      expect(diff.removedEdges).toHaveLength(0);
      expect(diff.hasChanges).toBe(false);
    });

    it("detects added nodes", () => {
      const oldGraph = createGraph([createNode("1")], []);
      const newGraph = createGraph([createNode("1"), createNode("2")], []);

      const diff = computeGraphDiff(oldGraph, newGraph);

      expect(diff.addedNodes).toHaveLength(1);
      expect(diff.addedNodes[0].id).toBe("2");
      expect(diff.removedNodes).toHaveLength(0);
      expect(diff.hasChanges).toBe(true);
    });

    it("detects removed nodes", () => {
      const oldGraph = createGraph([createNode("1"), createNode("2")], []);
      const newGraph = createGraph([createNode("1")], []);

      const diff = computeGraphDiff(oldGraph, newGraph);

      expect(diff.addedNodes).toHaveLength(0);
      expect(diff.removedNodes).toHaveLength(1);
      expect(diff.removedNodes[0].id).toBe("2");
      expect(diff.hasChanges).toBe(true);
    });

    it("detects added edges", () => {
      const oldGraph = createGraph([createNode("1"), createNode("2")], []);
      const newGraph = createGraph(
        [createNode("1"), createNode("2")],
        [createEdge("e1", "1", "2")]
      );

      const diff = computeGraphDiff(oldGraph, newGraph);

      expect(diff.addedEdges).toHaveLength(1);
      expect(diff.addedEdges[0].id).toBe("e1");
      expect(diff.removedEdges).toHaveLength(0);
      expect(diff.hasChanges).toBe(true);
    });

    it("detects removed edges", () => {
      const oldGraph = createGraph(
        [createNode("1"), createNode("2")],
        [createEdge("e1", "1", "2")]
      );
      const newGraph = createGraph([createNode("1"), createNode("2")], []);

      const diff = computeGraphDiff(oldGraph, newGraph);

      expect(diff.addedEdges).toHaveLength(0);
      expect(diff.removedEdges).toHaveLength(1);
      expect(diff.removedEdges[0].id).toBe("e1");
      expect(diff.hasChanges).toBe(true);
    });

    it("detects modified node properties", () => {
      const oldNode = createNode("1", { title: "Old Title", value: 10 });
      const newNode = createNode("1", { title: "New Title", value: 10 });
      const oldGraph = createGraph([oldNode], []);
      const newGraph = createGraph([newNode], []);

      const diff = computeGraphDiff(oldGraph, newGraph);

      expect(diff.modifiedNodes).toHaveLength(1);
      expect(diff.modifiedNodes[0].nodeId).toBe("1");
      expect(diff.modifiedNodes[0].changes).toHaveLength(1);
      expect(diff.modifiedNodes[0].changes[0].key).toBe("title");
      expect(diff.modifiedNodes[0].changes[0].oldValue).toBe("Old Title");
      expect(diff.modifiedNodes[0].changes[0].newValue).toBe("New Title");
      expect(diff.hasChanges).toBe(true);
    });

    it("ignores unmodified nodes", () => {
      const node = createNode("1", { title: "Same Title" });
      const oldGraph = createGraph([node], []);
      const newGraph = createGraph([node], []);

      const diff = computeGraphDiff(oldGraph, newGraph);

      expect(diff.modifiedNodes).toHaveLength(0);
      expect(diff.hasChanges).toBe(false);
    });

    it("handles empty graphs", () => {
      const emptyGraph = createGraph([], []);

      const diff = computeGraphDiff(emptyGraph, emptyGraph);

      expect(diff.hasChanges).toBe(false);
      expect(diff.addedNodes).toHaveLength(0);
      expect(diff.removedNodes).toHaveLength(0);
    });

    it("detects changes in complex graphs", () => {
      const oldGraph = createGraph(
        [createNode("1", { val: 1 }), createNode("2", { val: 2 })],
        [createEdge("e1", "1", "2")]
      );
      const newGraph = createGraph(
        [createNode("1", { val: 10 }), createNode("2", { val: 2 }), createNode("3", { val: 3 })],
        [createEdge("e1", "1", "2"), createEdge("e2", "2", "3")]
      );

      const diff = computeGraphDiff(oldGraph, newGraph);

      expect(diff.addedNodes).toHaveLength(1);
      expect(diff.addedNodes[0].id).toBe("3");
      expect(diff.removedNodes).toHaveLength(0);
      expect(diff.modifiedNodes).toHaveLength(1);
      expect(diff.modifiedNodes[0].nodeId).toBe("1");
      expect(diff.modifiedNodes[0].changes).toContainEqual({
        key: "val",
        oldValue: 1,
        newValue: 10
      });
      expect(diff.addedEdges).toHaveLength(1);
      expect(diff.addedEdges[0].id).toBe("e2");
      expect(diff.hasChanges).toBe(true);
    });

    it("detects edge changes with handles", () => {
      const oldGraph = createGraph(
        [createNode("1"), createNode("2")],
        [createEdge("e1", "1", "2", "output1", "input1")]
      );
      const newGraph = createGraph(
        [createNode("1"), createNode("2")],
        [createEdge("e1", "1", "2", "output1", "input2")]
      );

      const diff = computeGraphDiff(oldGraph, newGraph);

      expect(diff.removedEdges).toHaveLength(1);
      expect(diff.addedEdges).toHaveLength(1);
    });

    it("detects UI property changes", () => {
      const oldNode: Node = {
        ...createNode("1"),
        ui_properties: {
          position: { x: 0, y: 0 },
          selected: false,
          selectable: true
        }
      };
      const newNode: Node = {
        ...createNode("1"),
        ui_properties: {
          position: { x: 100, y: 100 },
          selected: true,
          selectable: true
        }
      };
      const oldGraph = createGraph([oldNode], []);
      const newGraph = createGraph([newNode], []);

      const diff = computeGraphDiff(oldGraph, newGraph);

      expect(diff.modifiedNodes).toHaveLength(1);
      expect(diff.modifiedNodes[0].changes.some(c => c.key === "ui_properties")).toBe(true);
    });
  });

  describe("getDiffSummary", () => {
    it("returns 'No changes' for empty diff", () => {
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
        addedNodes: [{ id: "1", type: "test", data: {}, dynamic_properties: {}, sync_mode: "automatic", ui_properties: {} }] as Node[],
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
        removedNodes: [{ id: "1", type: "test", data: {}, dynamic_properties: {}, sync_mode: "automatic", ui_properties: {} }] as Node[],
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
        addedEdges: [{}] as Edge[],
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
        removedEdges: [{}] as Edge[],
        hasChanges: true
      };

      expect(getDiffSummary(diff)).toBe("-1 connection(s)");
    });

    it("combines multiple changes", () => {
      const diff: GraphDiff = {
        addedNodes: [{}] as Node[],
        removedNodes: [{}] as Node[],
        modifiedNodes: [{ nodeId: "1", nodeType: "test", changes: [] }],
        addedEdges: [{}] as Edge[],
        removedEdges: [{}] as Edge[],
        hasChanges: true
      };

      const summary = getDiffSummary(diff);
      expect(summary).toContain("+1 node(s)");
      expect(summary).toContain("-1 node(s)");
      expect(summary).toContain("~1 modified node(s)");
      expect(summary).toContain("+1 connection(s)");
      expect(summary).toContain("-1 connection(s)");
    });

    it("handles pluralization for multiple items", () => {
      const diff: GraphDiff = {
        addedNodes: [{}, {}, {}] as Node[],
        removedNodes: [],
        modifiedNodes: [],
        addedEdges: [],
        removedEdges: [],
        hasChanges: true
      };

      expect(getDiffSummary(diff)).toBe("+3 node(s)");
    });
  });
});
