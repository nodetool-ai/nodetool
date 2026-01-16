/** @jsxImportSource @emotion/react */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NodePerformanceBadge from "../NodePerformanceBadge";

jest.mock("../../../stores/ExecutionTimeStore", () => ({
  __esModule: true,
  default: jest.fn((selector) => {
    const mockTimings: Record<string, { startTime: number; endTime?: number }> = {
      "workflow-1:node-1": { startTime: 1000, endTime: 1500 },
      "workflow-1:node-2": { startTime: 1000, endTime: 6000 },
      "workflow-1:node-3": { startTime: 1000, endTime: 12000 },
      "workflow-1:node-error": { startTime: 1000, endTime: 2000 },
      "workflow-1:node-ms": { startTime: 0, endTime: 250 },
      "workflow-1:node-seconds": { startTime: 0, endTime: 3500 },
      "workflow-1:node-minutes": { startTime: 0, endTime: 125000 }
    };

    const mockSelector = (state: { timings: typeof mockTimings }) => {
      return (workflowId: string, nodeId: string): number | undefined => {
        const key = `${workflowId}:${nodeId}`;
        const timing = state.timings[key];
        if (!timing || !timing.endTime) {
          return undefined;
        }
        return timing.endTime - timing.startTime;
      };
    };

    const mockState = {
      timings: mockTimings,
      getDuration: mockSelector({ timings: mockTimings })
    };

    return selector(mockState);
  })
}));

describe("NodePerformanceBadge", () => {
  const defaultProps = {
    nodeId: "node-1",
    workflowId: "workflow-1",
    status: "completed"
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Rendering", () => {
    test("does not render for pending status", () => {
      render(
        <NodePerformanceBadge
          {...defaultProps}
          status="pending"
        />
      );
      expect(screen.queryByTestId("SpeedIcon")).not.toBeInTheDocument();
    });

    test("does not render for idle status", () => {
      render(
        <NodePerformanceBadge
          {...defaultProps}
          status="idle"
        />
      );
      expect(screen.queryByTestId("SpeedIcon")).not.toBeInTheDocument();
    });

    test("renders fast execution badge (under 1s)", () => {
      render(
        <NodePerformanceBadge
          {...defaultProps}
          nodeId="node-1"
        />
      );
      expect(screen.getByTestId("SpeedIcon")).toBeInTheDocument();
      expect(screen.getByText("500ms")).toBeInTheDocument();
    });

    test("renders medium execution badge (1-5s)", () => {
      render(
        <NodePerformanceBadge
          {...defaultProps}
          nodeId="node-2"
        />
      );
      expect(screen.getByTestId("TimerIcon")).toBeInTheDocument();
      expect(screen.getByText("5s")).toBeInTheDocument();
    });

    test("renders slow execution badge (over 5s)", () => {
      render(
        <NodePerformanceBadge
          {...defaultProps}
          nodeId="node-3"
        />
      );
      expect(screen.getByTestId("TimerIcon")).toBeInTheDocument();
      expect(screen.getByText("11s")).toBeInTheDocument();
    });

    test("renders error badge for failed status", () => {
      render(
        <NodePerformanceBadge
          {...defaultProps}
          nodeId="node-error"
          status="error"
        />
      );
      expect(screen.getByTestId("TimerIcon")).toBeInTheDocument();
    });
  });

  describe("Running State", () => {
    test("shows access time icon for running status", () => {
      render(
        <NodePerformanceBadge
          {...defaultProps}
          status="running"
        />
      );
      expect(screen.getByTestId("AccessTimeIcon")).toBeInTheDocument();
      expect(screen.getByTestId("AccessTimeIcon")).toBeInTheDocument();
    });
  });

  describe("Tooltip", () => {
    test("shows tooltip on hover with duration details", async () => {
      const user = userEvent.setup();
      render(
        <NodePerformanceBadge
          {...defaultProps}
          nodeId="node-1"
        />
      );

      const badge = screen.getByText("500ms");
      await user.hover(badge);

      await waitFor(() => {
        expect(screen.getByText("Performance")).toBeInTheDocument();
        expect(screen.getByText("Duration: 500ms")).toBeInTheDocument();
        expect(screen.getByText(/Fast execution/)).toBeInTheDocument();
      });
    });

    test("shows tooltip for error status", async () => {
      const user = userEvent.setup();
      render(
        <NodePerformanceBadge
          {...defaultProps}
          nodeId="node-error"
          status="error"
        />
      );

      const badge = screen.getByText("1s");
      await user.hover(badge);

      await waitFor(() => {
        expect(screen.getByText(/Failed/)).toBeInTheDocument();
      });
    });
  });

  describe("Formatting", () => {
    test("formats milliseconds correctly", () => {
      render(
        <NodePerformanceBadge
          {...defaultProps}
          nodeId="node-ms"
        />
      );
      expect(screen.getByText("250ms")).toBeInTheDocument();
    });

    test("formats seconds correctly", () => {
      render(
        <NodePerformanceBadge
          {...defaultProps}
          nodeId="node-seconds"
        />
      );
      expect(screen.getByText("3s 500ms")).toBeInTheDocument();
    });

    test("formats minutes correctly", () => {
      render(
        <NodePerformanceBadge
          {...defaultProps}
          nodeId="node-minutes"
        />
      );
      expect(screen.getByText("2m 5s")).toBeInTheDocument();
    });
  });

  describe("No Timing Data", () => {
    test("shows placeholder when no timing data available", () => {
      render(
        <NodePerformanceBadge
          {...defaultProps}
          nodeId="node-no-data"
          status="completed"
        />
      );
      expect(screen.getByText("--")).toBeInTheDocument();
    });
  });
});
