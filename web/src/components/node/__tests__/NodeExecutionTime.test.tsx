import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import NodeExecutionTime from "../NodeExecutionTime";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

describe("NodeExecutionTime", () => {
  const defaultProps = {
    nodeId: "test-node",
    workflowId: "test-workflow",
    status: "completed" as const
  };

  const renderWithTheme = (component: React.ReactElement) => {
    return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("formatDuration helper", () => {
    it("should format milliseconds correctly", () => {
      const formatDuration = (ms: number): string => {
        if (ms < 1000) {
          return `${ms}ms`;
        }
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) {
          const remainderMs = ms % 1000;
          if (remainderMs === 0) {
            return `${seconds}s`;
          }
          return `${seconds}s ${remainderMs}ms`;
        }
        const minutes = Math.floor(seconds / 60);
        const remainderSeconds = seconds % 60;
        if (remainderSeconds === 0) {
          return `${minutes}m`;
        }
        return `${minutes}m ${remainderSeconds}s`;
      };

      expect(formatDuration(500)).toBe("500ms");
      expect(formatDuration(1500)).toBe("1s 500ms");
      expect(formatDuration(3000)).toBe("3s");
      expect(formatDuration(125000)).toBe("2m 5s");
      expect(formatDuration(120000)).toBe("2m");
    });
  });

  it("should not render when status is running", () => {
    renderWithTheme(
      <NodeExecutionTime
        {...defaultProps}
        status="running"
      />
    );

    const span = screen.queryByText("Completed in");
    expect(span).not.toBeInTheDocument();
  });

  it("should not render when status is starting", () => {
    renderWithTheme(
      <NodeExecutionTime
        {...defaultProps}
        status="starting"
      />
    );

    const span = screen.queryByText("Completed in");
    expect(span).not.toBeInTheDocument();
  });

  it("should not render when status is booting", () => {
    renderWithTheme(
      <NodeExecutionTime
        {...defaultProps}
        status="booting"
      />
    );

    const span = screen.queryByText("Completed in");
    expect(span).not.toBeInTheDocument();
  });
});
