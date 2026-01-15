import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WorkflowStatsPanel from "../WorkflowStatsPanel";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import useWorkflowStatsStore from "../../../stores/WorkflowStatsStore";

jest.mock("../../../stores/WorkflowStatsStore", () => {
  const actual = jest.requireActual("../../../stores/WorkflowStatsStore");
  return {
    ...actual,
    __esModule: true,
    default: jest.fn()
  };
});

const mockGetStats = jest.fn();

const mockUseWorkflowStatsStore = useWorkflowStatsStore as unknown as jest.Mock;

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("WorkflowStatsPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStats.mockReturnValue({
      nodeCount: 5,
      edgeCount: 4,
      nodeCountByType: {},
      nodeCountByCategory: {
        Input: 1,
        Output: 1,
        Processing: 2,
        Group: 1
      },
      inputNodeCount: 1,
      outputNodeCount: 1,
      processingNodeCount: 2,
      groupNodeCount: 1,
      selectedNodeCount: 0,
      selectedEdgeCount: 0,
      complexityScore: 12
    });

    mockUseWorkflowStatsStore.mockImplementation((selector) => {
      const state = {
        getStats: mockGetStats
      };
      return selector(state);
    });
  });

  it("displays node count", () => {
    renderWithTheme(<WorkflowStatsPanel workflowId="workflow1" />);
    expect(screen.getByText("5 nodes")).toBeInTheDocument();
  });

  it("opens stats menu when clicked", async () => {
    renderWithTheme(<WorkflowStatsPanel workflowId="workflow1" />);
    const statsButton = screen.getByRole("button");
    await userEvent.click(statsButton);

    await waitFor(() => {
      expect(screen.getByText("Workflow Statistics")).toBeInTheDocument();
    });
  });

  it("shows category counts in menu", async () => {
    renderWithTheme(<WorkflowStatsPanel workflowId="workflow1" />);
    const statsButton = screen.getByRole("button");
    await userEvent.click(statsButton);

    await waitFor(() => {
      expect(screen.getByText("Inputs")).toBeInTheDocument();
      expect(screen.getByText("Outputs")).toBeInTheDocument();
      expect(screen.getByText("Processing")).toBeInTheDocument();
      expect(screen.getByText("Groups")).toBeInTheDocument();
    });
  });

  it("shows complexity with label", async () => {
    renderWithTheme(<WorkflowStatsPanel workflowId="workflow1" />);
    const statsButton = screen.getByRole("button");
    await userEvent.click(statsButton);

    await waitFor(() => {
      expect(screen.getByText("Complexity")).toBeInTheDocument();
      expect(screen.getByText(/12.*Moderate/)).toBeInTheDocument();
    });
  });

  it("shows selection section when nodes are selected", async () => {
    mockGetStats.mockReturnValue({
      nodeCount: 5,
      edgeCount: 4,
      nodeCountByType: {},
      nodeCountByCategory: {
        Input: 1,
        Output: 1,
        Processing: 2,
        Group: 1
      },
      inputNodeCount: 1,
      outputNodeCount: 1,
      processingNodeCount: 2,
      groupNodeCount: 1,
      selectedNodeCount: 2,
      selectedEdgeCount: 1,
      complexityScore: 12
    });

    renderWithTheme(<WorkflowStatsPanel workflowId="workflow1" />);
    const statsButton = screen.getByRole("button");
    await userEvent.click(statsButton);

    await waitFor(() => {
      expect(screen.getByText("Selection")).toBeInTheDocument();
    });
  });

  it("hides when visible prop is false", () => {
    const { container } = renderWithTheme(
      <WorkflowStatsPanel workflowId="workflow1" visible={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("displays zero for empty workflow", () => {
    mockGetStats.mockReturnValue({
      nodeCount: 0,
      edgeCount: 0,
      nodeCountByType: {},
      nodeCountByCategory: {
        Input: 0,
        Output: 0,
        Processing: 0,
        Group: 0
      },
      inputNodeCount: 0,
      outputNodeCount: 0,
      processingNodeCount: 0,
      groupNodeCount: 0,
      selectedNodeCount: 0,
      selectedEdgeCount: 0,
      complexityScore: 0
    });

    renderWithTheme(<WorkflowStatsPanel workflowId="workflow1" />);
    expect(screen.getByText("0 nodes")).toBeInTheDocument();
  });

  it("shows simple complexity for low scores", async () => {
    mockGetStats.mockReturnValue({
      nodeCount: 3,
      edgeCount: 2,
      nodeCountByType: {},
      nodeCountByCategory: {
        Input: 1,
        Output: 1,
        Processing: 1,
        Group: 0
      },
      inputNodeCount: 1,
      outputNodeCount: 1,
      processingNodeCount: 1,
      groupNodeCount: 0,
      selectedNodeCount: 0,
      selectedEdgeCount: 0,
      complexityScore: 5
    });

    renderWithTheme(<WorkflowStatsPanel workflowId="workflow1" />);
    const statsButton = screen.getByRole("button");
    await userEvent.click(statsButton);

    await waitFor(() => {
      expect(screen.getByText(/Simple/)).toBeInTheDocument();
    });
  });

  it("shows very complex for high scores", async () => {
    mockGetStats.mockReturnValue({
      nodeCount: 20,
      edgeCount: 15,
      nodeCountByType: {},
      nodeCountByCategory: {
        Input: 2,
        Output: 2,
        Processing: 14,
        Group: 2
      },
      inputNodeCount: 2,
      outputNodeCount: 2,
      processingNodeCount: 14,
      groupNodeCount: 2,
      selectedNodeCount: 0,
      selectedEdgeCount: 0,
      complexityScore: 75
    });

    renderWithTheme(<WorkflowStatsPanel workflowId="workflow1" />);
    const statsButton = screen.getByRole("button");
    await userEvent.click(statsButton);

    await waitFor(() => {
      expect(screen.getByText(/Very Complex/)).toBeInTheDocument();
    });
  });

  it("displays total counts", async () => {
    renderWithTheme(<WorkflowStatsPanel workflowId="workflow1" />);
    const statsButton = screen.getByRole("button");
    await userEvent.click(statsButton);

    await waitFor(() => {
      expect(screen.getByText("5")).toBeInTheDocument();
      expect(screen.getByText("4")).toBeInTheDocument();
    });
  });
});
