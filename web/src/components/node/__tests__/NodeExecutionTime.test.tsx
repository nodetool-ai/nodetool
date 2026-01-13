import { render, screen } from "@testing-library/react";
import NodeExecutionTime from "../NodeExecutionTime";
import useNodeTimingStore from "../../../stores/NodeTimingStore";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const theme = createTheme();

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe("NodeExecutionTime", () => {
  beforeEach(() => {
    useNodeTimingStore.getState().clearAllTimings();
  });

  it("should not render when no timing data exists", () => {
    const { container } = renderWithTheme(
      <NodeExecutionTime workflowId="workflow-1" nodeId="node-1" />
    );
    expect(container.textContent).toBe("");
  });

  it("should not render when node has started but not finished", () => {
    useNodeTimingStore.getState().startNode("workflow-1", "node-1");

    const { container } = renderWithTheme(
      <NodeExecutionTime workflowId="workflow-1" nodeId="node-1" />
    );
    expect(container.textContent).toBe("");
  });

  it("should render duration when node has completed", () => {
    useNodeTimingStore.setState({
      timings: {
        "workflow-1:node-1": {
          startTime: 1000,
          endTime: 1100,
          duration: 100
        }
      }
    });

    renderWithTheme(
      <NodeExecutionTime workflowId="workflow-1" nodeId="node-1" />
    );

    expect(screen.getByText("100ms")).toBeInTheDocument();
  });

  it("should format milliseconds correctly", () => {
    useNodeTimingStore.setState({
      timings: {
        "workflow-1:node-1": {
          startTime: 1000,
          endTime: 1500,
          duration: 500
        }
      }
    });

    renderWithTheme(
      <NodeExecutionTime workflowId="workflow-1" nodeId="node-1" />
    );

    expect(screen.getByText("500ms")).toBeInTheDocument();
  });

  it("should format seconds correctly", () => {
    useNodeTimingStore.setState({
      timings: {
        "workflow-1:node-1": {
          startTime: 1000,
          endTime: 3500,
          duration: 2500
        }
      }
    });

    renderWithTheme(
      <NodeExecutionTime workflowId="workflow-1" nodeId="node-1" />
    );

    expect(screen.getByText("2.50s")).toBeInTheDocument();
  });

  it("should format minutes correctly", () => {
    useNodeTimingStore.setState({
      timings: {
        "workflow-1:node-1": {
          startTime: 1000,
          endTime: 91000,
          duration: 90000
        }
      }
    });

    renderWithTheme(
      <NodeExecutionTime workflowId="workflow-1" nodeId="node-1" />
    );

    expect(screen.getByText("1m 30.0s")).toBeInTheDocument();
  });
});
