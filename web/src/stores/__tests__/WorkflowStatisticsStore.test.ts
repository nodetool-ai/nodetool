import { Node } from "@xyflow/react";
import { Edge } from "@xyflow/react";
import useWorkflowStatisticsStore, { useWorkflowStatisticsStore as useStore } from "../WorkflowStatisticsStore";
import { NodeData } from "../NodeData";

describe("WorkflowStatisticsStore", () => {
  beforeEach(() => {
    useWorkflowStatisticsStore.setState({ statistics: null });
  });

  const createMockNodes = (count: number): Node<NodeData>[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `node${i}`,
      type: i === 0 ? "workflowInput" : i === count - 1 ? "workflowOutput" : "custom",
      position: { x: i * 100, y: i * 100 },
      data: {
        properties: {},
        selectable: true,
        dynamic_properties: {},
        workflow_id: "test"
      }
    }));
  };

  const createMockEdges = (count: number): Edge[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `edge${i}`,
      source: `node${i}`,
      target: `node${i + 1}`,
      sourceHandle: `output${i}`,
      targetHandle: `input${i + 1}`
    }));
  };

  describe("calculateStatistics", () => {
    it("should calculate total node count", () => {
      const { calculateStatistics } = useStore.getState();
      const nodes = createMockNodes(5);

      calculateStatistics(nodes, []);

      const stats = useStore.getState().statistics;
      expect(stats).toBeDefined();
      expect(stats!.totalNodes).toBe(5);
    });

    it("should calculate total edge count", () => {
      const { calculateStatistics } = useStore.getState();
      const nodes = createMockNodes(5);
      const edges = createMockEdges(4);

      calculateStatistics(nodes, edges);

      const stats = useStore.getState().statistics;
      expect(stats).toBeDefined();
      expect(stats!.totalEdges).toBe(4);
    });

    it("should count node types correctly", () => {
      const { calculateStatistics } = useStore.getState();
      const nodes: Node<NodeData>[] = [
        { id: "n1", type: "image.GenerateImage", position: { x: 0, y: 0 }, data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "test" } },
        { id: "n2", type: "image.GenerateImage", position: { x: 100, y: 0 }, data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "test" } },
        { id: "n3", type: "text.LLM", position: { x: 200, y: 0 }, data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "test" } }
      ];

      calculateStatistics(nodes, []);

      const stats = useStore.getState().statistics;
      expect(stats).toBeDefined();
      expect(stats!.nodeTypeCounts["image"]).toBe(2);
      expect(stats!.nodeTypeCounts["text"]).toBe(1);
    });

    it("should identify input nodes", () => {
      const { calculateStatistics } = useStore.getState();
      const nodes = createMockNodes(3);

      calculateStatistics(nodes, []);

      const stats = useStore.getState().statistics;
      expect(stats).toBeDefined();
      expect(stats!.inputNodes).toBe(1);
    });

    it("should identify output nodes", () => {
      const { calculateStatistics } = useStore.getState();
      const nodes = createMockNodes(3);

      calculateStatistics(nodes, []);

      const stats = useStore.getState().statistics;
      expect(stats).toBeDefined();
      expect(stats!.outputNodes).toBe(1);
    });

    it("should identify connected and disconnected nodes", () => {
      const { calculateStatistics } = useStore.getState();
      const nodes: Node<NodeData>[] = [
        { id: "n1", type: "custom", position: { x: 0, y: 0 }, data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "test" } },
        { id: "n2", type: "custom", position: { x: 100, y: 0 }, data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "test" } },
        { id: "n3", type: "custom", position: { x: 200, y: 0 }, data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "test" } },
        { id: "n4", type: "custom", position: { x: 300, y: 0 }, data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "test" } }
      ];
      const edges: Edge[] = [
        { id: "e1", source: "n1", target: "n2", sourceHandle: "out", targetHandle: "in" }
      ];

      calculateStatistics(nodes, edges);

      const stats = useStore.getState().statistics;
      expect(stats).toBeDefined();
      expect(stats!.connectedNodes).toBe(2);
      expect(stats!.disconnectedNodes).toBe(2);
    });

    it("should calculate complexity score", () => {
      const { calculateStatistics } = useStore.getState();
      const nodes: Node<NodeData>[] = [
        { id: "n1", type: "a.TypeA", position: { x: 0, y: 0 }, data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "test" } },
        { id: "n2", type: "b.TypeB", position: { x: 100, y: 0 }, data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "test" } },
        { id: "n3", type: "c.TypeC", position: { x: 200, y: 0 }, data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "test" } }
      ];
      const edges: Edge[] = [
        { id: "e1", source: "n1", target: "n2", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "n2", target: "n3", sourceHandle: "out", targetHandle: "in" }
      ];

      calculateStatistics(nodes, edges);

      const stats = useStore.getState().statistics;
      expect(stats).toBeDefined();
      expect(stats!.complexityScore).toBeGreaterThan(0);
      expect(stats!.complexityScore).toBeLessThanOrEqual(100);
    });

    it("should handle empty workflow", () => {
      const { calculateStatistics } = useStore.getState();

      calculateStatistics([], []);

      const stats = useStore.getState().statistics;
      expect(stats).toBeDefined();
      expect(stats!.totalNodes).toBe(0);
      expect(stats!.totalEdges).toBe(0);
      expect(stats!.complexityScore).toBe(0);
    });

    it("should handle unknown node types", () => {
      const { calculateStatistics } = useStore.getState();
      const nodes: Node<NodeData>[] = [
        { id: "n1", type: undefined, position: { x: 0, y: 0 }, data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "test" } },
        { id: "n2", type: "custom", position: { x: 100, y: 0 }, data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "test" } }
      ];

      calculateStatistics(nodes, []);

      const stats = useStore.getState().statistics;
      expect(stats).toBeDefined();
      expect(stats!.nodeTypeCounts["unknown"]).toBe(1);
      expect(stats!.nodeTypeCounts["custom"]).toBe(1);
    });
  });

  describe("clearStatistics", () => {
    it("should clear statistics", () => {
      const { calculateStatistics, clearStatistics } = useStore.getState();
      const nodes = createMockNodes(5);

      calculateStatistics(nodes, []);
      expect(useStore.getState().statistics).toBeDefined();

      clearStatistics();

      expect(useStore.getState().statistics).toBeNull();
    });
  });

  describe("store persistence", () => {
    it("should update statistics when nodes change", () => {
      const { calculateStatistics } = useStore.getState();

      calculateStatistics(createMockNodes(3), []);
      const firstStats = useStore.getState().statistics;

      calculateStatistics(createMockNodes(5), []);
      const secondStats = useStore.getState().statistics;

      expect(firstStats!.totalNodes).toBe(3);
      expect(secondStats!.totalNodes).toBe(5);
    });

    it("should update statistics when edges change", () => {
      const { calculateStatistics } = useStore.getState();
      const nodes = createMockNodes(5);

      calculateStatistics(nodes, []);
      const firstStats = useStore.getState().statistics;

      calculateStatistics(nodes, createMockEdges(3));
      const secondStats = useStore.getState().statistics;

      expect(firstStats!.totalEdges).toBe(0);
      expect(secondStats!.totalEdges).toBe(3);
    });
  });
});
