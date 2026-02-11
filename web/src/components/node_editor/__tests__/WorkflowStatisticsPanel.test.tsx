import React from "react";
import { render, screen } from "@testing-library/react";
import WorkflowStatisticsPanel from "../WorkflowStatisticsPanel";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("@xyflow/react", () => {
  const actual = jest.requireActual("@xyflow/react");
  return {
    ...actual,
    useReactFlow: jest.fn()
  };
});

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: jest.fn()
}));

jest.mock("../../../stores/WorkflowStatisticsStore", () => ({
  useWorkflowStatisticsStore: jest.fn()
}));

jest.mock("../../../hooks/useWorkflowStatistics", () => ({
  useWorkflowStatistics: jest.fn()
}));

import { useWorkflowStatisticsStore } from "../../../stores/WorkflowStatisticsStore";
import { useWorkflowStatistics } from "../../../hooks/useWorkflowStatistics";

// Create a proper mock for the store
const createMockStore = (isOpen: boolean) => ({
  isOpen,
  toggle: jest.fn(),
  close: jest.fn(),
  open: jest.fn()
});

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("WorkflowStatisticsPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (useWorkflowStatisticsStore as jest.MockedFunction<typeof useWorkflowStatisticsStore>).mockImplementation(
      (selector) => {
        const state = createMockStore(true);
        return selector ? selector(state) : state;
      }
    );

    (useWorkflowStatistics as jest.MockedFunction<typeof useWorkflowStatistics>).mockReturnValue({
      stats: {
        totalNodes: 3,
        totalEdges: 2,
        selectedNodes: 1,
        nodeTypeStats: [
          { type: "in:StringInput", count: 1, category: "input" },
          { type: "img:CreateImage", count: 1, category: "processing" },
          { type: "out:TextOutput", count: 1, category: "output" }
        ],
        hasLoops: false,
        hasBypassedNodes: false,
        estimatedComplexity: "simple"
      },
      refresh: jest.fn()
    });
  });

  it("does not render when isOpen is false", () => {
    (useWorkflowStatisticsStore as jest.MockedFunction<typeof useWorkflowStatisticsStore>).mockImplementation(
      (selector) => {
        const state = createMockStore(false);
        return selector ? selector(state) : state;
      }
    );

    const { container } = renderWithTheme(<WorkflowStatisticsPanel workflowId="test-workflow" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders when isOpen is true", () => {
    renderWithTheme(<WorkflowStatisticsPanel workflowId="test-workflow" />);
    expect(screen.getByText("Workflow Statistics")).toBeInTheDocument();
  });

  it("shows empty state when no nodes exist", () => {
    (useWorkflowStatistics as jest.MockedFunction<typeof useWorkflowStatistics>).mockReturnValue({
      stats: {
        totalNodes: 0,
        totalEdges: 0,
        selectedNodes: 0,
        nodeTypeStats: [],
        hasLoops: false,
        hasBypassedNodes: false,
        estimatedComplexity: "simple"
      },
      refresh: jest.fn()
    });

    renderWithTheme(<WorkflowStatisticsPanel workflowId="test-workflow" />);
    expect(screen.getByText("No nodes in workflow")).toBeInTheDocument();
  });
});
