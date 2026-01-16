import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import PerformanceProfilerPanel from "../PerformanceProfilerPanel";

const theme = createTheme();

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe("PerformanceProfilerPanel", () => {
  const mockNodes = [
    { id: "node-1", data: { title: "LLM Node" }, type: "llm" },
    { id: "node-2", data: { title: "Output Node" }, type: "output" }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows empty state when no performance data exists", () => {
    renderWithTheme(
      <PerformanceProfilerPanel
        workflowId="workflow-1"
        workflowName="Test Workflow"
        nodes={mockNodes}
      />
    );

    expect(screen.getByText("No performance data yet")).toBeInTheDocument();
    expect(screen.getByText("Run the workflow to collect performance metrics")).toBeInTheDocument();
  });

  it("renders performance metrics when data exists", () => {
    jest.spyOn(require("../../../stores/PerformanceProfileStore"), "default")
      .mockImplementation(() => ({
        profiles: {
          "workflow-1": {
            workflowId: "workflow-1",
            workflowName: "Test Workflow",
            totalRuns: 5,
            totalDuration: 10000,
            averageTotalDuration: 9500,
            bottlenecks: [
              {
                nodeId: "node-1",
                nodeName: "LLM Node",
                nodeType: "llm",
                durations: [8000, 9000],
                averageDuration: 8500,
                minDuration: 8000,
                maxDuration: 9000,
                executionCount: 5
              }
            ],
            nodeData: {
              "node-1": {
                nodeId: "node-1",
                nodeName: "LLM Node",
                nodeType: "llm",
                durations: [8000, 9000],
                averageDuration: 8500,
                minDuration: 8000,
                maxDuration: 9000,
                executionCount: 5
              },
              "node-2": {
                nodeId: "node-2",
                nodeName: "Output Node",
                nodeType: "output",
                durations: [100, 200],
                averageDuration: 150,
                minDuration: 100,
                maxDuration: 200,
                executionCount: 5
              }
            },
            lastRunTimestamp: Date.now()
          }
        },
        clearProfile: jest.fn()
      }));

    jest.spyOn(require("../../../stores/ExecutionTimeStore"), "default")
      .mockImplementation(() => ({
        getDuration: jest.fn().mockReturnValue(500)
      }));

    renderWithTheme(
      <PerformanceProfilerPanel
        workflowId="workflow-1"
        workflowName="Test Workflow"
        nodes={mockNodes}
      />
    );

    expect(screen.getByText("Performance Profiler")).toBeInTheDocument();
    expect(screen.getByText("10s")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("calls clearProfile when refresh button is clicked", () => {
    const clearProfileMock = jest.fn();

    jest.spyOn(require("../../../stores/PerformanceProfileStore"), "default")
      .mockImplementation(() => ({
        profiles: {
          "workflow-1": {
            workflowId: "workflow-1",
            workflowName: "Test Workflow",
            totalRuns: 1,
            totalDuration: 5000,
            averageTotalDuration: 5000,
            bottlenecks: [],
            nodeData: {
              "node-1": {
                nodeId: "node-1",
                nodeName: "LLM Node",
                nodeType: "llm",
                durations: [5000],
                averageDuration: 5000,
                minDuration: 5000,
                maxDuration: 5000,
                executionCount: 1
              }
            },
            lastRunTimestamp: Date.now()
          }
        },
        clearProfile: clearProfileMock
      }));

    jest.spyOn(require("../../../stores/ExecutionTimeStore"), "default")
      .mockImplementation(() => ({
        getDuration: jest.fn().mockReturnValue(500)
      }));

    renderWithTheme(
      <PerformanceProfilerPanel
        workflowId="workflow-1"
        workflowName="Test Workflow"
        nodes={mockNodes}
      />
    );

    const refreshButton = screen.getByTitle("Clear performance data");
    userEvent.click(refreshButton);

    expect(clearProfileMock).toHaveBeenCalledWith("workflow-1");
  });

  it("displays bottleneck nodes with correct formatting", () => {
    jest.spyOn(require("../../../stores/PerformanceProfileStore"), "default")
      .mockImplementation(() => ({
        profiles: {
          "workflow-1": {
            workflowId: "workflow-1",
            workflowName: "Test Workflow",
            totalRuns: 3,
            totalDuration: 15000,
            averageTotalDuration: 14000,
            bottlenecks: [
              {
                nodeId: "node-1",
                nodeName: "Slow LLM Node",
                nodeType: "llm",
                durations: [10000, 12000],
                averageDuration: 11000,
                minDuration: 10000,
                maxDuration: 12000,
                executionCount: 3
              }
            ],
            nodeData: {
              "node-1": {
                nodeId: "node-1",
                nodeName: "Slow LLM Node",
                nodeType: "llm",
                durations: [10000, 12000],
                averageDuration: 11000,
                minDuration: 10000,
                maxDuration: 12000,
                executionCount: 3
              }
            },
            lastRunTimestamp: Date.now()
          }
        },
        clearProfile: jest.fn()
      }));

    jest.spyOn(require("../../../stores/ExecutionTimeStore"), "default")
      .mockImplementation(() => ({
        getDuration: jest.fn().mockReturnValue(500)
      }));

    renderWithTheme(
      <PerformanceProfilerPanel
        workflowId="workflow-1"
        workflowName="Test Workflow"
        nodes={mockNodes}
      />
    );

    expect(screen.getByText("Top Bottlenecks")).toBeInTheDocument();
    expect(screen.getByText("Slow LLM Node")).toBeInTheDocument();
    expect(screen.getByText("11s")).toBeInTheDocument();
  });
});
