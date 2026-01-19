/**
 * WorkflowProfilerStore Tests
 */
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../NodeData";
import useWorkflowProfilerStore, {
  PerformanceMetric,
  WorkflowProfile,
} from "../WorkflowProfilerStore";

describe("WorkflowProfilerStore", () => {
  let store: ReturnType<typeof useWorkflowProfilerStore.getState>;
  const workflowId = "test-workflow-1";

  const createMockNodeData = (): NodeData => ({
    properties: {},
    selectable: true,
    dynamic_properties: {},
    workflow_id: workflowId,
  });

  const createMockNodes = (
    overrides: Partial<Node<NodeData>>[] = []
  ): Node<NodeData>[] => {
    const defaultNode: Partial<Node<NodeData>> = {
      id: "node-1",
      type: "nodetool.input.StringInput",
      position: { x: 0, y: 0 },
      data: createMockNodeData(),
    };
    return overrides.map((o, i) => ({
      ...defaultNode,
      ...o,
      id: o.id || `node-${i + 1}`,
      data: createMockNodeData(),
    })) as Node<NodeData>[];
  };

  const createMockEdges = (overrides: Partial<Edge>[] = []): Edge[] => {
    return overrides.map((o, i) => ({
      id: `edge-${i + 1}`,
      source: o.source || "node-1",
      target: o.target || "node-2",
      ...o,
    }));
  };

  beforeEach(() => {
    store = useWorkflowProfilerStore.getState();
    store.clearProfile(workflowId);
  });

  describe("analyzeWorkflow", () => {
    it("should create a profile for a simple workflow", () => {
      const nodes = createMockNodes([
        { id: "node-1", type: "nodetool.input.StringInput" },
        { id: "node-2", type: "nodetool.output.StringOutput" },
      ]);
      const edges = createMockEdges([
        { source: "node-1", target: "node-2" },
      ]);

      const profile = store.analyzeWorkflow(workflowId, nodes, edges);

      expect(profile).toBeDefined();
      expect(profile.workflowId).toBe(workflowId);
      expect(profile.nodeCount).toBe(2);
      expect(profile.timestamp).toBeDefined();
    });

    it("should estimate total execution time based on node types", () => {
      const nodes = createMockNodes([
        { id: "node-1", type: "nodetool.input.StringInput" },
        { id: "node-2", type: "nodetool.models.LLM" },
        { id: "node-3", type: "nodetool.output.StringOutput" },
      ]);
      const edges = createMockEdges([
        { source: "node-1", target: "node-2" },
        { source: "node-2", target: "node-3" },
      ]);

      const profile = store.analyzeWorkflow(workflowId, nodes, edges);

      expect(profile.totalEstimatedTime).toBeGreaterThan(0);
      expect(profile.bottleneckNodes.length).toBeGreaterThan(0);
      expect(profile.bottleneckNodes[0].nodeType).toBe("nodetool.models.LLM");
    });

    it("should identify bottlenecks correctly", () => {
      const nodes = createMockNodes([
        { id: "node-1", type: "nodetool.input.StringInput" },
        { id: "node-2", type: "nodetool.models.ImageGeneration" },
        { id: "node-3", type: "nodetool.output.StringOutput" },
      ]);
      const edges = createMockEdges([
        { source: "node-1", target: "node-2" },
        { source: "node-2", target: "node-3" },
      ]);

      const profile = store.analyzeWorkflow(workflowId, nodes, edges);

      expect(profile.bottleneckNodes.length).toBeGreaterThan(0);
      const bottleneckIds = profile.bottleneckNodes.map((n) => n.nodeId);
      expect(bottleneckIds).toContain("node-2");
    });

    it("should analyze execution layers correctly", () => {
      const nodes = createMockNodes([
        { id: "node-1", type: "nodetool.input.StringInput" },
        { id: "node-2", type: "nodetool.input.IntegerInput" },
        { id: "node-3", type: "nodetool.processing.StringProcessing" },
        { id: "node-4", type: "nodetool.output.StringOutput" },
      ]);
      const edges = createMockEdges([
        { source: "node-1", target: "node-3" },
        { source: "node-2", target: "node-3" },
        { source: "node-3", target: "node-4" },
      ]);

      const profile = store.analyzeWorkflow(workflowId, nodes, edges);

      expect(profile.layerAnalysis.layers.length).toBeGreaterThan(0);
      expect(profile.layerAnalysis.maxParallelism).toBeGreaterThanOrEqual(2);
    });

    it("should generate optimization suggestions", () => {
      const nodes = createMockNodes([
        { id: "node-1", type: "nodetool.input.StringInput" },
        { id: "node-2", type: "nodetool.models.LLM" },
        { id: "node-3", type: "nodetool.output.StringOutput" },
      ]);
      const edges = createMockEdges([
        { source: "node-1", target: "node-2" },
        { source: "node-2", target: "node-3" },
      ]);

      const profile = store.analyzeWorkflow(workflowId, nodes, edges);

      expect(profile.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe("getProfile", () => {
    it("should return undefined for non-existent workflow", () => {
      const profile = store.getProfile("non-existent");
      expect(profile).toBeUndefined();
    });

    it("should return profile after analysis", () => {
      const nodes = createMockNodes();
      const edges: Edge[] = [];

      store.analyzeWorkflow(workflowId, nodes, edges);
      const profile = store.getProfile(workflowId);

      expect(profile).toBeDefined();
      expect(profile?.workflowId).toBe(workflowId);
    });
  });

  describe("updateActualTime", () => {
    it("should update actual execution time for a node", () => {
      const nodes = createMockNodes([
        { id: "node-1", type: "nodetool.input.StringInput" },
      ]);
      const edges: Edge[] = [];

      store.analyzeWorkflow(workflowId, nodes, edges);
      store.updateActualTime(workflowId, "node-1", 1500);

      const profile = store.getProfile(workflowId);
      expect(profile?.totalActualTime).toBe(1500);
    });
  });

  describe("clearProfile", () => {
    it("should remove profile from store", () => {
      const nodes = createMockNodes();
      const edges: Edge[] = [];

      store.analyzeWorkflow(workflowId, nodes, edges);
      expect(store.getProfile(workflowId)).toBeDefined();

      store.clearProfile(workflowId);
      expect(store.getProfile(workflowId)).toBeUndefined();
    });
  });

  describe("getSuggestions", () => {
    it("should return empty array for non-existent workflow", () => {
      const suggestions = store.getSuggestions("non-existent");
      expect(suggestions).toEqual([]);
    });

    it("should return suggestions after analysis", () => {
      const nodes = createMockNodes([
        { id: "node-1", type: "nodetool.models.LLM" },
        { id: "node-2", type: "nodetool.output.StringOutput" },
      ]);
      const edges = createMockEdges([
        { source: "node-1", target: "node-2" },
      ]);

      store.analyzeWorkflow(workflowId, nodes, edges);
      const suggestions = store.getSuggestions(workflowId);

      expect(suggestions.length).toBeGreaterThan(0);
    });
  });
});

describe("WorkflowProfilerStore - Node Type Estimates", () => {
  let store: ReturnType<typeof useWorkflowProfilerStore.getState>;
  const workflowId = "test-workflow-2";

  beforeEach(() => {
    store = useWorkflowProfilerStore.getState();
    store.clearProfile(workflowId);
  });

  it("should have estimates for common node types", () => {
    const createNodeData = (): NodeData => ({
      properties: {},
      selectable: true,
      dynamic_properties: {},
      workflow_id: workflowId,
    });

    const nodes: Node<NodeData>[] = [
      {
        id: "input-1",
        type: "nodetool.input.StringInput",
        position: { x: 0, y: 0 },
        data: createNodeData(),
      },
      {
        id: "llm-1",
        type: "nodetool.models.LLM",
        position: { x: 100, y: 0 },
        data: createNodeData(),
      },
    ];
    const edges: Edge[] = [
      { id: "e1", source: "input-1", target: "llm-1" },
    ];

    const profile = store.analyzeWorkflow(workflowId, nodes, edges);

    expect(profile.totalEstimatedTime).toBeGreaterThan(0);
    expect(profile.bottleneckNodes.some((n) => n.nodeId === "llm-1")).toBe(true);
  });
});
