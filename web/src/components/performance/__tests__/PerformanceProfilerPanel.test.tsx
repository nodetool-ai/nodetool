import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import PerformanceProfilerPanel from "../PerformanceProfilerPanel";

const theme = createTheme();

const renderWithProviders = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

const mockPerformanceProfilerStore = {
  currentProfile: null,
  historicalProfiles: [],
  isAnalyzing: false,
  lastAnalysisTime: null,
  setProfile: jest.fn(),
  addHistoricalProfile: jest.fn(),
  clearProfiles: jest.fn(),
  setAnalyzing: jest.fn(),
  getBottleneckCount: jest.fn().mockReturnValue(0),
  getTotalPotentialSavings: jest.fn().mockReturnValue(0)
};

const mockExecutionTimeStore = {
  timings: {},
  startExecution: jest.fn(),
  endExecution: jest.fn(),
  getTiming: jest.fn().mockReturnValue(undefined),
  getDuration: jest.fn().mockReturnValue(undefined),
  clearTimings: jest.fn()
};

const mockStatusStore = {
  statuses: {},
  setStatus: jest.fn(),
  getStatus: jest.fn().mockReturnValue(undefined),
  clearStatuses: jest.fn()
};

const mockResultsStore = {
  results: {},
  outputResults: {},
  progress: {},
  edges: {},
  chunks: {},
  tasks: {},
  toolCalls: {},
  planningUpdates: {},
  previews: {},
  deleteResult: jest.fn(),
  clearResults: jest.fn(),
  clearOutputResults: jest.fn(),
  clearProgress: jest.fn(),
  clearToolCalls: jest.fn(),
  clearTasks: jest.fn(),
  clearChunks: jest.fn(),
  clearPlanningUpdates: jest.fn(),
  clearPreviews: jest.fn(),
  clearEdges: jest.fn(),
  setEdge: jest.fn(),
  getEdge: jest.fn().mockReturnValue(undefined),
  setPreview: jest.fn(),
  getPreview: jest.fn().mockReturnValue(undefined),
  setResult: jest.fn(),
  getResult: jest.fn().mockReturnValue(undefined),
  getOutputResult: jest.fn().mockReturnValue(undefined),
  setOutputResult: jest.fn(),
  setTask: jest.fn(),
  getTask: jest.fn().mockReturnValue(undefined),
  addChunk: jest.fn(),
  getChunk: jest.fn().mockReturnValue(undefined),
  setToolCall: jest.fn(),
  getToolCall: jest.fn().mockReturnValue(undefined),
  setProgress: jest.fn(),
  getProgress: jest.fn().mockReturnValue(undefined),
  setPlanningUpdate: jest.fn(),
  getPlanningUpdate: jest.fn().mockReturnValue(undefined)
};

jest.mock("../../../stores/PerformanceProfilerStore", () => ({
  __esModule: true,
  default: () => mockPerformanceProfilerStore
}));

jest.mock("../../../stores/ExecutionTimeStore", () => ({
  __esModule: true,
  default: () => mockExecutionTimeStore
}));

jest.mock("../../../stores/StatusStore", () => ({
  __esModule: true,
  default: () => mockStatusStore
}));

jest.mock("../../../stores/ResultsStore", () => ({
  __esModule: true,
  default: () => mockResultsStore
}));

describe("PerformanceProfilerPanel", () => {
  const mockNodes = [
    { id: "node-1", type: "nodetool.llm.LLM", data: { name: "LLM Node" } },
    { id: "node-2", type: "nodetool.image.ImageGeneration", data: { name: "Image Node" } },
    { id: "node-3", type: "nodetool.text.TextProcessing", data: { name: "Text Node" } }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockPerformanceProfilerStore, {
      currentProfile: null,
      historicalProfiles: [],
      isAnalyzing: false,
      lastAnalysisTime: null,
      setProfile: jest.fn(),
      addHistoricalProfile: jest.fn(),
      clearProfiles: jest.fn(),
      setAnalyzing: jest.fn(),
      getBottleneckCount: jest.fn().mockReturnValue(0),
      getTotalPotentialSavings: jest.fn().mockReturnValue(0)
    });
  });

  it("should render without crashing", () => {
    renderWithProviders(
      <PerformanceProfilerPanel
        workflowId="test-workflow"
        workflowName="Test Workflow"
        nodes={mockNodes}
      />
    );

    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(screen.getByText("Analyze")).toBeInTheDocument();
  });

  it("should show empty state when no execution data", () => {
    renderWithProviders(
      <PerformanceProfilerPanel
        workflowId="test-workflow"
        workflowName="Test Workflow"
        nodes={mockNodes}
      />
    );

    expect(screen.getByText("No execution data yet")).toBeInTheDocument();
    expect(screen.getByText("Run your workflow to collect performance data")).toBeInTheDocument();
  });

  it("should show performance stats when profile exists", () => {
    Object.assign(mockPerformanceProfilerStore, {
      currentProfile: {
        workflowId: "test-workflow",
        totalDuration: 5000,
        nodeCount: 3,
        completedNodes: 3,
        failedNodes: 0,
        nodes: [
          {
            nodeId: "node-1",
            nodeType: "nodetool.llm.LLM",
            nodeName: "LLM Node",
            duration: 3000,
            status: "completed" as const,
            isParallelizable: true
          }
        ],
        bottlenecks: [],
        parallelismScore: 85,
        timestamp: Date.now()
      },
      historicalProfiles: [],
      isAnalyzing: false,
      lastAnalysisTime: Date.now(),
      setProfile: jest.fn(),
      addHistoricalProfile: jest.fn(),
      clearProfiles: jest.fn(),
      setAnalyzing: jest.fn(),
      getBottleneckCount: jest.fn().mockReturnValue(0),
      getTotalPotentialSavings: jest.fn().mockReturnValue(0)
    });

    renderWithProviders(
      <PerformanceProfilerPanel
        workflowId="test-workflow"
        workflowName="Test Workflow"
        nodes={mockNodes}
      />
    );

    expect(screen.getByText("Performance")).toBeInTheDocument();
  });

  it("should show bottlenecks when they exist", () => {
    Object.assign(mockPerformanceProfilerStore, {
      currentProfile: {
        workflowId: "test-workflow",
        totalDuration: 10000,
        nodeCount: 3,
        completedNodes: 3,
        failedNodes: 0,
        nodes: [
          {
            nodeId: "node-1",
            nodeType: "nodetool.llm.LLM",
            nodeName: "LLM Node",
            duration: 8000,
            status: "completed" as const,
            isParallelizable: true
          }
        ],
        bottlenecks: [
          {
            nodeId: "node-1",
            nodeType: "nodetool.llm.LLM",
            nodeName: "LLM Node",
            duration: 8000,
            status: "completed" as const,
            isParallelizable: false
          }
        ],
        parallelismScore: 50,
        timestamp: Date.now()
      },
      historicalProfiles: [],
      isAnalyzing: false,
      lastAnalysisTime: Date.now(),
      setProfile: jest.fn(),
      addHistoricalProfile: jest.fn(),
      clearProfiles: jest.fn(),
      setAnalyzing: jest.fn(),
      getBottleneckCount: jest.fn().mockReturnValue(1),
      getTotalPotentialSavings: jest.fn().mockReturnValue(5000)
    });

    renderWithProviders(
      <PerformanceProfilerPanel
        workflowId="test-workflow"
        workflowName="Test Workflow"
        nodes={mockNodes}
      />
    );

    expect(screen.getByText(/Bottlenecks/)).toBeInTheDocument();
    expect(screen.getByText("Sequential")).toBeInTheDocument();
  });
});
