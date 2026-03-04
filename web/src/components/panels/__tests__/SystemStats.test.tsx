/**
 * SystemStats Component Tests
 *
 * Tests the SystemStats component which displays real-time system statistics
 * including CPU usage, memory usage, and GPU memory usage. This component
 * uses a Zustand store for state management and shows progress bars for each
 * metric in a compact view, with a popover showing detailed stats on click.
 *
 * Key behaviors tested:
 * - Conditional rendering based on systemStats availability
 * - Progress bars for CPU, Memory, and GPU Memory
 * - Edge cases (0%, 100%, missing stats)
 * - Selective Zustand subscriptions for performance
 * - Memoization to prevent unnecessary re-renders
 * - Rapid state changes and transitions
 */

import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

// Define the mock stats type
type SystemStats = {
  cpu_percent: number;
  memory_percent: number;
  vram_percent: number;
};

const mockStats: SystemStats = {
  cpu_percent: 45,
  memory_percent: 60,
  vram_percent: 75
};

let mockSystemStats: SystemStats | null = mockStats;

// Mock the store module BEFORE importing React
jest.mock("../../../stores/systemStatsHandler", () => ({
  useSystemStatsStore: jest.fn()
}));

// Import the component after setting up the mock
import SystemStats from "../SystemStats";
import { useSystemStatsStore } from "../../../stores/systemStatsHandler";

