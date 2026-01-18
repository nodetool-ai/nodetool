import { renderHook, act } from "@testing-library/react";
import { useWorkflowProfiler } from "../useWorkflowProfiler";
import useWorkflowProfilerStore from "../../stores/WorkflowProfilerStore";
import useExecutionTimeStore from "../../stores/ExecutionTimeStore";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";

const createMockNodeData = (): NodeData => ({
  properties: {},
  selectable: true,
  dynamic_properties: {},
  workflow_id: "test-workflow"
});

const mockNodes: Node<NodeData>[] = [
  {
    id: "node-1",
    type: "default" as const,
    position: { x: 0, y: 0 },
    data: createMockNodeData()
  },
  {
    id: "node-2",
    type: "default" as const,
    position: { x: 100, y: 100 },
    data: createMockNodeData()
  },
];

const mockEdges: Edge[] = [
  {
    id: "edge-1",
    source: "node-1",
    target: "node-2",
    type: "default",
  },
];

describe("useWorkflowProfiler", () => {
  beforeEach(() => {
    useWorkflowProfilerStore.setState({ profiles: {}, isAnalyzing: false });
    useExecutionTimeStore.setState({ timings: {} });
  });

  it("should return initial state", () => {
    const { result } = renderHook(() =>
      useWorkflowProfiler({
        workflowId: "test-workflow",
        nodes: mockNodes,
        edges: mockEdges,
      })
    );

    expect(result.current.profile).toBeUndefined();
    expect(result.current.isAnalyzing).toBe(false);
  });

  it("should analyze workflow", () => {
    const { result } = renderHook(() =>
      useWorkflowProfiler({
        workflowId: "test-workflow-1",
        nodes: mockNodes,
        edges: mockEdges,
      })
    );

    act(() => {
      result.current.analyze();
    });

    expect(result.current.profile).toBeDefined();
    expect(result.current.profile?.workflowId).toBe("test-workflow-1");
  });

  it("should clear profile", () => {
    const { result } = renderHook(() =>
      useWorkflowProfiler({
        workflowId: "test-workflow-2",
        nodes: mockNodes,
        edges: mockEdges,
      })
    );

    act(() => {
      result.current.analyze();
    });

    expect(result.current.profile).toBeDefined();

    act(() => {
      result.current.clearProfile();
    });

    expect(result.current.profile).toBeUndefined();
  });

  it("should return execution time stats", () => {
    useExecutionTimeStore.setState({
      timings: {
        "test-workflow-3:node-1": { startTime: 1000, endTime: 1500 },
        "test-workflow-3:node-2": { startTime: 1500, endTime: 2000 },
      },
    });

    const { result } = renderHook(() =>
      useWorkflowProfiler({
        workflowId: "test-workflow-3",
        nodes: mockNodes,
        edges: mockEdges,
      })
    );

    const stats = result.current.getExecutionTimeStats();

    expect(stats.totalTime).toBe(1000);
    expect(stats.avgNodeTime).toBe(500);
    expect(stats.slowestNode).toEqual({ nodeId: "node-1", time: 500 });
  });

  it("should return zero stats when no execution times", () => {
    const { result } = renderHook(() =>
      useWorkflowProfiler({
        workflowId: "test-workflow-4",
        nodes: mockNodes,
        edges: mockEdges,
      })
    );

    const stats = result.current.getExecutionTimeStats();

    expect(stats.totalTime).toBe(0);
    expect(stats.avgNodeTime).toBe(0);
    expect(stats.slowestNode).toBeNull();
  });
});
