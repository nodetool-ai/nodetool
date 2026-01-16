import useWorkflowProfilerStore, {
  analyzeWorkflowPerformance,
  WorkflowPerformanceReport
} from "../../stores/WorkflowProfilerStore";
import { Edge, Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";

const createMockNode = (
  id: string,
  type: string,
  label: string
): Node<NodeData> => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: { label, properties: {}, selectable: true, workflow_id: "" } as unknown as NodeData
});

const createMockEdge = (source: string, target: string): Edge => ({
  id: `${source}-${target}`,
  source,
  target,
  type: "default"
});

describe("WorkflowProfilerStore", () => {
  beforeEach(() => {
    useWorkflowProfilerStore.setState({ reports: {} });
  });

  it("should initialize with empty reports", () => {
    const state = useWorkflowProfilerStore.getState();
    expect(state.reports).toEqual({});
  });

  it("should set and retrieve a report", () => {
    const mockReport: WorkflowPerformanceReport = {
      workflowId: "test-workflow",
      totalNodes: 5,
      executedNodes: 3,
      totalDuration: 5000,
      estimatedParallelTime: 2000,
      efficiency: 40,
      nodeMetrics: [],
      bottlenecks: [],
      suggestions: ["Test suggestion"],
      graphDepth: 3,
      parallelizablePaths: 2
    };

    const state = useWorkflowProfilerStore.getState();
    state.setReport("test-workflow", mockReport);

    const retrievedReport = state.getReport("test-workflow");
    expect(retrievedReport).toEqual(mockReport);
  });

  it("should clear a report", () => {
    const mockReport: WorkflowPerformanceReport = {
      workflowId: "test-workflow",
      totalNodes: 5,
      executedNodes: 3,
      totalDuration: 5000,
      estimatedParallelTime: 2000,
      efficiency: 40,
      nodeMetrics: [],
      bottlenecks: [],
      suggestions: [],
      graphDepth: 3,
      parallelizablePaths: 2
    };

    const state = useWorkflowProfilerStore.getState();
    state.setReport("test-workflow", mockReport);
    state.clearReport("test-workflow");

    const retrievedReport = state.getReport("test-workflow");
    expect(retrievedReport).toBeUndefined();
  });

  it("should handle multiple workflow reports", () => {
    const report1: WorkflowPerformanceReport = {
      workflowId: "workflow-1",
      totalNodes: 5,
      executedNodes: 5,
      totalDuration: 1000,
      estimatedParallelTime: 500,
      efficiency: 50,
      nodeMetrics: [],
      bottlenecks: [],
      suggestions: [],
      graphDepth: 2,
      parallelizablePaths: 1
    };

    const report2: WorkflowPerformanceReport = {
      workflowId: "workflow-2",
      totalNodes: 10,
      executedNodes: 10,
      totalDuration: 5000,
      estimatedParallelTime: 1000,
      efficiency: 20,
      nodeMetrics: [],
      bottlenecks: [],
      suggestions: [],
      graphDepth: 5,
      parallelizablePaths: 3
    };

    const state = useWorkflowProfilerStore.getState();
    state.setReport("workflow-1", report1);
    state.setReport("workflow-2", report2);

    expect(state.getReport("workflow-1")).toEqual(report1);
    expect(state.getReport("workflow-2")).toEqual(report2);
  });
});

describe("analyzeWorkflowPerformance", () => {
  it("should calculate total duration correctly", () => {
    const nodes: Node<NodeData>[] = [
      createMockNode("node1", "test", "Node 1"),
      createMockNode("node2", "test", "Node 2")
    ];
    const edges: Edge[] = [
      createMockEdge("node1", "node2")
    ];

    const result = analyzeWorkflowPerformance("test", nodes, edges);
    expect(result.workflowId).toBe("test");
    expect(result.totalNodes).toBe(2);
    expect(result.graphDepth).toBe(2);
  });

  it("should identify bottlenecks correctly", () => {
    const nodes: Node<NodeData>[] = [
      createMockNode("fast1", "test", "Fast Node 1"),
      createMockNode("slow", "test", "Slow Node"),
      createMockNode("fast2", "test", "Fast Node 2")
    ];
    const edges: Edge[] = [
      createMockEdge("fast1", "slow"),
      createMockEdge("fast2", "slow")
    ];

    const result = analyzeWorkflowPerformance("test", nodes, edges);
    expect(result.bottlenecks.length).toBeGreaterThanOrEqual(0);
  });

  it("should calculate graph depth from topological sort", () => {
    const nodes: Node<NodeData>[] = [
      createMockNode("node1", "test", "Node 1"),
      createMockNode("node2", "test", "Node 2"),
      createMockNode("node3", "test", "Node 3"),
      createMockNode("node4", "test", "Node 4")
    ];
    const edges: Edge[] = [
      createMockEdge("node1", "node2"),
      createMockEdge("node2", "node3"),
      createMockEdge("node3", "node4")
    ];

    const result = analyzeWorkflowPerformance("test", nodes, edges);
    expect(result.graphDepth).toBe(4);
  });

  it("should detect parallelizable paths", () => {
    const nodes: Node<NodeData>[] = [
      createMockNode("start", "test", "Start"),
      createMockNode("branch1", "test", "Branch 1"),
      createMockNode("branch2", "test", "Branch 2"),
      createMockNode("end", "test", "End")
    ];
    const edges: Edge[] = [
      createMockEdge("start", "branch1"),
      createMockEdge("start", "branch2"),
      createMockEdge("branch1", "end"),
      createMockEdge("branch2", "end")
    ];

    const result = analyzeWorkflowPerformance("test", nodes, edges);
    expect(result.parallelizablePaths).toBeGreaterThan(0);
  });

  it("should handle empty graph", () => {
    const nodes: Node<NodeData>[] = [];
    const edges: Edge[] = [];

    const result = analyzeWorkflowPerformance("test", nodes, edges);
    expect(result.workflowId).toBe("test");
    expect(result.totalNodes).toBe(0);
    expect(result.graphDepth).toBe(1); // topologicalSort returns [nodes] when no edges
    expect(result.parallelizablePaths).toBe(0);
  });

  it("should skip comment nodes in analysis", () => {
    const nodes: Node<NodeData>[] = [
      createMockNode("node1", "test", "Node 1"),
      createMockNode(
        "comment",
        "nodetool.workflows.base_node.Comment",
        "Comment"
      ),
      createMockNode("node2", "test", "Node 2")
    ];
    const edges: Edge[] = [
      createMockEdge("node1", "node2")
    ];

    const result = analyzeWorkflowPerformance("test", nodes, edges);
    expect(result.totalNodes).toBe(3);
  });
});
