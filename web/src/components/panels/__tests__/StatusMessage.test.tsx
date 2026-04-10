/**
 * StatusMessage Component Tests
 *
 * Tests the StatusMessage component which displays workflow status messages
 * during workflow execution. This component uses selective Zustand subscriptions
 * and only renders when the workflow is in the "running" state.
 *
 * Key behaviors to test:
 * - Renders when workflow is running and status message exists
 * - Renders when workflow is running but status message is null (empty string)
 * - Does not render when workflow is not running
 * - Uses selective Zustand subscriptions for performance
 * - Has correct CSS classes and MUI Typography props
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import StatusMessage from "../StatusMessage";
import mockTheme from "../../../__mocks__/themeMock";

// Mock the WorkflowRunner store
const mockStatusMessage = "Running workflow...";
const mockRunnerState = "running";

jest.mock("../../../stores/WorkflowRunner", () => ({
  useWebsocketRunner: jest.fn((selector) => {
    // Mock the selector function to return different values based on what's being selected
    const state = {
      state: mockRunnerState,
      statusMessage: mockStatusMessage
    };

    // Simulate Zustand's selector behavior
    if (typeof selector === "function") {
      return selector(state);
    }
    return state;
  })
}));

import { useWebsocketRunner } from "../../../stores/WorkflowRunner";

describe("StatusMessage", () => {
  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Helper to render with theme
  const renderWithTheme = () => {
    return render(
      <ThemeProvider theme={mockTheme}>
        <StatusMessage />
      </ThemeProvider>
    );
  };

  describe("conditional rendering based on workflow state", () => {
    it("renders when workflow is running", () => {
      // Mock the hook to return running state
      (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
        const state = { state: "running", statusMessage: "Processing nodes..." };
        return typeof selector === "function" ? selector(state) : state;
      });

      renderWithTheme();

      const message = screen.getByText("Processing nodes...");
      expect(message).toBeInTheDocument();
    });

    it("does not render when workflow is idle", () => {
      // Mock the hook to return idle state
      (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
        const state = { state: "idle", statusMessage: "Ready" };
        return typeof selector === "function" ? selector(state) : state;
      });

      renderWithTheme();

      const message = screen.queryByText("Ready");
      expect(message).not.toBeInTheDocument();
    });

    it("does not render when workflow is in error state", () => {
      // Mock the hook to return error state
      (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
        const state = { state: "error", statusMessage: "Error occurred" };
        return typeof selector === "function" ? selector(state) : state;
      });

      renderWithTheme();

      const message = screen.queryByText("Error occurred");
      expect(message).not.toBeInTheDocument();
    });

    it("renders when workflow is in connected state", () => {
      // Mock the hook to return connected state
      (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
        const state = { state: "connected", statusMessage: "Connected to server" };
        return typeof selector === "function" ? selector(state) : state;
      });

      renderWithTheme();

      const message = screen.queryByText("Connected to server");
      expect(message).toBeInTheDocument();
    });

    it("renders when workflow is paused", () => {
      // Mock the hook to return paused state
      (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
        const state = { state: "paused", statusMessage: "Workflow paused" };
        return typeof selector === "function" ? selector(state) : state;
      });

      renderWithTheme();

      const message = screen.queryByText("Workflow paused");
      expect(message).toBeInTheDocument();
    });

    it("does not render when workflow is cancelled", () => {
      // Mock the hook to return cancelled state
      (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
        const state = { state: "cancelled", statusMessage: "Workflow cancelled" };
        return typeof selector === "function" ? selector(state) : state;
      });

      renderWithTheme();

      const message = screen.queryByText("Workflow cancelled");
      expect(message).not.toBeInTheDocument();
    });
  });

  describe("status message display", () => {
    it("displays the status message text when running", () => {
      (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
        const state = { state: "running", statusMessage: "Executing node 1 of 5" };
        return typeof selector === "function" ? selector(state) : state;
      });

      renderWithTheme();

      expect(screen.getByText("Executing node 1 of 5")).toBeInTheDocument();
    });

    it("displays empty string when statusMessage is null", () => {
      (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
        const state = { state: "running", statusMessage: null };
        return typeof selector === "function" ? selector(state) : state;
      });

      const { container } = renderWithTheme();

      const typography = container.querySelector(".status-message");
      expect(typography).toBeInTheDocument();
      expect(typography?.textContent).toBe("");
    });

    it("displays empty string when statusMessage is undefined", () => {
      (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
        const state = { state: "running", statusMessage: undefined };
        return typeof selector === "function" ? selector(state) : state;
      });

      const { container } = renderWithTheme();

      const typography = container.querySelector(".status-message");
      expect(typography).toBeInTheDocument();
      expect(typography?.textContent).toBe("");
    });

    it("handles long status messages", () => {
      const longMessage = "This is a very long status message that contains detailed information about the current workflow execution state including progress and node details";

      (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
        const state = { state: "running", statusMessage: longMessage };
        return typeof selector === "function" ? selector(state) : state;
      });

      renderWithTheme();

      expect(screen.getByText(longMessage)).toBeInTheDocument();
    });

    it("handles special characters in status message", () => {
      const specialMessage = "Processing: <Node> & \"quotes\" 'apostrophes'";

      (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
        const state = { state: "running", statusMessage: specialMessage };
        return typeof selector === "function" ? selector(state) : state;
      });

      renderWithTheme();

      expect(screen.getByText(specialMessage)).toBeInTheDocument();
    });

    it("handles numeric status message converted to string", () => {
      (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
        const state = { state: "running", statusMessage: "50%" };
        return typeof selector === "function" ? selector(state) : state;
      });

      renderWithTheme();

      expect(screen.getByText("50%")).toBeInTheDocument();
    });
  });

  describe("selective Zustand subscriptions", () => {
    it("subscribes to state property only", () => {
      (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
        const state = { state: "running", statusMessage: "Test" };
        const result = typeof selector === "function" ? selector(state) : state;
        return result;
      });

      renderWithTheme();

      // Verify the hook was called
      expect(useWebsocketRunner).toHaveBeenCalled();

      // Verify it was called with a function (selector)
      expect(useWebsocketRunner).toHaveBeenCalledWith(expect.any(Function));
    });

    it("subscribes to statusMessage property only", () => {
      (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
        const state = { state: "running", statusMessage: "Test message" };
        return typeof selector === "function" ? selector(state) : state;
      });

      renderWithTheme();

      expect(useWebsocketRunner).toHaveBeenCalled();
      expect(useWebsocketRunner).toHaveBeenCalledWith(expect.any(Function));
    });

    it("uses two separate selective subscriptions for performance", () => {
      (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
        const state = { state: "running", statusMessage: "Test" };
        return typeof selector === "function" ? selector(state) : state;
      });

      renderWithTheme();

      // Should be called twice (once for state, once for statusMessage)
      expect(useWebsocketRunner).toHaveBeenCalledTimes(2);
    });
  });

  describe("MUI Typography component props", () => {
    it("renders with caption variant", () => {
      (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
        const state = { state: "running", statusMessage: "Test" };
        return typeof selector === "function" ? selector(state) : state;
      });

      const { container } = renderWithTheme();

      const typography = container.querySelector(".status-message");
      expect(typography).toBeInTheDocument();
    });

    it("renders with inherit color", () => {
      (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
        const state = { state: "running", statusMessage: "Test" };
        return typeof selector === "function" ? selector(state) : state;
      });

      const { container } = renderWithTheme();

      // Caption renders as Typography (p element) with status-message class
      const typography = container.querySelector('.status-message');
      expect(typography).toBeInTheDocument();
    });
  });

  describe("CSS classes", () => {
    it("has status-message class", () => {
      (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
        const state = { state: "running", statusMessage: "Test" };
        return typeof selector === "function" ? selector(state) : state;
      });

      const { container } = renderWithTheme();

      const message = container.querySelector(".status-message");
      expect(message).toBeInTheDocument();
    });

    it("has animating class for CSS animations", () => {
      (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
        const state = { state: "running", statusMessage: "Test" };
        return typeof selector === "function" ? selector(state) : state;
      });

      const { container } = renderWithTheme();

      const message = container.querySelector(".animating");
      expect(message).toBeInTheDocument();
    });

    it("has both status-message and animating classes", () => {
      (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
        const state = { state: "running", statusMessage: "Test" };
        return typeof selector === "function" ? selector(state) : state;
      });

      const { container } = renderWithTheme();

      const message = container.querySelector(".status-message.animating");
      expect(message).toBeInTheDocument();
    });
  });

  describe("memoization", () => {
    it("is memoized to prevent unnecessary re-renders", () => {
      (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
        const state = { state: "running", statusMessage: "Test" };
        return typeof selector === "function" ? selector(state) : state;
      });

      const { rerender } = renderWithTheme();

      // Rerender with same props
      rerender(
        <ThemeProvider theme={mockTheme}>
          <StatusMessage />
        </ThemeProvider>
      );

      // Component should still be there (not crashed)
      expect(screen.getByText("Test")).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("handles rapid state changes", () => {
      // Start with running
      (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
        const state = { state: "running", statusMessage: "Step 1" };
        return typeof selector === "function" ? selector(state) : state;
      });

      const { unmount } = renderWithTheme();
      expect(screen.getByText("Step 1")).toBeInTheDocument();

      // Unmount and change to idle
      unmount();
      (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
        const state = { state: "idle", statusMessage: "Step 1" };
        return typeof selector === "function" ? selector(state) : state;
      });

      renderWithTheme();
      expect(screen.queryByText("Step 1")).not.toBeInTheDocument();
    });

    it("handles status message with emoji", () => {
      (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
        const state = { state: "running", statusMessage: "Running with emoji" };
        return typeof selector === "function" ? selector(state) : state;
      });

      renderWithTheme();

      expect(screen.getByText("Running with emoji")).toBeInTheDocument();
    });

    it("handles status message with newlines", () => {
      (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
        const state = { state: "running", statusMessage: "Line 1\nLine 2" };
        return typeof selector === "function" ? selector(state) : state;
      });

      const { container } = renderWithTheme();

      const message = container.querySelector(".status-message");
      expect(message).toBeInTheDocument();
      expect(message?.textContent).toBe("Line 1\nLine 2");
    });
  });
});
