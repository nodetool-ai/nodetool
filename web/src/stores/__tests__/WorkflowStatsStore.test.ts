import { Node } from "@xyflow/react";
import useWorkflowStatsStore, {
  type WorkflowStats
} from "../WorkflowStatsStore";
import { NodeData } from "../NodeData";

describe("WorkflowStatsStore", () => {
  beforeEach(() => {
    useWorkflowStatsStore.setState({ stats: {} });
  });

  const createMockNodes = (
    count: number,
    types: string[]
  ): Node<NodeData>[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `node${i}`,
      type: types[i % types.length] || "default",
      position: { x: 0, y: 0 },
      data: {
        properties: {},
        selectable: true,
        dynamic_properties: {},
        workflow_id: "test"
      }
    }));
  };

  const createMockEdges = (count: number): import("@xyflow/react").Edge[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `edge${i}`,
      source: `node${i}`,
      target: `node${(i + 1) % count}`,
      sourceHandle: "output",
      targetHandle: "input"
    }));
  };

  describe("updateStats", () => {
    it("should calculate basic stats for empty workflow", () => {
      const { updateStats, getStats } = useWorkflowStatsStore.getState();

      updateStats("workflow1", [], [], [], []);

      const stats = getStats("workflow1");
      expect(stats.nodeCount).toBe(0);
      expect(stats.edgeCount).toBe(0);
      expect(stats.complexityScore).toBe(0);
    });

    it("should count nodes and edges correctly", () => {
      const { updateStats, getStats } = useWorkflowStatsStore.getState();

      const nodes = createMockNodes(5, ["default", "inputNode", "outputNode"]);
      const edges = createMockEdges(4);

      updateStats("workflow1", nodes, edges, [], []);

      const stats = getStats("workflow1");
      expect(stats.nodeCount).toBe(5);
      expect(stats.edgeCount).toBe(4);
    });

    it("should categorize nodes by type", () => {
      const { updateStats, getStats } = useWorkflowStatsStore.getState();

      const nodes = createMockNodes(4, [
        "nodetool.input.StringInput",
        "nodetool.output.StringOutput",
        "nodetool.processing.LLM",
        "groupNode"
      ]);

      updateStats("workflow1", nodes, [], [], []);

      const stats = getStats("workflow1");
      expect(stats.inputNodeCount).toBe(1);
      expect(stats.outputNodeCount).toBe(1);
      expect(stats.processingNodeCount).toBe(1);
      expect(stats.groupNodeCount).toBe(1);
    });

    it("should track node count by type", () => {
      const { updateStats, getStats } = useWorkflowStatsStore.getState();

      const nodes = createMockNodes(6, [
        "nodetool.input.StringInput",
        "nodetool.input.StringInput",
        "nodetool.input.ImageInput",
        "nodetool.output.StringOutput",
        "nodetool.processing.LLM",
        "nodetool.processing.LLM"
      ]);

      updateStats("workflow1", nodes, [], [], []);

      const stats = getStats("workflow1");
      expect(stats.nodeCountByType["nodetool.input.StringInput"]).toBe(2);
      expect(stats.nodeCountByType["nodetool.input.ImageInput"]).toBe(1);
      expect(stats.nodeCountByType["nodetool.output.StringOutput"]).toBe(1);
      expect(stats.nodeCountByType["nodetool.processing.LLM"]).toBe(2);
    });

    it("should track selection counts", () => {
      const { updateStats, getStats } = useWorkflowStatsStore.getState();

      const nodes = createMockNodes(5, ["default"]);
      const edges = createMockEdges(3);

      updateStats(
        "workflow1",
        nodes,
        edges,
        ["node0", "node2"],
        ["edge0"]
      );

      const stats = getStats("workflow1");
      expect(stats.selectedNodeCount).toBe(2);
      expect(stats.selectedEdgeCount).toBe(1);
    });

    it("should calculate complexity score correctly", () => {
      const { updateStats, getStats } = useWorkflowStatsStore.getState();

      const simpleNodes = createMockNodes(3, ["default"]);
      const simpleEdges = createMockEdges(2);

      updateStats("workflow1", simpleNodes, simpleEdges, [], []);

      const simpleStats = getStats("workflow1");
      expect(simpleStats.complexityScore).toBe(4);

      const complexNodes = createMockNodes(10, ["groupNode", "default"]);
      const complexEdges = createMockEdges(8);

      updateStats("workflow2", complexNodes, complexEdges, [], []);

      const complexStats = getStats("workflow2");
      expect(complexStats.complexityScore).toBeGreaterThan(
        simpleStats.complexityScore
      );
    });

    it("should support multiple workflows", () => {
      const { updateStats, getStats } = useWorkflowStatsStore.getState();

      updateStats("workflow1", createMockNodes(3, []), [], [], []);
      updateStats("workflow2", createMockNodes(5, []), [], [], []);

      expect(getStats("workflow1").nodeCount).toBe(3);
      expect(getStats("workflow2").nodeCount).toBe(5);
    });
  });

  describe("getStats", () => {
    it("should return default stats for non-existent workflow", () => {
      const { getStats } = useWorkflowStatsStore.getState();

      const stats = getStats("nonexistent");

      expect(stats.nodeCount).toBe(0);
      expect(stats.edgeCount).toBe(0);
      expect(stats.complexityScore).toBe(0);
      expect(stats.inputNodeCount).toBe(0);
      expect(stats.outputNodeCount).toBe(0);
    });
  });

  describe("clearStats", () => {
    it("should clear stats for a specific workflow", () => {
      const { updateStats, clearStats, getStats } = useWorkflowStatsStore.getState();

      updateStats("workflow1", createMockNodes(5, []), [], [], []);
      clearStats("workflow1");

      const stats = getStats("workflow1");
      expect(stats.nodeCount).toBe(0);
    });

    it("should not affect other workflows when clearing", () => {
      const { updateStats, clearStats, getStats } = useWorkflowStatsStore.getState();

      updateStats("workflow1", createMockNodes(5, []), [], [], []);
      updateStats("workflow2", createMockNodes(3, []), [], [], []);

      clearStats("workflow1");

      expect(getStats("workflow1").nodeCount).toBe(0);
      expect(getStats("workflow2").nodeCount).toBe(3);
    });
  });
});
