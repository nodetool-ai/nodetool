import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProfilerPanel } from "../ProfilerPanel";
import usePerformanceProfilerStore from "../../../stores/PerformanceProfilerStore";
import { useNodes } from "../../../contexts/NodeContext";

jest.mock("../../../stores/PerformanceProfilerStore");
jest.mock("../../../contexts/NodeContext");

const mockUsePerformanceProfilerStore = usePerformanceProfilerStore as jest.MockedFunction<
  typeof usePerformanceProfilerStore
>;

const mockUseNodeStore = useNodes as jest.MockedFunction<
  typeof useNodes
>;

describe("ProfilerPanel", () => {
  const mockWorkflowId = "test-workflow-123";

  const mockProfile = {
    workflowId: mockWorkflowId,
    workflowName: "Test Workflow",
    totalDuration: 15000,
    nodeMetrics: {
      "node-1": {
        nodeId: "node-1",
        nodeType: "nodetool.llm.LLM",
        nodeName: "LLM Node",
        duration: 8000,
        calls: 1,
        avgDuration: 8000,
        maxDuration: 8000,
        minDuration: 8000,
        timestamp: Date.now()
      },
      "node-2": {
        nodeId: "node-2",
        nodeType: "nodetool.input.StringInput",
        nodeName: "String Input",
        duration: 100,
        calls: 1,
        avgDuration: 100,
        maxDuration: 100,
        minDuration: 100,
        timestamp: Date.now()
      }
    },
    bottlenecks: ["node-1"],
    parallelChains: [],
    startTime: Date.now() - 15000
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockUsePerformanceProfilerStore.mockReturnValue({
      profiles: { [mockWorkflowId]: mockProfile },
      isProfiling: false,
      currentWorkflowId: null,
      startProfiling: jest.fn(),
      stopProfiling: jest.fn(),
      recordNodeExecution: jest.fn(),
      getProfile: jest.fn(),
      getBottlenecks: jest.fn().mockReturnValue([
        mockProfile.nodeMetrics["node-1"]
      ]),
      clearProfile: jest.fn(),
      clearAllProfiles: jest.fn()
    });

    mockUseNodeStore.mockReturnValue({
      nodes: [
        { id: "node-1", data: { workflowName: "Test Workflow" } }
      ]
    } as any);
  });

  it("shows empty state when no profile exists", () => {
    mockUsePerformanceProfilerStore.mockReturnValue({
      profiles: {},
      isProfiling: false,
      currentWorkflowId: null,
      startProfiling: jest.fn(),
      stopProfiling: jest.fn(),
      recordNodeExecution: jest.fn(),
      getProfile: jest.fn(),
      getBottlenecks: jest.fn().mockReturnValue([]),
      clearProfile: jest.fn(),
      clearAllProfiles: jest.fn()
    });

    render(<ProfilerPanel workflowId={mockWorkflowId} />);
    
    expect(screen.getByText("No profiling data available")).toBeInTheDocument();
  });

  it("displays performance metrics when profile exists", () => {
    render(<ProfilerPanel workflowId={mockWorkflowId} />);
    
    expect(screen.getByText("Performance Profiler")).toBeInTheDocument();
    expect(screen.getByText("15s")).toBeInTheDocument();
    expect(screen.getByText("2 nodes")).toBeInTheDocument();
    expect(screen.getByText("1 bottleneck")).toBeInTheDocument();
  });

  it("displays bottleneck warning", () => {
    render(<ProfilerPanel workflowId={mockWorkflowId} />);
    
    expect(screen.getByText("Performance Bottlenecks Detected")).toBeInTheDocument();
    expect(screen.getByText("LLM Node")).toBeInTheDocument();
  });

  it("expands node metrics on click", () => {
    render(<ProfilerPanel workflowId={mockWorkflowId} />);
    
    const llmNodeItem = screen.getByText("LLM Node").closest("li");
    expect(llmNodeItem).toBeInTheDocument();
    
    fireEvent.click(llmNodeItem!);
    
    expect(screen.getByText("Average")).toBeInTheDocument();
    expect(screen.getByText("8s")).toBeInTheDocument();
  });

  it("handles profiling state", () => {
    mockUsePerformanceProfilerStore.mockReturnValue({
      profiles: {},
      isProfiling: true,
      currentWorkflowId: mockWorkflowId,
      startProfiling: jest.fn(),
      stopProfiling: jest.fn(),
      recordNodeExecution: jest.fn(),
      getProfile: jest.fn(),
      getBottlenecks: jest.fn().mockReturnValue([]),
      clearProfile: jest.fn(),
      clearAllProfiles: jest.fn()
    });

    render(<ProfilerPanel workflowId={mockWorkflowId} />);
    
    expect(screen.getByText("Recording")).toBeInTheDocument();
  });
});
