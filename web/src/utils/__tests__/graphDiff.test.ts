import { computeGraphDiff, getDiffSummary, GraphDiff } from "../graphDiff";
import { Graph } from "../../stores/ApiTypes";

describe("graphDiff utilities", () => {
  describe("computeGraphDiff", () => {
    it("returns no changes for identical graphs", () => {
      const graph: Graph = {
        nodes: [{ id: "node-1", type: "test", data: {} }],
        edges: [{ id: "edge-1", source: "node-1", target: "node-2" }]
      };

      const result = computeGraphDiff(graph, graph);

      expect(result.hasChanges).toBe(false);
      expect(result.addedNodes).toHaveLength(0);
      expect(result.removedNodes).toHaveLength(0);
      expect(result.modifiedNodes).toHaveLength(0);
      expect(result.addedEdges).toHaveLength(0);
      expect(result.removedEdges).toHaveLength(0);
    });

    it("detects added nodes", () => {
      const oldGraph: Graph = {
        nodes: [{ id: "node-1", type: "test", data: {} }],
        edges: []
      };
      const newGraph: Graph = {
        nodes: [
          { id: "node-1", type: "test", data: {} },
          { id: "node-2", type: "test", data: {} }
        ],
        edges: []
      };

      const result = computeGraphDiff(oldGraph, newGraph);

      expect(result.hasChanges).toBe(true);
      expect(result.addedNodes).toHaveLength(1);
      expect(result.addedNodes[0].id).toBe("node-2");
      expect(result.removedNodes).toHaveLength(0);
    });

    it("detects removed nodes", () => {
      const oldGraph: Graph = {
        nodes: [
          { id: "node-1", type: "test", data: {} },
          { id: "node-2", type: "test", data: {} }
        ],
        edges: []
      };
      const newGraph: Graph = {
        nodes: [{ id: "node-1", type: "test", data: {} }],
        edges: []
      };

      const result = computeGraphDiff(oldGraph, newGraph);

      expect(result.hasChanges).toBe(true);
      expect(result.removedNodes).toHaveLength(1);
      expect(result.removedNodes[0].id).toBe("node-2");
    });

    it("detects added edges", () => {
      const oldGraph: Graph = {
        nodes: [{ id: "node-1", type: "test", data: {} }],
        edges: []
      };
      const newGraph: Graph = {
        nodes: [{ id: "node-1", type: "test", data: {} }],
        edges: [{ id: "edge-1", source: "node-1", target: "node-2" }]
      };

      const result = computeGraphDiff(oldGraph, newGraph);

      expect(result.hasChanges).toBe(true);
      expect(result.addedEdges).toHaveLength(1);
      expect(result.addedEdges[0].id).toBe("edge-1");
    });

    it("detects removed edges", () => {
      const oldGraph: Graph = {
        nodes: [{ id: "node-1", type: "test", data: {} }],
        edges: [{ id: "edge-1", source: "node-1", target: "node-2" }]
      };
      const newGraph: Graph = {
        nodes: [{ id: "node-1", type: "test", data: {} }],
        edges: []
      };

      const result = computeGraphDiff(oldGraph, newGraph);

      expect(result.hasChanges).toBe(true);
      expect(result.removedEdges).toHaveLength(1);
      expect(result.removedEdges[0].id).toBe("edge-1");
    });

    it("detects modified node properties", () => {
      const oldGraph: Graph = {
        nodes: [{ id: "node-1", type: "test", data: { value: "old" } }],
        edges: []
      };
      const newGraph: Graph = {
        nodes: [{ id: "node-1", type: "test", data: { value: "new" } }],
        edges: []
      };

      const result = computeGraphDiff(oldGraph, newGraph);

      expect(result.hasChanges).toBe(true);
      expect(result.modifiedNodes).toHaveLength(1);
      expect(result.modifiedNodes[0].nodeId).toBe("node-1");
      expect(result.modifiedNodes[0].changes).toHaveLength(1);
      expect(result.modifiedNodes[0].changes[0].key).toBe("value");
      expect(result.modifiedNodes[0].changes[0].oldValue).toBe("old");
      expect(result.modifiedNodes[0].changes[0].newValue).toBe("new");
    });

    it("detects modified ui_properties", () => {
      const oldGraph: Graph = {
        nodes: [{
          id: "node-1",
          type: "test",
          data: {},
          ui_properties: { color: "red" }
        }],
        edges: []
      };
      const newGraph: Graph = {
        nodes: [{
          id: "node-1",
          type: "test",
          data: {},
          ui_properties: { color: "blue" }
        }],
        edges: []
      };

      const result = computeGraphDiff(oldGraph, newGraph);

      expect(result.hasChanges).toBe(true);
      expect(result.modifiedNodes).toHaveLength(1);
      expect(result.modifiedNodes[0].changes).toHaveLength(1);
      expect(result.modifiedNodes[0].changes[0].key).toBe("ui_properties");
    });

    it("handles empty graphs", () => {
      const emptyGraph: Graph = { nodes: [], edges: [] };

      const result = computeGraphDiff(emptyGraph, emptyGraph);

      expect(result.hasChanges).toBe(false);
    });

    it("handles adding all nodes to empty graph", () => {
      const oldGraph: Graph = { nodes: [], edges: [] };
      const newGraph: Graph = {
        nodes: [
          { id: "node-1", type: "test", data: {} },
          { id: "node-2", type: "test", data: {} }
        ],
        edges: []
      };

      const result = computeGraphDiff(oldGraph, newGraph);

      expect(result.hasChanges).toBe(true);
      expect(result.addedNodes).toHaveLength(2);
      expect(result.removedNodes).toHaveLength(0);
    });

    it("handles removing all nodes from graph", () => {
      const oldGraph: Graph = {
        nodes: [
          { id: "node-1", type: "test", data: {} },
          { id: "node-2", type: "test", data: {} }
        ],
        edges: []
      };
      const newGraph: Graph = { nodes: [], edges: [] };

      const result = computeGraphDiff(oldGraph, newGraph);

      expect(result.hasChanges).toBe(true);
      expect(result.removedNodes).toHaveLength(2);
    });

    it("ignores unchanged properties", () => {
      const oldGraph: Graph = {
        nodes: [{
          id: "node-1",
          type: "test",
          data: { a: 1, b: 2 }
        }],
        edges: []
      };
      const newGraph: Graph = {
        nodes: [{
          id: "node-1",
          type: "test",
          data: { a: 1, b: 3 }
        }],
        edges: []
      };

      const result = computeGraphDiff(oldGraph, newGraph);

      expect(result.modifiedNodes[0].changes).toHaveLength(1);
      expect(result.modifiedNodes[0].changes[0].key).toBe("b");
    });

    it("detects multiple changes simultaneously", () => {
      const oldGraph: Graph = {
        nodes: [{ id: "node-1", type: "test", data: { a: 1 } }],
        edges: [{ id: "edge-1", source: "node-1", target: "node-2" }]
      };
      const newGraph: Graph = {
        nodes: [
          { id: "node-1", type: "test", data: { a: 2 } },
          { id: "node-3", type: "test", data: {} }
        ],
        edges: [{ id: "edge-2", source: "node-3", target: "node-4" }]
      };

      const result = computeGraphDiff(oldGraph, newGraph);

      expect(result.hasChanges).toBe(true);
      expect(result.addedNodes).toHaveLength(1);
      expect(result.modifiedNodes).toHaveLength(1);
      expect(result.addedEdges).toHaveLength(1);
      expect(result.removedEdges).toHaveLength(1);
    });
  });

  describe("getDiffSummary", () => {
    it("returns 'No changes' for identical graphs", () => {
      const diff: GraphDiff = {
        addedNodes: [],
        removedNodes: [],
        modifiedNodes: [],
        addedEdges: [],
        removedEdges: [],
        hasChanges: false
      };

      const result = getDiffSummary(diff);
      expect(result).toBe("No changes");
    });

    it("formats added nodes count", () => {
      const diff: GraphDiff = {
        addedNodes: [{ id: "n1", type: "test", data: {} }],
        removedNodes: [],
        modifiedNodes: [],
        addedEdges: [],
        removedEdges: [],
        hasChanges: true
      };

      const result = getDiffSummary(diff);
      expect(result).toBe("+1 node(s)");
    });

    it("formats removed nodes count", () => {
      const diff: GraphDiff = {
        addedNodes: [],
        removedNodes: [{ id: "n1", type: "test", data: {} }],
        modifiedNodes: [],
        addedEdges: [],
        removedEdges: [],
        hasChanges: true
      };

      const result = getDiffSummary(diff);
      expect(result).toBe("-1 node(s)");
    });

    it("formats modified nodes count", () => {
      const diff: GraphDiff = {
        addedNodes: [],
        removedNodes: [],
        modifiedNodes: [{ nodeId: "n1", nodeType: "test", changes: [] }],
        addedEdges: [],
        removedEdges: [],
        hasChanges: true
      };

      const result = getDiffSummary(diff);
      expect(result).toBe("~1 modified node(s)");
    });

    it("formats added edges count", () => {
      const diff: GraphDiff = {
        addedNodes: [],
        removedNodes: [],
        modifiedNodes: [],
        addedEdges: [{ id: "e1", source: "n1", target: "n2" }],
        removedEdges: [],
        hasChanges: true
      };

      const result = getDiffSummary(diff);
      expect(result).toBe("+1 connection(s)");
    });

    it("formats removed edges count", () => {
      const diff: GraphDiff = {
        addedNodes: [],
        removedNodes: [],
        modifiedNodes: [],
        addedEdges: [],
        removedEdges: [{ id: "e1", source: "n1", target: "n2" }],
        hasChanges: true
      };

      const result = getDiffSummary(diff);
      expect(result).toBe("-1 connection(s)");
    });

    it("formats multiple changes with commas", () => {
      const diff: GraphDiff = {
        addedNodes: [{ id: "n1", type: "test", data: {} }],
        removedNodes: [{ id: "n2", type: "test", data: {} }],
        modifiedNodes: [],
        addedEdges: [],
        removedEdges: [],
        hasChanges: true
      };

      const result = getDiffSummary(diff);
      expect(result).toBe("+1 node(s), -1 node(s)");
    });

    it("formats all change types", () => {
      const diff: GraphDiff = {
        addedNodes: [{ id: "n1", type: "test", data: {} }],
        removedNodes: [{ id: "n2", type: "test", data: {} }],
        modifiedNodes: [{ nodeId: "n3", nodeType: "test", changes: [] }],
        addedEdges: [{ id: "e1", source: "n1", target: "n2" }],
        removedEdges: [{ id: "e2", source: "n3", target: "n4" }],
        hasChanges: true
      };

      const result = getDiffSummary(diff);
      expect(result).toBe("+1 node(s), -1 node(s), ~1 modified node(s), +1 connection(s), -1 connection(s)");
    });
  });
});
