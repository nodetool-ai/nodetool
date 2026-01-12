import { subgraph, topologicalSort, calculateWorkflowStats, getWorkflowComplexityLevel, getNodeTypeInfo } from "../graph";
import type { Edge, Node } from "@xyflow/react";
import type { NodeData } from "../../stores/NodeData";

// Helper function to create a test node
const createNode = (id: string, type = "test-node"): Node<NodeData> => ({
  id,
  type,
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
      // Diamond patterns include both merge edges since all visited nodes are kept.
      expect(result.edges).toHaveLength(4);
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
      // Edges A->B and B->C should be included
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

  describe("calculateWorkflowStats", () => {
    it("returns correct stats for empty workflow", () => {
      const nodes: Node<NodeData>[] = [];
      const edges: Edge[] = [];

      const result = calculateWorkflowStats(nodes, edges);

      expect(result.nodeCount).toBe(0);
      expect(result.edgeCount).toBe(0);
      expect(result.workflowDepth).toBe(1);
      expect(result.hasCycles).toBe(false);
      expect(result.sourceNodes).toBe(0);
      expect(result.sinkNodes).toBe(0);
    });

    it("calculates correct stats for simple linear workflow", () => {
      const nodes = [
        createNode("A"),
        createNode("B"),
        createNode("C")
      ];
      const edges = [createEdge("A", "B"), createEdge("B", "C")];

      const result = calculateWorkflowStats(nodes, edges);

      expect(result.nodeCount).toBe(3);
      expect(result.edgeCount).toBe(2);
      expect(result.workflowDepth).toBe(3);
      expect(result.hasCycles).toBe(false);
      expect(result.sourceNodes).toBe(1);
      expect(result.sinkNodes).toBe(1);
    });

    it("calculates correct stats for branching workflow", () => {
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

      const result = calculateWorkflowStats(nodes, edges);

      expect(result.nodeCount).toBe(4);
      expect(result.edgeCount).toBe(4);
      expect(result.workflowDepth).toBe(3);
      expect(result.hasCycles).toBe(false);
      expect(result.sourceNodes).toBe(1);
      expect(result.sinkNodes).toBe(1);
      expect(result.branchingFactor).toBe(1);
    });

    it("detects cycles in workflow", () => {
      const nodes = [
        createNode("A"),
        createNode("B"),
        createNode("C")
      ];
      const edges = [
        createEdge("A", "B"),
        createEdge("B", "C"),
        createEdge("C", "A")
      ];

      const result = calculateWorkflowStats(nodes, edges);

      expect(result.hasCycles).toBe(true);
    });

    it("groups nodes by type correctly", () => {
      const nodes = [
        createNode("A", "nodetool.input.StringInput"),
        createNode("B", "nodetool.input.StringInput"),
        createNode("C", "nodetool.output.StringOutput")
      ];
      const edges = [
        createEdge("A", "C"),
        createEdge("B", "C")
      ];

      const result = calculateWorkflowStats(nodes, edges);

      expect(result.nodeCountsByType["String Input"]).toBe(2);
      expect(result.nodeCountsByType["String Output"]).toBe(1);
    });

    it("groups nodes by category correctly", () => {
      const nodes = [
        createNode("A", "nodetool.input.StringInput"),
        createNode("B", "nodetool.output.StringOutput"),
        createNode("C", "nodetool.processing.StringProcessor")
      ];
      const edges = [
        createEdge("A", "C"),
        createEdge("C", "B")
      ];

      const result = calculateWorkflowStats(nodes, edges);

      expect(result.nodeCountsByCategory["Inputs"]).toBe(1);
      expect(result.nodeCountsByCategory["Outputs"]).toBe(1);
      expect(result.nodeCountsByCategory["Processing"]).toBe(1);
    });

    it("calculates branching factor correctly", () => {
      const nodes = [
        createNode("A"),
        createNode("B"),
        createNode("C"),
        createNode("D")
      ];
      const edges = [
        createEdge("A", "B"),
        createEdge("A", "C"),
        createEdge("A", "D")
      ];

      const result = calculateWorkflowStats(nodes, edges);

      expect(result.branchingFactor).toBe(0.75);
    });
  });

  describe("getNodeTypeInfo", () => {
    it("categorizes input nodes correctly", () => {
      const info = getNodeTypeInfo("nodetool.input.StringInput");

      expect(info.category).toBe("Inputs");
      expect(info.displayName).toBe("String Input");
    });

    it("categorizes output nodes correctly", () => {
      const info = getNodeTypeInfo("nodetool.output.ImageOutput");

      expect(info.category).toBe("Outputs");
      expect(info.displayName).toBe("Image Output");
    });

    it("categorizes processing nodes correctly", () => {
      const info = getNodeTypeInfo("nodetool.processing.ImageProcessor");

      expect(info.category).toBe("Processing");
      expect(info.displayName).toBe("Image Processor");
    });

    it("categorizes control flow nodes correctly", () => {
      const info = getNodeTypeInfo("nodetool.control.If");

      expect(info.category).toBe("Control Flow");
      expect(info.displayName).toBe("If");
    });

    it("categorizes unknown node types as Other", () => {
      const info = getNodeTypeInfo("custom.unknown.NodeType");

      expect(info.category).toBe("Other");
      expect(info.displayName).toBe("Node Type");
    });
  });

  describe("getWorkflowComplexityLevel", () => {
    it("returns simple for small, shallow workflows", () => {
      const nodes = [createNode("A"), createNode("B")];
      const edges = [createEdge("A", "B")];
      const stats = calculateWorkflowStats(nodes, edges);

      expect(getWorkflowComplexityLevel(stats)).toBe("simple");
    });

    it("returns complex for large, deep workflows", () => {
      const nodes = Array.from({ length: 60 }, (_, i) => createNode(String(i)));
      const edges: Edge[] = [];
      for (let i = 0; i < nodes.length - 1; i++) {
        edges.push(createEdge(String(i), String(i + 1)));
      }
      const stats = calculateWorkflowStats(nodes, edges);

      expect(getWorkflowComplexityLevel(stats)).toBe("complex");
    });

    it("returns moderate for medium workflows", () => {
      const nodes = Array.from({ length: 30 }, (_, i) => createNode(String(i)));
      const edges: Edge[] = [];
      for (let i = 0; i < nodes.length - 1; i++) {
        edges.push(createEdge(String(i), String(i + 1)));
      }
      const stats = calculateWorkflowStats(nodes, edges);

      expect(getWorkflowComplexityLevel(stats)).toBe("moderate");
    });
  });
});
