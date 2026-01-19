jest.mock("../../../stores/ProfilerStore", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      analyzePerformance: jest.fn().mockReturnValue({
        workflowId: "workflow-1",
        totalDuration: 10000,
        nodeCount: 3,
        completedCount: 3,
        errorCount: 0,
        averageNodeTime: 3333,
        slowestNode: { nodeId: "node-1", nodeName: "Model Node", nodeType: "llm", duration: 5000, percentage: 50, status: "completed" },
        fastestNode: { nodeId: "node-3", nodeName: "Output", nodeType: "output", duration: 1000, percentage: 10, status: "completed" },
        bottlenecks: [
          { nodeId: "node-1", nodeName: "Model Node", nodeType: "llm", duration: 5000, percentage: 50, status: "completed" }
        ],
        nodeTimings: [
          { nodeId: "node-1", nodeName: "Model Node", nodeType: "llm", duration: 5000, percentage: 50, status: "completed" },
          { nodeId: "node-2", nodeName: "Processor", nodeType: "processor", duration: 4000, percentage: 40, status: "completed" },
          { nodeId: "node-3", nodeName: "Output", nodeType: "output", duration: 1000, percentage: 10, status: "completed" }
        ],
        performanceScore: 75,
        recommendations: ["Review 'Model Node' for potential optimization"],
        timestamp: Date.now()
      }),
      getAnalysis: jest.fn().mockReturnValue(undefined),
      clearAnalysis: jest.fn()
    }),
    useProfilerStore: () => ({
      analyzePerformance: jest.fn().mockReturnValue({
        workflowId: "workflow-1",
        totalDuration: 10000,
        nodeCount: 3,
        completedCount: 3,
        errorCount: 0,
        averageNodeTime: 3333,
        slowestNode: { nodeId: "node-1", nodeName: "Model Node", nodeType: "llm", duration: 5000, percentage: 50, status: "completed" },
        fastestNode: { nodeId: "node-3", nodeName: "Output", nodeType: "output", duration: 1000, percentage: 10, status: "completed" },
        bottlenecks: [
          { nodeId: "node-1", nodeName: "Model Node", nodeType: "llm", duration: 5000, percentage: 50, status: "completed" }
        ],
        nodeTimings: [
          { nodeId: "node-1", nodeName: "Model Node", nodeType: "llm", duration: 5000, percentage: 50, status: "completed" },
          { nodeId: "node-2", nodeName: "Processor", nodeType: "processor", duration: 4000, percentage: 40, status: "completed" },
          { nodeId: "node-3", nodeName: "Output", nodeType: "output", duration: 1000, percentage: 10, status: "completed" }
        ],
        performanceScore: 75,
        recommendations: ["Review 'Model Node' for potential optimization"],
        timestamp: Date.now()
      }),
      getAnalysis: jest.fn(),
      clearAnalysis: jest.fn()
    })
  }
}));

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: jest.fn(() => ({
    nodeStores: {
      "workflow-1": {
        getState: () => ({
          nodes: [
            { id: "node-1", data: { label: "Model Node", nodeType: "llm" } },
            { id: "node-2", data: { label: "Processor", nodeType: "processor" } },
            { id: "node-3", data: { label: "Output", nodeType: "output" } }
          ]
        })
      }
    }
  }))
}));

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import WorkflowProfilerPanel from "../WorkflowProfilerPanel";

describe("WorkflowProfilerPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should render performance profiler panel", () => {
    render(<WorkflowProfilerPanel workflowId="workflow-1" />);

    expect(screen.getByText("Performance Profiler")).toBeInTheDocument();
    expect(screen.getByText("Score")).toBeInTheDocument();
  });

  it("should display performance score", () => {
    render(<WorkflowProfilerPanel workflowId="workflow-1" />);

    expect(screen.getByText("75")).toBeInTheDocument();
  });

  it("should show total execution time", () => {
    render(<WorkflowProfilerPanel workflowId="workflow-1" />);

    expect(screen.getByText("Total Time")).toBeInTheDocument();
    expect(screen.getByText(/10s/)).toBeInTheDocument();
  });

  it("should display node count", () => {
    render(<WorkflowProfilerPanel workflowId="workflow-1" />);

    expect(screen.getByText("Nodes")).toBeInTheDocument();
    expect(screen.getByText("3/3")).toBeInTheDocument();
  });

  it("should show bottleneck nodes", () => {
    render(<WorkflowProfilerPanel workflowId="workflow-1" />);

    expect(screen.getByText("Bottlenecks")).toBeInTheDocument();
    expect(screen.getByText("Model Node")).toBeInTheDocument();
  });

  it("should show all node timings", () => {
    render(<WorkflowProfilerPanel workflowId="workflow-1" />);

    expect(screen.getByText("All Node Timings")).toBeInTheDocument();
    expect(screen.getByText("Model Node")).toBeInTheDocument();
    expect(screen.getByText("Processor")).toBeInTheDocument();
    expect(screen.getByText("Output")).toBeInTheDocument();
  });

  it("should display recommendations", () => {
    render(<WorkflowProfilerPanel workflowId="workflow-1" />);

    expect(screen.getByText("Recommendations")).toBeInTheDocument();
    expect(screen.getByText("Review 'Model Node' for potential optimization")).toBeInTheDocument();
  });

  it("should expand node details on click", () => {
    render(<WorkflowProfilerPanel workflowId="workflow-1" />);

    const expandButton = screen.getAllByRole("button")[0];
    fireEvent.click(expandButton);

    expect(screen.getByText("node-1")).toBeInTheDocument();
    expect(screen.getByText("llm")).toBeInTheDocument();
  });
});
