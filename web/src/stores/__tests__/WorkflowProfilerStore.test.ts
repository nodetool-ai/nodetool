import useWorkflowProfilerStore, {
  WorkflowProfile,
} from "../WorkflowProfilerStore";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../NodeData";

const createMockNodeData = (): NodeData => ({
  properties: {},
  selectable: true,
  dynamic_properties: {},
  workflow_id: "test-workflow"
});

const createMockNodes = (count: number): Node<NodeData>[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `node-${i}`,
    type: "default" as const,
    position: { x: i * 100, y: i * 100 },
    data: createMockNodeData()
  }));
};

const createMockEdges = (count: number): Edge[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `edge-${i}`,
    source: `node-${i}`,
    target: `node-${(i + 1) % count}`,
    type: "default",
  }));
};

describe("WorkflowProfilerStore", () => {
  beforeEach(() => {
    useWorkflowProfilerStore.setState({ profiles: {}, isAnalyzing: false });
  });

  it("should analyze workflow and return profile", () => {
    const nodes = createMockNodes(3);
    const edges = [
      { id: "edge-0", source: "node-0", target: "node-1", type: "default" },
      { id: "edge-1", source: "node-1", target: "node-2", type: "default" },
    ];

    const profile = useWorkflowProfilerStore.getState().analyzeWorkflow(
      "workflow-1",
      nodes,
      edges,
      {}
    );

    expect(profile.workflowId).toBe("workflow-1");
    expect(profile.metrics.nodeCount).toBe(3);
    expect(profile.metrics.edgeCount).toBe(2);
    expect(profile.metrics.depth).toBeGreaterThan(0);
  });

  it("should detect bottlenecks from execution times", () => {
    const nodes = createMockNodes(3);
    const edges = [
      { id: "edge-0", source: "node-0", target: "node-1", type: "default" },
      { id: "edge-1", source: "node-1", target: "node-2", type: "default" },
    ];

    const executionTimes = {
      "node-0": 100,
      "node-1": 5000,
      "node-2": 200,
    };

    const profile = useWorkflowProfilerStore.getState().analyzeWorkflow(
      "workflow-2",
      nodes,
      edges,
      executionTimes
    );

    expect(profile.bottlenecks.length).toBeGreaterThan(0);
    expect(profile.bottlenecks[0].nodeId).toBe("node-1");
    expect(profile.bottlenecks[0].avgExecutionTime).toBe(5000);
  });

  it("should detect parallel opportunities", () => {
    const nodes = createMockNodes(4);
    const edges = [
      { id: "edge-0", source: "node-0", target: "node-2", type: "default" },
      { id: "edge-1", source: "node-1", target: "node-2", type: "default" },
      { id: "edge-2", source: "node-2", target: "node-3", type: "default" },
    ];

    const profile = useWorkflowProfilerStore.getState().analyzeWorkflow(
      "workflow-3",
      nodes,
      edges,
      {}
    );

    expect(profile.parallelOpportunities.length).toBeGreaterThan(0);
  });

  it("should detect structural issues", () => {
    const nodes = createMockNodes(2);
    const edges: Edge[] = [];

    const profile = useWorkflowProfilerStore.getState().analyzeWorkflow(
      "workflow-4",
      nodes,
      edges,
      {}
    );

    expect(profile.structuralIssues.length).toBeGreaterThan(0);
    expect(profile.structuralIssues[0].type).toBe("orphan");
  });

  it("should get profile by workflow id", () => {
    const nodes = createMockNodes(2);
    const edges: Edge[] = [];

    useWorkflowProfilerStore.getState().analyzeWorkflow(
      "workflow-5",
      nodes,
      edges,
      {}
    );

    const profile = useWorkflowProfilerStore.getState().getProfile("workflow-5");

    expect(profile).toBeDefined();
    expect(profile?.workflowId).toBe("workflow-5");
  });

  it("should return undefined for non-existent profile", () => {
    const profile = useWorkflowProfilerStore.getState().getProfile(
      "non-existent"
    );

    expect(profile).toBeUndefined();
  });

  it("should clear specific profile", () => {
    const nodes = createMockNodes(2);
    const edges: Edge[] = [];

    useWorkflowProfilerStore.getState().analyzeWorkflow(
      "workflow-6",
      nodes,
      edges,
      {}
    );

    expect(useWorkflowProfilerStore.getState().getProfile("workflow-6")).toBeDefined();

    useWorkflowProfilerStore.getState().clearProfile("workflow-6");

    expect(useWorkflowProfilerStore.getState().getProfile("workflow-6")).toBeUndefined();
  });

  it("should clear all profiles", () => {
    const nodes = createMockNodes(2);
    const edges: Edge[] = [];

    useWorkflowProfilerStore.getState().analyzeWorkflow(
      "workflow-7",
      nodes,
      edges,
      {}
    );

    useWorkflowProfilerStore.getState().analyzeWorkflow(
      "workflow-8",
      nodes,
      edges,
      {}
    );

    expect(Object.keys(useWorkflowProfilerStore.getState().profiles).length).toBe(2);

    useWorkflowProfilerStore.getState().clearAllProfiles();

    expect(Object.keys(useWorkflowProfilerStore.getState().profiles).length).toBe(0);
  });

  it("should set isAnalyzing during analysis", () => {
    const nodes = createMockNodes(50);
    const edges: Edge[] = [];

    expect(useWorkflowProfilerStore.getState().isAnalyzing).toBe(false);

    useWorkflowProfilerStore.getState().analyzeWorkflow(
      "workflow-9",
      nodes,
      edges,
      {}
    );

    expect(useWorkflowProfilerStore.getState().isAnalyzing).toBe(false);
  });

  it("should calculate metrics correctly", () => {
    const nodes = createMockNodes(5);
    const edges = [
      { id: "edge-0", source: "node-0", target: "node-1", type: "default" },
      { id: "edge-1", source: "node-1", target: "node-2", type: "default" },
      { id: "edge-2", source: "node-2", target: "node-3", type: "default" },
      { id: "edge-3", source: "node-3", target: "node-4", type: "default" },
    ];

    const profile = useWorkflowProfilerStore.getState().analyzeWorkflow(
      "workflow-10",
      nodes,
      edges,
      {}
    );

    expect(profile.metrics.nodeCount).toBe(5);
    expect(profile.metrics.edgeCount).toBe(4);
    expect(profile.metrics.density).toBeCloseTo(0.8, 1);
  });
});
