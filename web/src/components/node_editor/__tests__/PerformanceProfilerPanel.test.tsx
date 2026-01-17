import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { PerformanceProfilerPanel } from "../PerformanceProfilerPanel";
import { usePerformanceProfile } from "../../../hooks/usePerformanceProfile";

jest.mock("../../hooks/usePerformanceProfile", () => ({
  usePerformanceProfile: jest.fn()
}));

const mockUsePerformanceProfile = usePerformanceProfile as jest.Mock;

describe("PerformanceProfilerPanel", () => {
  const mockAnalyzePerformance = jest.fn();
  const mockClearMetrics = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePerformanceProfile.mockReturnValue({
      metrics: null,
      isAnalyzing: false,
      analyzePerformance: mockAnalyzePerformance,
      clearMetrics: mockClearMetrics
    });
  });

  it("renders the initial state when no metrics are available", () => {
    render(
      <PerformanceProfilerPanel
        workflowId="test-workflow"
        nodes={[]}
      />
    );

    expect(screen.getByText("Run a workflow execution first")).toBeInTheDocument();
    expect(screen.getByText("Analyze Performance")).toBeInTheDocument();
  });

  it("calls analyzePerformance when the button is clicked", () => {
    render(
      <PerformanceProfilerPanel
        workflowId="test-workflow-123"
        nodes={[{ id: "1", type: "test", data: {}, position: { x: 0, y: 0 } }]}
      />
    );

    fireEvent.click(screen.getByText("Analyze Performance"));

    expect(mockAnalyzePerformance).toHaveBeenCalledWith(
      "test-workflow-123",
      expect.any(Array)
    );
  });

  it("displays metrics when available", () => {
    mockUsePerformanceProfile.mockReturnValue({
      metrics: {
        totalDuration: 5000,
        nodeCount: 5,
        bottlenecks: [
          {
            nodeId: "slow-node",
            nodeType: "slow-type",
            duration: 4000,
            percentage: 80,
            label: "Slow Node"
          }
        ],
        parallelizableChains: [["1", "2"]],
        estimatedSpeedup: 1.5
      },
      isAnalyzing: false,
      analyzePerformance: mockAnalyzePerformance,
      clearMetrics: mockClearMetrics
    });

    render(
      <PerformanceProfilerPanel
        workflowId="test-workflow"
        nodes={[{ id: "slow-node", type: "slow-type", data: { label: "Slow Node" }, position: { x: 0, y: 0 } }]}
      />
    );

    expect(screen.getByText("Performance Profile")).toBeInTheDocument();
    expect(screen.getByText("Total Duration")).toBeInTheDocument();
    expect(screen.getByText("Potential Speedup")).toBeInTheDocument();
  });

  it("displays loading state when analyzing", () => {
    mockUsePerformanceProfile.mockReturnValue({
      metrics: null,
      isAnalyzing: true,
      analyzePerformance: mockAnalyzePerformance,
      clearMetrics: mockClearMetrics
    });

    render(
      <PerformanceProfilerPanel
        workflowId="test-workflow"
        nodes={[]}
      />
    );

    expect(screen.getByText("Analyzing workflow performance...")).toBeInTheDocument();
  });

  it("calls clearMetrics when clear button is clicked", () => {
    mockUsePerformanceProfile.mockReturnValue({
      metrics: {
        totalDuration: 1000,
        nodeCount: 2,
        bottlenecks: [],
        parallelizableChains: [],
        estimatedSpeedup: 1
      },
      isAnalyzing: false,
      analyzePerformance: mockAnalyzePerformance,
      clearMetrics: mockClearMetrics
    });

    render(
      <PerformanceProfilerPanel
        workflowId="test-workflow"
        nodes={[]}
      />
    );

    fireEvent.click(screen.getByText("Clear"));

    expect(mockClearMetrics).toHaveBeenCalled();
  });
});
