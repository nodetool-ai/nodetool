/**
 * useWorkflowProfiler Hook Tests
 */

import { renderHook, act } from "@testing-library/react";
import { useWorkflowProfiler } from "../useWorkflowProfiler";
import usePerformanceProfilerStore from "../../stores/PerformanceProfilerStore";
import useExecutionTimeStore from "../../stores/ExecutionTimeStore";

describe("useWorkflowProfiler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useExecutionTimeStore.setState({ timings: {} });
    usePerformanceProfilerStore.setState({
      profiles: {},
      currentProfile: null,
      isProfiling: false
    });
  });

  describe("formatDuration", () => {
    it("should format milliseconds correctly", () => {
      const hookResult = renderHook(() =>
        useWorkflowProfiler("workflow-1")
      );

      const formatDuration = hookResult.result.current.formatDuration;
      expect(formatDuration(500)).toBe("500ms");
      expect(formatDuration(999)).toBe("999ms");
    });

    it("should format seconds correctly", () => {
      const hookResult = renderHook(() =>
        useWorkflowProfiler("workflow-1")
      );

      const formatDuration = hookResult.result.current.formatDuration;
      expect(formatDuration(1000)).toBe("1.00s");
      expect(formatDuration(5000)).toBe("5.00s");
    });

    it("should format minutes correctly", () => {
      const hookResult = renderHook(() =>
        useWorkflowProfiler("workflow-1")
      );

      const formatDuration = hookResult.result.current.formatDuration;
      expect(formatDuration(60000)).toBe("1m 0s");
      expect(formatDuration(90000)).toBe("1m 30s");
    });
  });

  describe("getTimelineData", () => {
    it("should return empty array when no profile", () => {
      const hookResult = renderHook(() =>
        useWorkflowProfiler("workflow-1")
      );

      expect(hookResult.result.current.getTimelineData()).toEqual([]);
    });
  });

  describe("getExecutionSummary", () => {
    it("should return N/A for no execution", () => {
      const hookResult = renderHook(() =>
        useWorkflowProfiler("workflow-1")
      );

      const summary = hookResult.result.current.getExecutionSummary();

      expect(summary.totalDuration).toBe("N/A");
      expect(summary.nodeCount).toBe(0);
    });
  });

  describe("profiling state", () => {
    it("should start and end profiling", () => {
      const hookResult = renderHook(() =>
        useWorkflowProfiler("workflow-1")
      );

      expect(hookResult.result.current.isProfiling).toBe(false);

      act(() => {
        hookResult.result.current.startProfiling();
      });

      expect(hookResult.result.current.isProfiling).toBe(true);

      const profile = hookResult.result.current.endProfiling();
      expect(profile).not.toBeNull();
    });
  });
});
