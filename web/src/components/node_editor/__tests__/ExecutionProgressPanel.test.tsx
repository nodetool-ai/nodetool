import { render, screen } from "@testing-library/react";
import ExecutionProgressPanel from "../ExecutionProgressPanel";
import * as useWorkflowExecutionProgressModule from "../../../hooks/useWorkflowExecutionProgress";

jest.mock("../../../hooks/useWorkflowExecutionProgress", () => ({
  useWorkflowExecutionProgress: jest.fn(),
  formatElapsedTime: jest.fn((ms: number) => {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  })
}));

jest.mock("@mui/material/styles", () => ({
  ...jest.requireActual("@mui/material/styles"),
  useTheme: () => ({
    palette: {
      mode: "dark",
      info: { main: "#2196f3" },
      success: { main: "#4caf50" },
      error: { main: "#f44336" },
      warning: { main: "#ff9800" }
    },
    vars: {
      palette: {
        Paper: { paper: "#1e1e1e" },
        divider: "#333",
        text: { secondary: "#888", primary: "#fff" },
        action: { hover: "#333" }
      }
    },
    shadows: Array(25).fill("none")
  })
}));

const mockUseWorkflowExecutionProgress =
  useWorkflowExecutionProgressModule.useWorkflowExecutionProgress as jest.Mock;

describe("ExecutionProgressPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not render when not executing and no completed nodes", () => {
    mockUseWorkflowExecutionProgress.mockReturnValue({
      total: 5,
      completed: 0,
      running: 0,
      pending: 5,
      error: 0,
      progressPercent: 0,
      elapsedMs: 0
    });

    const { container } = render(
      <ExecutionProgressPanel workflowId="test" isExecuting={false} />
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders when executing", () => {
    mockUseWorkflowExecutionProgress.mockReturnValue({
      total: 5,
      completed: 2,
      running: 1,
      pending: 2,
      error: 0,
      progressPercent: 40,
      elapsedMs: 5000
    });

    render(
      <ExecutionProgressPanel workflowId="test" isExecuting={true} />
    );

    expect(screen.getByText("40% (2/5)")).toBeInTheDocument();
    expect(screen.getByText("5s")).toBeInTheDocument();
  });

  it("displays correct status counts", () => {
    mockUseWorkflowExecutionProgress.mockReturnValue({
      total: 10,
      completed: 3,
      running: 2,
      pending: 4,
      error: 1,
      progressPercent: 40,
      elapsedMs: 0
    });

    render(
      <ExecutionProgressPanel workflowId="test" isExecuting={true} />
    );

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("renders after execution completes with results", () => {
    mockUseWorkflowExecutionProgress.mockReturnValue({
      total: 5,
      completed: 5,
      running: 0,
      pending: 0,
      error: 0,
      progressPercent: 100,
      elapsedMs: 0
    });

    render(
      <ExecutionProgressPanel workflowId="test" isExecuting={false} />
    );

    expect(screen.getByText("100% (5/5)")).toBeInTheDocument();
  });
});
