import { computeGraphDiff, getDiffSummary } from "../graphDiff";
import { Graph } from "../../stores/ApiTypes";

describe("graphDiff", () => {
  const baseGraph: Graph = {
    nodes: [
      {
        id: "node-1",
        type: "test.nodeA",
        sync_mode: "on_any",
        data: { value: 1, name: "Node 1" }
      },
      {
        id: "node-2",
        type: "test.nodeB",
        sync_mode: "on_any",
        data: { value: 2, name: "Node 2" }
      }
    ],
    edges: [
      {
        source: "node-1",
        sourceHandle: "output",
        target: "node-2",
        targetHandle: "input"
      }
    ]
  };

  describe("computeGraphDiff", () => {
    it("should detect no changes when graphs are identical", () => {
      const diff = computeGraphDiff(baseGraph, baseGraph);

      expect(diff.hasChanges).toBe(false);
      expect(diff.addedNodes).toHaveLength(0);
      expect(diff.removedNodes).toHaveLength(0);
      expect(diff.modifiedNodes).toHaveLength(0);
      expect(diff.addedEdges).toHaveLength(0);
      expect(diff.removedEdges).toHaveLength(0);
    });

    it("should detect added nodes", () => {
      const newGraph: Graph = {
        ...baseGraph,
        nodes: [
          ...baseGraph.nodes,
          {
            id: "node-3",
            type: "test.nodeC",
            sync_mode: "on_any",
            data: { value: 3 }
          }
        ]
      };

      const diff = computeGraphDiff(baseGraph, newGraph);

      expect(diff.hasChanges).toBe(true);
      expect(diff.addedNodes).toHaveLength(1);
      expect(diff.addedNodes[0].id).toBe("node-3");
      expect(diff.removedNodes).toHaveLength(0);
    });

    it("should detect removed nodes", () => {
      const newGraph: Graph = {
        ...baseGraph,
        nodes: [baseGraph.nodes[0]],
        edges: []
      };

      const diff = computeGraphDiff(baseGraph, newGraph);

      expect(diff.hasChanges).toBe(true);
      expect(diff.removedNodes).toHaveLength(1);
      expect(diff.removedNodes[0].id).toBe("node-2");
      expect(diff.addedNodes).toHaveLength(0);
    });

    it("should detect modified nodes", () => {
      const newGraph: Graph = {
        ...baseGraph,
        nodes: [
          {
            ...baseGraph.nodes[0],
            data: { value: 100, name: "Modified Node 1" }
          },
          baseGraph.nodes[1]
        ]
      };

      const diff = computeGraphDiff(baseGraph, newGraph);

      expect(diff.hasChanges).toBe(true);
      expect(diff.modifiedNodes).toHaveLength(1);
      expect(diff.modifiedNodes[0].nodeId).toBe("node-1");
      expect(diff.modifiedNodes[0].changes.length).toBeGreaterThan(0);
    });

    it("should detect added edges", () => {
      const newGraph: Graph = {
        ...baseGraph,
        edges: [
          ...baseGraph.edges,
          {
            source: "node-2",
            sourceHandle: "output",
            target: "node-1",
            targetHandle: "input"
          }
        ]
      };

      const diff = computeGraphDiff(baseGraph, newGraph);

      expect(diff.hasChanges).toBe(true);
      expect(diff.addedEdges).toHaveLength(1);
      expect(diff.removedEdges).toHaveLength(0);
    });

    it("should detect removed edges", () => {
      const newGraph: Graph = {
        ...baseGraph,
        edges: []
      };

      const diff = computeGraphDiff(baseGraph, newGraph);

      expect(diff.hasChanges).toBe(true);
      expect(diff.removedEdges).toHaveLength(1);
      expect(diff.addedEdges).toHaveLength(0);
    });

    it("should detect multiple changes", () => {
      const newGraph: Graph = {
        nodes: [
          {
            id: "node-1",
            type: "test.nodeA",
            sync_mode: "on_any",
            data: { value: 999 }
          },
          {
            id: "node-3",
            type: "test.nodeC",
            sync_mode: "on_any",
            data: {}
          }
        ],
        edges: [
          {
            source: "node-1",
            sourceHandle: "out2",
            target: "node-3",
            targetHandle: "in"
          }
        ]
      };

      const diff = computeGraphDiff(baseGraph, newGraph);

      expect(diff.hasChanges).toBe(true);
      expect(diff.addedNodes).toHaveLength(1); // node-3
      expect(diff.removedNodes).toHaveLength(1); // node-2
      expect(diff.modifiedNodes).toHaveLength(1); // node-1
      expect(diff.addedEdges).toHaveLength(1); // new edge
      expect(diff.removedEdges).toHaveLength(1); // old edge
    });

    it("should handle empty graphs", () => {
      const emptyGraph: Graph = { nodes: [], edges: [] };

      const diff1 = computeGraphDiff(emptyGraph, emptyGraph);
      expect(diff1.hasChanges).toBe(false);

      const diff2 = computeGraphDiff(emptyGraph, baseGraph);
      expect(diff2.hasChanges).toBe(true);
      expect(diff2.addedNodes).toHaveLength(2);
      expect(diff2.addedEdges).toHaveLength(1);

      const diff3 = computeGraphDiff(baseGraph, emptyGraph);
      expect(diff3.hasChanges).toBe(true);
      expect(diff3.removedNodes).toHaveLength(2);
      expect(diff3.removedEdges).toHaveLength(1);
    });
  });

  describe("getDiffSummary", () => {
    it("should return 'No changes' for identical graphs", () => {
      const diff = computeGraphDiff(baseGraph, baseGraph);
      expect(getDiffSummary(diff)).toBe("No changes");
    });

    it("should summarize added nodes", () => {
      const newGraph: Graph = {
        ...baseGraph,
        nodes: [
          ...baseGraph.nodes,
          {
            id: "node-3",
            type: "test.nodeC",
            sync_mode: "on_any",
            data: {}
          },
          {
            id: "node-4",
            type: "test.nodeD",
            sync_mode: "on_any",
            data: {}
          }
        ]
      };

      const diff = computeGraphDiff(baseGraph, newGraph);
      const summary = getDiffSummary(diff);

      expect(summary).toContain("+2 node(s)");
    });

    it("should summarize all change types", () => {
      const newGraph: Graph = {
        nodes: [
          {
            id: "node-1",
            type: "test.nodeA",
            sync_mode: "on_any",
            data: { changed: true }
          },
          {
            id: "node-3",
            type: "test.nodeC",
            sync_mode: "on_any",
            data: {}
          }
        ],
        edges: []
      };

      const diff = computeGraphDiff(baseGraph, newGraph);
      const summary = getDiffSummary(diff);

      expect(summary).toContain("+1 node(s)");
      expect(summary).toContain("-1 node(s)");
      expect(summary).toContain("~1 modified node(s)");
      expect(summary).toContain("-1 connection(s)");
    });
  });
});
