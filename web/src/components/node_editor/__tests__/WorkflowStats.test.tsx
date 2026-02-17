import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WorkflowStats from "../WorkflowStats";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import useWorkflowStatsStore from "../../../stores/WorkflowStatsStore";

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: jest.fn()
}));

import { useNodes } from "../../../contexts/NodeContext";

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("WorkflowStats", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWorkflowStatsStore.getState().clearAllStats();

    (useNodes as jest.Mock).mockImplementation((sel: any) =>
      sel({
        nodes: [
          { id: "1", position: { x: 0, y: 0 } },
          { id: "2", position: { x: 100, y: 0 } },
          { id: "3", position: { x: 200, y: 0 } }
        ],
        edges: [
          { id: "e1", source: "1", target: "2" },
          { id: "e2", source: "2", target: "3" }
        ]
      })
    );
  });

  it("renders workflow stats button", () => {
    renderWithTheme(<WorkflowStats workflowId="workflow-1" />);
    expect(screen.getByTestId("workflow-stats")).toBeInTheDocument();
  });

  it("displays node and edge count in collapsed view", () => {
    renderWithTheme(<WorkflowStats workflowId="workflow-1" />);
    expect(screen.getByText("3 nodes • 2 edges")).toBeInTheDocument();
  });

  it("opens popover when button is clicked", async () => {
    const user = userEvent.setup();
    renderWithTheme(<WorkflowStats workflowId="workflow-1" />);
    
    const button = screen.getByRole("button");
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText("Workflow Statistics")).toBeInTheDocument();
    });
  });

  it("displays basic stats in popover", async () => {
    const user = userEvent.setup();
    renderWithTheme(<WorkflowStats workflowId="workflow-1" />);

    const button = screen.getByRole("button");
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText("Nodes")).toBeInTheDocument();
      expect(screen.getByText("Edges")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument(); // Node count
      expect(screen.getByText("2")).toBeInTheDocument(); // Edges count
      expect(screen.getByText("Runs")).toBeInTheDocument();
      expect(screen.getByText("0")).toBeInTheDocument(); // Run count when no executions
    });
  });

  it("shows execution stats after workflow runs", async () => {
    const user = userEvent.setup();

    // Record some executions
    useWorkflowStatsStore.getState().recordExecution("workflow-1", 5000);
    useWorkflowStatsStore.getState().recordExecution("workflow-1", 3000);

    renderWithTheme(<WorkflowStats workflowId="workflow-1" />);

    const button = screen.getByRole("button");
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText("Runs")).toBeInTheDocument();
      expect(screen.getAllByText("2")).toHaveLength(2); // Edges (2) + Runs (2)
      expect(screen.getByText("Avg Duration")).toBeInTheDocument();
      expect(screen.getByText("4.0s")).toBeInTheDocument(); // Average
      expect(screen.getByText("Last Run")).toBeInTheDocument();
    });
  });

  it("displays message when no execution data", async () => {
    const user = userEvent.setup();
    renderWithTheme(<WorkflowStats workflowId="workflow-1" />);
    
    const button = screen.getByRole("button");
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText(/No execution data yet/)).toBeInTheDocument();
    });
  });

  it("resets stats when reset button is clicked", async () => {
    const user = userEvent.setup();
    
    useWorkflowStatsStore.getState().recordExecution("workflow-1", 5000);

    renderWithTheme(<WorkflowStats workflowId="workflow-1" />);
    
    const button = screen.getByRole("button");
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText("Runs")).toBeInTheDocument();
    });

    const resetButton = screen.getAllByRole("button").find(
      btn => btn.querySelector('svg[data-testid="RestartAltIcon"]')
    );
    
    if (resetButton) {
      await user.click(resetButton);

      await waitFor(() => {
        expect(screen.getByText(/No execution data yet/)).toBeInTheDocument();
      });
    }
  });

  it("closes popover when close button is clicked", async () => {
    const user = userEvent.setup();
    renderWithTheme(<WorkflowStats workflowId="workflow-1" />);
    
    const button = screen.getByRole("button");
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText("Workflow Statistics")).toBeInTheDocument();
    });

    const closeButton = screen.getAllByRole("button").find(
      btn => btn.querySelector('svg[data-testid="CloseIcon"]')
    );
    
    if (closeButton) {
      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByText("Workflow Statistics")).not.toBeInTheDocument();
      });
    }
  });

  it("formats duration correctly for milliseconds", async () => {
    const user = userEvent.setup();
    
    useWorkflowStatsStore.getState().recordExecution("workflow-1", 500);

    renderWithTheme(<WorkflowStats workflowId="workflow-1" />);
    
    const button = screen.getByRole("button");
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText("500ms")).toBeInTheDocument();
    });
  });

  it("formats duration correctly for seconds", async () => {
    const user = userEvent.setup();
    
    useWorkflowStatsStore.getState().recordExecution("workflow-1", 5000);
    useWorkflowStatsStore.getState().recordExecution("workflow-1", 2500);

    renderWithTheme(<WorkflowStats workflowId="workflow-1" />);
    
    const button = screen.getByRole("button");
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText("3.8s")).toBeInTheDocument();
    });
  });

  it("formats duration correctly for minutes", async () => {
    const user = userEvent.setup();
    
    useWorkflowStatsStore.getState().recordExecution("workflow-1", 125000); // 2m 5s

    renderWithTheme(<WorkflowStats workflowId="workflow-1" />);
    
    const button = screen.getByRole("button");
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText("2m 5s")).toBeInTheDocument();
    });
  });

  it("hides when visible prop is false", () => {
    const { container } = renderWithTheme(<WorkflowStats workflowId="workflow-1" visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("updates node count when nodes change", () => {
    (useNodes as jest.Mock).mockImplementation((sel: any) =>
      sel({
        nodes: [
          { id: "1", position: { x: 0, y: 0 } },
          { id: "2", position: { x: 100, y: 0 } },
          { id: "3", position: { x: 200, y: 0 } },
          { id: "4", position: { x: 300, y: 0 } }
        ],
        edges: [
          { id: "e1", source: "1", target: "2" },
          { id: "e2", source: "2", target: "3" }
        ]
      })
    );

    renderWithTheme(<WorkflowStats workflowId="workflow-1" />);
    expect(screen.getByText("4 nodes • 2 edges")).toBeInTheDocument();
  });

  it("shows relative time for last execution", async () => {
    const user = userEvent.setup();
    
    const now = Date.now();
    jest.spyOn(Date, "now").mockImplementation(() => now);
    useWorkflowStatsStore.getState().recordExecution("workflow-1", 5000);

    jest.spyOn(Date, "now").mockImplementation(() => now + 120000); // 2 minutes later
    renderWithTheme(<WorkflowStats workflowId="workflow-1" />);
    
    const button = screen.getByRole("button");
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText("2m ago")).toBeInTheDocument();
    });

    jest.restoreAllMocks();
  });
});
