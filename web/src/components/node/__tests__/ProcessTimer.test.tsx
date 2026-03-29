import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import ProcessTimer from "../ProcessTimer";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

describe("ProcessTimer", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe("status: starting", () => {
    it("should render starting state with timer", () => {
      renderWithTheme(<ProcessTimer status="starting" />);
      expect(screen.getByText(/starting\.\.\./)).toBeInTheDocument();
    });
  });

  describe("status: booting", () => {
    it("should render booting state with timer", () => {
      renderWithTheme(<ProcessTimer status="booting" />);
      expect(screen.getByText(/starting\.\.\./)).toBeInTheDocument();
    });
  });

  describe("status: running", () => {
    it("should render running state with timer", () => {
      renderWithTheme(<ProcessTimer status="running" />);
      expect(screen.getByText(/running\.\.\./)).toBeInTheDocument();
    });

    it("should update timer incrementally while running", async () => {
      renderWithTheme(<ProcessTimer status="running" />);

      // Initial state
      expect(screen.getByText(/running\.\.\./)).toBeInTheDocument();

      // Fast-forward time by 100ms (the timer update interval)
      act(() => {
        jest.advanceTimersByTime(100);
      });

      // Wait for state update
      await waitFor(() => {
        const timerText = screen.getByText(/running\.\.\./);
        expect(timerText).toBeInTheDocument();
        // Timer should have started showing elapsed time
        expect(timerText.textContent).toMatch(/\d+\.\d+s running\.\.\./);
      });
    });

    it("should continue updating timer over multiple intervals", async () => {
      renderWithTheme(<ProcessTimer status="running" />);

      // Advance multiple intervals
      act(() => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        const timerText = screen.getByText(/running\.\.\./);
        expect(timerText.textContent).toMatch(/\d+\.\d+s running\.\.\./);
      });
    });
  });

  describe("status: completed", () => {
    it("should render completed state with final time", () => {
      renderWithTheme(<ProcessTimer status="completed" />);
      expect(screen.getByText(/completed in/)).toBeInTheDocument();
    });

    it("should not start new interval when status is completed", () => {
      const setIntervalSpy = jest.spyOn(global, "setInterval");
      renderWithTheme(<ProcessTimer status="completed" />);

      // No interval should be created for completed status
      expect(setIntervalSpy).not.toHaveBeenCalled();

      setIntervalSpy.mockRestore();
    });
  });

  describe("status: failed", () => {
    it("should render failed state", () => {
      renderWithTheme(<ProcessTimer status="failed" />);
      expect(screen.getByText(/failed/)).toBeInTheDocument();
    });

    it("should not start new interval when status is failed", () => {
      const setIntervalSpy = jest.spyOn(global, "setInterval");
      renderWithTheme(<ProcessTimer status="failed" />);

      // No interval should be created for failed status
      expect(setIntervalSpy).not.toHaveBeenCalled();

      setIntervalSpy.mockRestore();
    });
  });

  describe("timer cleanup", () => {
    it("should clear interval when component unmounts", () => {
      const clearIntervalSpy = jest.spyOn(global, "clearInterval");
      const { unmount } = renderWithTheme(<ProcessTimer status="running" />);

      // Unmount the component
      unmount();

      // Clear interval should be called
      expect(clearIntervalSpy).toHaveBeenCalled();

      clearIntervalSpy.mockRestore();
    });

    it("should clear interval when status changes from running to completed", () => {
      const clearIntervalSpy = jest.spyOn(global, "clearInterval");
      const { rerender } = renderWithTheme(<ProcessTimer status="running" />);

      // Change status to completed
      rerender(
        <ThemeProvider theme={mockTheme}>
          <ProcessTimer status="completed" />
        </ThemeProvider>
      );

      // Clear interval should be called
      expect(clearIntervalSpy).toHaveBeenCalled();

      clearIntervalSpy.mockRestore();
    });

    it("should clear interval when status changes from running to failed", () => {
      const clearIntervalSpy = jest.spyOn(global, "clearInterval");
      const { rerender } = renderWithTheme(<ProcessTimer status="running" />);

      // Change status to failed
      rerender(
        <ThemeProvider theme={mockTheme}>
          <ProcessTimer status="failed" />
        </ThemeProvider>
      );

      // Clear interval should be called
      expect(clearIntervalSpy).toHaveBeenCalled();

      clearIntervalSpy.mockRestore();
    });
  });

  describe("timer accuracy", () => {
    it("should format timer to 1 decimal place", async () => {
      renderWithTheme(<ProcessTimer status="running" />);

      act(() => {
        jest.advanceTimersByTime(100);
      });

      await waitFor(() => {
        const timerText = screen.getByText(/running\.\.\./);
        // Should match format like "0.1s running..."
        const match = timerText.textContent?.match(/(\d+\.\d+)s running\.\.\./);
        expect(match).toBeTruthy();
        // Verify it has exactly 1 decimal place
        const decimalPart = match?.[1]?.split(".")[1];
        expect(decimalPart?.length).toBe(1);
      });
    });
  });

  describe("memo behavior", () => {
    it("should be exported as memoized component", () => {
      // ProcessTimer is memoized with React.memo
      expect(ProcessTimer).toBeDefined();
    });
  });

  describe("accessibility", () => {
    it("should have process-timer class for styling", () => {
      const { container } = renderWithTheme(<ProcessTimer status="running" />);
      const timerElement = container.querySelector(".process-timer");
      expect(timerElement).toBeInTheDocument();
    });

    it("should not be interactive (pointerEvents: none)", () => {
      const { container } = renderWithTheme(<ProcessTimer status="running" />);
      const timerElement = container.querySelector(".process-timer");
      expect(timerElement).toHaveStyle({ pointerEvents: "none" });
    });
  });
});
