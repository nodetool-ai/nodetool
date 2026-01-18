import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PerformanceOverlay } from "../PerformanceOverlay";
import usePerformanceProfilerStore from "../../../stores/PerformanceProfilerStore";

jest.mock("../../../stores/PerformanceProfilerStore");

const mockUsePerformanceProfilerStore = usePerformanceProfilerStore as jest.MockedFunction<
  typeof usePerformanceProfilerStore
>;

describe("PerformanceOverlay", () => {
  const mockWorkflowId = "test-workflow-123";
  const mockNodeId = "node-1";
  const mockNodeType = "nodetool.llm.LLM";
  const mockNodeName = "LLM Node";

  const mockMetrics = {
    nodeId: mockNodeId,
    nodeType: mockNodeType,
    nodeName: mockNodeName,
    duration: 8000,
    calls: 1,
    avgDuration: 8000,
    maxDuration: 8000,
    minDuration: 8000,
    timestamp: Date.now()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns null when no metrics and not profiling", () => {
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

    const { container } = render(
      <PerformanceOverlay
        workflowId={mockWorkflowId}
        nodeId={mockNodeId}
        nodeType={mockNodeType}
        nodeName={mockNodeName}
      />
    );
    
    expect(container.firstChild).toBeNull();
  });

  it("shows performance indicator when metrics exist", () => {
    mockUsePerformanceProfilerStore.mockReturnValue({
      profiles: {
        [mockWorkflowId]: {
          workflowId: mockWorkflowId,
          workflowName: "Test",
          totalDuration: 15000,
          nodeMetrics: {
            [mockNodeId]: mockMetrics
          },
          bottlenecks: [],
          parallelChains: [],
          startTime: Date.now()
        }
      },
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

    render(
      <PerformanceOverlay
        workflowId={mockWorkflowId}
        nodeId={mockNodeId}
        nodeType={mockNodeType}
        nodeName={mockNodeName}
      />
    );
    
    expect(screen.getByText("8s")).toBeInTheDocument();
  });

  it("shows recording indicator when profiling", () => {
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

    render(
      <PerformanceOverlay
        workflowId={mockWorkflowId}
        nodeId={mockNodeId}
        nodeType={mockNodeType}
        nodeName={mockNodeName}
      />
    );
    
    expect(screen.getByText("Recording...")).toBeInTheDocument();
  });

  it("shows tooltip with detailed metrics", async () => {
    mockUsePerformanceProfilerStore.mockReturnValue({
      profiles: {
        [mockWorkflowId]: {
          workflowId: mockWorkflowId,
          workflowName: "Test",
          totalDuration: 15000,
          nodeMetrics: {
            [mockNodeId]: mockMetrics
          },
          bottlenecks: [],
          parallelChains: [],
          startTime: Date.now()
        }
      },
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

    render(
      <PerformanceOverlay
        workflowId={mockWorkflowId}
        nodeId={mockNodeId}
        nodeType={mockNodeType}
        nodeName={mockNodeName}
      />
    );
    
    fireEvent.mouseEnter(screen.getByText("8s"));
    
    await waitFor(() => {
      expect(screen.getByText("Duration: 8s")).toBeInTheDocument();
      expect(screen.getByText("Calls: 1")).toBeInTheDocument();
      expect(screen.getByText("Average: 8s")).toBeInTheDocument();
    });
  });
});
