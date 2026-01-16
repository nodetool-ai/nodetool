import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import PerformanceProfiler from "../PerformanceProfiler";

const mockProfile = {
  workflowId: "test-workflow",
  workflowName: "Test Workflow",
  totalDuration: 5000,
  nodeData: {
    "node-1": {
      nodeId: "node-1",
      nodeType: "llm",
      nodeLabel: "LLM Node",
      durations: [1000, 1200, 800],
      avgDuration: 1000,
      minDuration: 800,
      maxDuration: 1200,
      lastDuration: 1000,
      executionCount: 3
    },
    "node-2": {
      nodeId: "node-2",
      nodeType: "text",
      nodeLabel: "Text Node",
      durations: [500, 600, 400],
      avgDuration: 500,
      minDuration: 400,
      maxDuration: 600,
      lastDuration: 500,
      executionCount: 3
    }
  },
  bottlenecks: ["node-1"],
  timestamp: Date.now(),
  runCount: 3
};

jest.mock("../../../stores/PerformanceProfilerStore", () => ({
  default: () => ({
    getProfile: jest.fn(),
    getBottlenecks: jest.fn(),
    compareWithPrevious: jest.fn()
  })
}));

jest.mock("../../../stores/ExecutionTimeStore", () => ({
  default: () => ({
    timings: {}
  })
}));

describe("PerformanceProfiler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows loading state when isRunning is true", () => {
    const mockGetProfile = jest.fn().mockReturnValue(null);
    const mockGetBottlenecks = jest.fn().mockReturnValue([]);
    const mockCompareWithPrevious = jest.fn().mockReturnValue(null);

    jest.doMock("../../../stores/PerformanceProfilerStore", () => ({
      default: () => ({
        getProfile: mockGetProfile,
        getBottlenecks: mockGetBottlenecks,
        compareWithPrevious: mockCompareWithPrevious
      })
    }));

    render(
      <PerformanceProfiler
        workflowId="test-workflow"
        isRunning={true}
      />
    );

    expect(screen.getByText(/profiling workflow execution/i)).toBeInTheDocument();
  });

  it("shows empty state when no profile exists", () => {
    render(
      <PerformanceProfiler
        workflowId="test-workflow"
        isRunning={false}
      />
    );

    expect(screen.getByText(/no profiling data available/i)).toBeInTheDocument();
  });
});
