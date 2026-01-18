import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WorkflowProfilerPanel } from "../WorkflowProfilerPanel";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../../../stores/NodeData";
import useWorkflowProfilerStore from "../../../stores/WorkflowProfilerStore";
import useExecutionTimeStore from "../../../stores/ExecutionTimeStore";

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

describe("WorkflowProfilerPanel", () => {
  beforeEach(() => {
    useWorkflowProfilerStore.setState({ profiles: {}, isAnalyzing: false });
    useExecutionTimeStore.setState({ timings: {} });
  });

  it("should render without crashing", () => {
    render(
      <WorkflowProfilerPanel
        workflowId="test-workflow"
        nodes={mockNodes}
        edges={mockEdges}
      />
    );

    expect(screen.getByText("Workflow Profiler")).toBeInTheDocument();
  });

  it("should show analyze button", () => {
    render(
      <WorkflowProfilerPanel
        workflowId="test-workflow-1"
        nodes={mockNodes}
        edges={mockEdges}
      />
    );

    expect(screen.getByText("Analyze")).toBeInTheDocument();
  });

  it("should show placeholder when no profile exists", () => {
    render(
      <WorkflowProfilerPanel
        workflowId="test-workflow-2"
        nodes={mockNodes}
        edges={mockEdges}
      />
    );

    expect(
      screen.getByText(/Run the workflow at least once/i)
    ).toBeInTheDocument();
  });

  it("should analyze workflow when button is clicked", async () => {
    render(
      <WorkflowProfilerPanel
        workflowId="test-workflow-3"
        nodes={mockNodes}
        edges={mockEdges}
      />
    );

    fireEvent.click(screen.getByText("Analyze"));

    await waitFor(() => {
      expect(screen.queryByText(/Run the workflow at least once/i)).not.toBeInTheDocument();
    });
  });

  it("should display metrics after analysis", async () => {
    render(
      <WorkflowProfilerPanel
        workflowId="test-workflow-4"
        nodes={mockNodes}
        edges={mockEdges}
      />
    );

    fireEvent.click(screen.getByText("Analyze"));

    await waitFor(() => {
      expect(screen.getByText("Nodes")).toBeInTheDocument();
      expect(screen.getByText("Connections")).toBeInTheDocument();
      expect(screen.getByText("Structure Metrics")).toBeInTheDocument();
    });
  });

  it("should show bottleneck section when bottlenecks exist", async () => {
    useExecutionTimeStore.setState({
      timings: {
        "test-workflow-5:node-1": { startTime: 0, endTime: 10000 },
        "test-workflow-5:node-2": { startTime: 100, endTime: 150 },
        "test-workflow-5:node-3": { startTime: 200, endTime: 250 },
      },
    });

    const bottleneckNodes: Node<NodeData>[] = [
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
      {
        id: "node-3",
        type: "default" as const,
        position: { x: 200, y: 200 },
        data: createMockNodeData()
      },
    ];

    render(
      <WorkflowProfilerPanel
        workflowId="test-workflow-5"
        nodes={bottleneckNodes}
        edges={[]}
      />
    );

    fireEvent.click(screen.getByText("Analyze"));

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("Bottleneck"))).toBeInTheDocument();
    });
  });

  it("should show structural issues when detected", async () => {
    const orphanNodes: Node<NodeData>[] = [
      {
        id: "orphan-node",
        type: "default" as const,
        position: { x: 0, y: 0 },
        data: createMockNodeData()
      },
    ];

    render(
      <WorkflowProfilerPanel
        workflowId="test-workflow-6"
        nodes={orphanNodes}
        edges={[]}
      />
    );

    fireEvent.click(screen.getByText("Analyze"));

    await waitFor(() => {
      expect(screen.getByText(/Structural Issues/i)).toBeInTheDocument();
    });
  });

  it("should show parallel opportunities section", async () => {
    const parallelNodes: Node<NodeData>[] = [
      { id: "node-1", type: "default" as const, position: { x: 0, y: 0 }, data: createMockNodeData() },
      { id: "node-2", type: "default" as const, position: { x: 100, y: 0 }, data: createMockNodeData() },
      { id: "node-3", type: "default" as const, position: { x: 200, y: 0 }, data: createMockNodeData() },
    ];

    const parallelEdges: Edge[] = [
      { id: "e1", source: "node-1", target: "node-3", type: "default" },
      { id: "e2", source: "node-2", target: "node-3", type: "default" },
    ];

    render(
      <WorkflowProfilerPanel
        workflowId="test-workflow-7"
        nodes={parallelNodes}
        edges={parallelEdges}
      />
    );

    fireEvent.click(screen.getByText("Analyze"));

    await waitFor(() => {
      expect(screen.getByText(/Parallel Opportunities/i)).toBeInTheDocument();
    });
  });
});