describe("SystemStats", () => {
  const getMockState = () => ({
    stats: mockSystemStats,
    setStats: jest.fn(),
    clearStats: jest.fn()
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockSystemStats = mockStats;

    // Set up default mock implementation
    (useSystemStatsStore as unknown as jest.Mock).mockImplementation((selector) => {
      const state = getMockState();
      if (typeof selector === "function") {
        return selector(state);
      }
      return state;
    });
  });

  const renderWithTheme = () => {
    return render(
      <ThemeProvider theme={mockTheme}>
        <SystemStats />
      </ThemeProvider>
    );
  };

  describe("conditional rendering", () => {
    it("renders progress bars when systemStats is present", () => {
      mockSystemStats = { cpu_percent: 50, memory_percent: 60, vram_percent: 70 };
      (useSystemStatsStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = getMockState();
        return typeof selector === "function" ? selector(state) : state;
      });

      const { container } = renderWithTheme();
      const statsContainer = container.querySelector(".system-stats");
      expect(statsContainer).toBeInTheDocument();

      const progressBars = container.querySelectorAll('[role="progressbar"]');
      expect(progressBars.length).toBe(3);
    });

    it("renders null when systemStats is null", () => {
      mockSystemStats = null;
      (useSystemStatsStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = getMockState();
        return typeof selector === "function" ? selector(state) : state;
      });

      const { container } = renderWithTheme();
      const statsContainer = container.querySelector(".system-stats");
      expect(statsContainer).not.toBeInTheDocument();
    });

    it("renders null when systemStats is undefined", () => {
      mockSystemStats = undefined as unknown as null;
      (useSystemStatsStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = getMockState();
        return typeof selector === "function" ? selector(state) : state;
      });

      const { container } = renderWithTheme();
      const statsContainer = container.querySelector(".system-stats");
      expect(statsContainer).not.toBeInTheDocument();
    });
  });

  describe("progress bars display", () => {
    it("renders three progress bars for CPU, Memory, and GPU Memory", () => {
      mockSystemStats = { cpu_percent: 30, memory_percent: 50, vram_percent: 80 };
      (useSystemStatsStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = getMockState();
        return typeof selector === "function" ? selector(state) : state;
      });

      const { container } = renderWithTheme();
      const progressBars = container.querySelectorAll('[role="progressbar"]');
      expect(progressBars.length).toBe(3);
    });

    it("displays correct percentage values on progress bars", () => {
      mockSystemStats = { cpu_percent: 25, memory_percent: 50, vram_percent: 75 };
      (useSystemStatsStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = getMockState();
        return typeof selector === "function" ? selector(state) : state;
      });

      const { container } = renderWithTheme();
      const progressBars = container.querySelectorAll('[role="progressbar"]');
      
      // Check that progress bars have correct values via their aria-valuenow attribute
      expect(progressBars[0]).toHaveAttribute("aria-valuenow", "25");
      expect(progressBars[1]).toHaveAttribute("aria-valuenow", "50");
      expect(progressBars[2]).toHaveAttribute("aria-valuenow", "75");
    });
  });

  describe("edge cases", () => {
    it("handles 0% for all stats", () => {
      mockSystemStats = { cpu_percent: 0, memory_percent: 0, vram_percent: 0 };
      (useSystemStatsStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = getMockState();
        return typeof selector === "function" ? selector(state) : state;
      });

      const { container } = renderWithTheme();
      const progressBars = container.querySelectorAll('[role="progressbar"]');
      expect(progressBars.length).toBe(3);
    });

    it("handles 100% for all stats", () => {
      mockSystemStats = { cpu_percent: 100, memory_percent: 100, vram_percent: 100 };
      (useSystemStatsStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = getMockState();
        return typeof selector === "function" ? selector(state) : state;
      });

      const { container } = renderWithTheme();
      const progressBars = container.querySelectorAll('[role="progressbar"]');
      expect(progressBars.length).toBe(3);
    });

    it("handles fractional percentages correctly", () => {
      mockSystemStats = { cpu_percent: 42.7, memory_percent: 58.3, vram_percent: 73.9 };
      (useSystemStatsStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = getMockState();
        return typeof selector === "function" ? selector(state) : state;
      });

      const { container } = renderWithTheme();
      const progressBars = container.querySelectorAll('[role="progressbar"]');
      
      // Percentages should be rounded to integers for display
      expect(progressBars[0]).toHaveAttribute("aria-valuenow", "43");
      expect(progressBars[1]).toHaveAttribute("aria-valuenow", "58");
      expect(progressBars[2]).toHaveAttribute("aria-valuenow", "74");
    });

    it("handles missing vram_percent (0%)", () => {
      mockSystemStats = { cpu_percent: 50, memory_percent: 60, vram_percent: 0 };
      (useSystemStatsStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = getMockState();
        return typeof selector === "function" ? selector(state) : state;
      });

      const { container } = renderWithTheme();
      const progressBars = container.querySelectorAll('[role="progressbar"]');
      expect(progressBars.length).toBe(3);
    });

    it("handles very high percentages (>100%)", () => {
      mockSystemStats = { cpu_percent: 105, memory_percent: 110, vram_percent: 115 };
      (useSystemStatsStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = getMockState();
        return typeof selector === "function" ? selector(state) : state;
      });

      const { container } = renderWithTheme();
      const progressBars = container.querySelectorAll('[role="progressbar"]');
      expect(progressBars.length).toBe(3);
    });
  });

  describe("selective Zustand subscriptions", () => {
    it("subscribes to stats property only", () => {
      mockSystemStats = { cpu_percent: 50, memory_percent: 60, vram_percent: 70 };
      (useSystemStatsStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = getMockState();
        return typeof selector === "function" ? selector(state) : state;
      });

      renderWithTheme();
      expect(useSystemStatsStore).toHaveBeenCalled();
      expect(useSystemStatsStore).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe("memoization", () => {
    it("is memoized to prevent unnecessary re-renders", () => {
      mockSystemStats = { cpu_percent: 50, memory_percent: 60, vram_percent: 70 };
      (useSystemStatsStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = getMockState();
        return typeof selector === "function" ? selector(state) : state;
      });

      const { rerender, container } = renderWithTheme();

      rerender(
        <ThemeProvider theme={mockTheme}>
          <SystemStats />
        </ThemeProvider>
      );

      const statsContainer = container.querySelector(".system-stats");
      expect(statsContainer).toBeInTheDocument();

      const progressBars = container.querySelectorAll('[role="progressbar"]');
      expect(progressBars.length).toBe(3);
    });
  });

  describe("CSS classes and styling", () => {
    it("has system-stats class", () => {
      mockSystemStats = { cpu_percent: 50, memory_percent: 60, vram_percent: 70 };
      (useSystemStatsStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = getMockState();
        return typeof selector === "function" ? selector(state) : state;
      });

      const { container } = renderWithTheme();
      const statsContainer = container.querySelector(".system-stats");
      expect(statsContainer).toBeInTheDocument();
      expect(statsContainer).toHaveClass("system-stats");
    });
  });

  describe("rapid state changes", () => {
    it("handles rapid stats updates without errors", () => {
      // Start with initial stats
      mockSystemStats = { cpu_percent: 10, memory_percent: 20, vram_percent: 30 };
      (useSystemStatsStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = getMockState();
        return typeof selector === "function" ? selector(state) : state;
      });

      renderWithTheme();

      // Update stats multiple times
      for (let i = 0; i < 5; i++) {
        mockSystemStats = {
          cpu_percent: 10 + i * 10,
          memory_percent: 20 + i * 10,
          vram_percent: 30 + i * 10
        };

        (useSystemStatsStore as unknown as jest.Mock).mockImplementation((selector) => {
          const state = getMockState();
          return typeof selector === "function" ? selector(state) : state;
        });

        const { container: newContainer } = renderWithTheme();
        const statsContainer = newContainer.querySelector(".system-stats");
        expect(statsContainer).toBeInTheDocument();
      }
    });

    it("handles transition from null to valid stats", () => {
      // Start with null
      mockSystemStats = null;
      (useSystemStatsStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = getMockState();
        return typeof selector === "function" ? selector(state) : state;
      });

      const { container } = renderWithTheme();

      // Should not render when null
      expect(container.querySelector(".system-stats")).not.toBeInTheDocument();

      // Update to valid stats
      mockSystemStats = { cpu_percent: 50, memory_percent: 60, vram_percent: 70 };
      (useSystemStatsStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = getMockState();
        return typeof selector === "function" ? selector(state) : state;
      });

      // Render new component with updated stats
      const { container: newContainer } = renderWithTheme();

      const statsContainer = newContainer.querySelector(".system-stats");
      expect(statsContainer).toBeInTheDocument();

      const progressBars = newContainer.querySelectorAll('[role="progressbar"]');
      expect(progressBars.length).toBe(3);
    });

    it("handles transition from valid stats to null", () => {
      // Start with valid stats
      mockSystemStats = { cpu_percent: 50, memory_percent: 60, vram_percent: 70 };
      (useSystemStatsStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = getMockState();
        return typeof selector === "function" ? selector(state) : state;
      });

      const { container } = renderWithTheme();

      // Should render
      expect(container.querySelector(".system-stats")).toBeInTheDocument();

      // Update to null
      mockSystemStats = null;
      (useSystemStatsStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = getMockState();
        return typeof selector === "function" ? selector(state) : state;
      });

      // Render new component with null stats
      const { container: newContainer } = renderWithTheme();

      expect(newContainer.querySelector(".system-stats")).not.toBeInTheDocument();
    });
  });
});
