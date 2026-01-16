import useWorkflowStatsStore from "../WorkflowStatsStore";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../NodeData";

describe("WorkflowStatsStore", () => {
  beforeEach(() => {
    useWorkflowStatsStore.setState({ stats: {} });
  });

  const createMockNode = (
    id: string,
    type: string,
    position: { x: number; y: number } = { x: 0, y: 0 }
  ): Node<NodeData> => ({
    id,
    type,
    position,
    data: {
      properties: {},
      selectable: true,
      dynamic_properties: {},
      workflow_id: "test-workflow"
    },
    selected: false,
    dragging: false
  });

  const createMockEdge = (
    id: string,
    source: string,
    target: string
  ): Edge => ({
    id,
    source,
    target,
    type: "default",
    sourceHandle: null,
    targetHandle: null
  });

  describe("updateStats", () => {
    it("should calculate correct structure stats for empty workflow", () => {
      const { updateStats, getStats } = useWorkflowStatsStore.getState();

      updateStats("workflow1", [], []);

      const stats = getStats("workflow1");
      expect(stats).not.toBeNull();
      expect(stats!.structure.totalNodes).toBe(0);
      expect(stats!.structure.totalEdges).toBe(0);
      expect(stats!.structure.graphDepth).toBe(0);
    });

    it("should calculate correct node count", () => {
      const { updateStats, getStats } = useWorkflowStatsStore.getState();

      const nodes = [
        createMockNode("1", "nodetool.input.StringInput"),
        createMockNode("2", "nodetool.process.LLM"),
        createMockNode("3", "nodetool.output.TextOutput")
      ];

      updateStats("workflow1", nodes, []);

      const stats = getStats("workflow1");
      expect(stats!.structure.totalNodes).toBe(3);
    });

    it("should calculate correct edge count", () => {
      const { updateStats, getStats } = useWorkflowStatsStore.getState();

      const nodes = [
        createMockNode("1", "input"),
        createMockNode("2", "process"),
        createMockNode("3", "output")
      ];

      const edges = [
        createMockEdge("e1", "1", "2"),
        createMockEdge("e2", "2", "3")
      ];

      updateStats("workflow1", nodes, edges);

      const stats = getStats("workflow1");
      expect(stats!.structure.totalEdges).toBe(2);
    });

    it("should calculate node type breakdown", () => {
      const { updateStats, getStats } = useWorkflowStatsStore.getState();

      const nodes = [
        createMockNode("1", "nodetool.input.StringInput"),
        createMockNode("2", "nodetool.input.StringInput"),
        createMockNode("3", "nodetool.process.LLM"),
        createMockNode("4", "nodetool.output.TextOutput")
      ];

      updateStats("workflow1", nodes, []);

      const stats = getStats("workflow1");
      const breakdown = stats!.structure.nodeTypeBreakdown;

      expect(breakdown.length).toBe(3);
      expect(breakdown.find((b) => b.type === "nodetool.input.StringInput")?.count).toBe(2);
      expect(breakdown.find((b) => b.type === "nodetool.process.LLM")?.count).toBe(1);
      expect(breakdown.find((b) => b.type === "nodetool.output.TextOutput")?.count).toBe(1);
    });

    it("should calculate connected vs isolated nodes", () => {
      const { updateStats, getStats } = useWorkflowStatsStore.getState();

      const nodes = [
        createMockNode("1", "input"),
        createMockNode("2", "process"),
        createMockNode("3", "isolated")
      ];

      const edges = [createMockEdge("e1", "1", "2")];

      updateStats("workflow1", nodes, edges);

      const stats = getStats("workflow1");
      expect(stats!.structure.connectedNodes).toBe(2);
      expect(stats!.structure.isolatedNodes).toBe(1);
    });

    it("should categorize nodes as input, processing, or output", () => {
      const { updateStats, getStats } = useWorkflowStatsStore.getState();

      const nodes = [
        createMockNode("1", "nodetool.input.StringInput"),
        createMockNode("2", "nodetool.input.ImageInput"),
        createMockNode("3", "nodetool.process.LLM"),
        createMockNode("4", "nodetool.process.TextTransform"),
        createMockNode("5", "nodetool.output.TextOutput"),
        createMockNode("6", "nodetool.output.ImageOutput")
      ];

      updateStats("workflow1", nodes, []);

      const stats = getStats("workflow1");
      expect(stats!.structure.inputNodes).toBe(2);
      expect(stats!.structure.processingNodes).toBe(2);
      expect(stats!.structure.outputNodes).toBe(2);
    });

    it("should track separate workflows independently", () => {
      const { updateStats, getStats } = useWorkflowStatsStore.getState();

      const nodes1 = [createMockNode("1", "typeA")];
      const nodes2 = [createMockNode("2", "typeB"), createMockNode("3", "typeB")];

      updateStats("workflow1", nodes1, []);
      updateStats("workflow2", nodes2, []);

      const stats1 = getStats("workflow1");
      const stats2 = getStats("workflow2");

      expect(stats1!.structure.totalNodes).toBe(1);
      expect(stats2!.structure.totalNodes).toBe(2);
      expect(stats1!.structure.nodeTypeBreakdown[0].type).toBe("typeA");
      expect(stats2!.structure.nodeTypeBreakdown[0].type).toBe("typeB");
    });

    it("should update stats when nodes change", () => {
      const { updateStats, getStats } = useWorkflowStatsStore.getState();

      const initialNodes = [createMockNode("1", "typeA")];
      updateStats("workflow1", initialNodes, []);

      const updatedNodes = [
        ...initialNodes,
        createMockNode("2", "typeB")
      ];
      updateStats("workflow1", updatedNodes, []);

      const stats = getStats("workflow1");
      expect(stats!.structure.totalNodes).toBe(2);
    });

    it("should set lastUpdated timestamp", () => {
      const { updateStats, getStats } = useWorkflowStatsStore.getState();

      const beforeUpdate = Date.now();
      updateStats("workflow1", [], []);
      const afterUpdate = Date.now();

      const stats = getStats("workflow1");
      expect(stats!.lastUpdated).toBeGreaterThanOrEqual(beforeUpdate);
      expect(stats!.lastUpdated).toBeLessThanOrEqual(afterUpdate);
    });
  });

  describe("clearStats", () => {
    it("should clear stats for a specific workflow", () => {
      const { updateStats, clearStats, getStats } = useWorkflowStatsStore.getState();

      updateStats("workflow1", [createMockNode("1", "typeA")], []);
      clearStats("workflow1");

      expect(getStats("workflow1")).toBeNull();
    });

    it("should not affect other workflows", () => {
      const { updateStats, clearStats, getStats } = useWorkflowStatsStore.getState();

      updateStats("workflow1", [createMockNode("1", "typeA")], []);
      updateStats("workflow2", [createMockNode("2", "typeB")], []);

      clearStats("workflow1");

      expect(getStats("workflow1")).toBeNull();
      expect(getStats("workflow2")).not.toBeNull();
    });
  });

  describe("getStats", () => {
    it("should return null for non-existent workflow", () => {
      const { getStats } = useWorkflowStatsStore.getState();

      expect(getStats("nonexistent")).toBeNull();
    });

    it("should return stats for existing workflow", () => {
      const { updateStats, getStats } = useWorkflowStatsStore.getState();

      updateStats("workflow1", [createMockNode("1", "typeA")], []);

      const stats = getStats("workflow1");
      expect(stats).not.toBeNull();
      expect(stats!.structure).toBeDefined();
      expect(stats!.performance).toBeDefined();
    });
  });
});
