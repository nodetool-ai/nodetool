/**
 * useWorkflowProfiler hook tests.
 */
import { renderHook, act } from "@testing-library/react";
import useWorkflowProfiler from "../../hooks/useWorkflowProfiler";
import useExecutionTimeStore from "../../stores/ExecutionTimeStore";
import usePerformanceStore from "../../stores/PerformanceStore";

interface SimpleNode {
  id: string;
  type: string;
  data: { label?: string; bypassed?: boolean };
}

describe("useWorkflowProfiler", () => {
  const mockNodes: SimpleNode[] = [
    { id: "node-1", type: "text", data: { label: "Text Node" } },
    { id: "node-2", type: "llm", data: { label: "LLM Node" } }
  ];

  beforeEach(() => {
    act(() => {
      useExecutionTimeStore.setState({ timings: {} });
      usePerformanceStore.setState({ profiles: {}, currentExecutionNodes: {} });
    });
  });

  describe("startTracking", () => {
    it("should initialize tracking for all nodes", () => {
      const { result } = renderHook(() => useWorkflowProfiler());

      act(() => {
        result.current.startTracking("workflow-1", mockNodes);
      });

      const node1 = result.current.getNodeMetrics("workflow-1", "node-1");
      const node2 = result.current.getNodeMetrics("workflow-1", "node-2");

      expect(node1).toBeDefined();
      expect(node1?.nodeType).toBe("text");
      expect(node1?.status).toBe("running");

      expect(node2).toBeDefined();
      expect(node2?.nodeType).toBe("llm");
      expect(node2?.status).toBe("running");
    });

    it("should skip bypassed nodes", () => {
      const bypassedNodes: SimpleNode[] = [
        { id: "node-1", type: "text", data: { label: "Active Node", bypassed: false } },
        { id: "node-2", type: "llm", data: { label: "Bypassed Node", bypassed: true } }
      ];

      const { result } = renderHook(() => useWorkflowProfiler());

      act(() => {
        result.current.startTracking("workflow-1", bypassedNodes);
      });

      const node1 = result.current.getNodeMetrics("workflow-1", "node-1");
      const node2 = result.current.getNodeMetrics("workflow-1", "node-2");

      expect(node1).toBeDefined();
      expect(node2).toBeUndefined();
    });
  });

  describe("recordNodeStart", () => {
    it("should record node execution start", () => {
      const { result } = renderHook(() => useWorkflowProfiler());

      act(() => {
        result.current.recordNodeStart("workflow-1", "node-1", "text", "Text");
      });

      const metrics = result.current.getNodeMetrics("workflow-1", "node-1");
      expect(metrics).toBeDefined();
      expect(metrics?.status).toBe("running");
      expect(metrics?.startTime).toBeGreaterThan(0);
    });
  });

  describe("recordNodeEnd", () => {
    it("should record node execution end with duration", () => {
      const { result } = renderHook(() => useWorkflowProfiler());

      act(() => {
        result.current.recordNodeStart("workflow-1", "node-1", "text", "Text");
      });

      act(() => {
        result.current.recordNodeEnd("workflow-1", "node-1", 128);
      });

      const metrics = result.current.getNodeMetrics("workflow-1", "node-1");
      expect(metrics?.status).toBe("completed");
      expect(metrics?.duration).toBeGreaterThanOrEqual(0);
      expect(metrics?.memoryEstimate).toBe(128);
    });
  });

  describe("recordNodeFailed", () => {
    it("should record failed node execution", () => {
      const { result } = renderHook(() => useWorkflowProfiler());

      act(() => {
        result.current.recordNodeStart("workflow-1", "node-1", "text", "Text");
      });

      act(() => {
        result.current.recordNodeFailed("workflow-1", "node-1");
      });

      const metrics = result.current.getNodeMetrics("workflow-1", "node-1");
      expect(metrics?.status).toBe("failed");
    });
  });

  describe("analyzePerformance", () => {
    it("should return undefined when no profile exists", () => {
      const { result } = renderHook(() => useWorkflowProfiler());

      const metrics = result.current.analyzePerformance("workflow-1");
      expect(metrics).toBeUndefined();
    });

    it("should return metrics after calling analyzeBottlenecks", () => {
      const { result } = renderHook(() => useWorkflowProfiler());

      act(() => {
        result.current.startTracking("workflow-1", mockNodes);
        result.current.recordNodeEnd("workflow-1", "node-1", 100);
        result.current.recordNodeEnd("workflow-1", "node-2", 500);
      });

      act(() => {
        usePerformanceStore.getState().analyzeBottlenecks("workflow-1", mockNodes);
      });

      act(() => {
        result.current.analyzePerformance("workflow-1");
      });

      const metrics = result.current.analyzePerformance("workflow-1");
      expect(metrics).toBeDefined();
      expect(metrics?.workflowId).toBe("workflow-1");
      expect(metrics?.nodeCount).toBe(2);
      expect(metrics?.completedCount).toBe(2);
    });
  });

  describe("clearProfile", () => {
    it("should clear performance profile", () => {
      const { result } = renderHook(() => useWorkflowProfiler());

      act(() => {
        result.current.startTracking("workflow-1", mockNodes);
        result.current.recordNodeEnd("workflow-1", "node-1", 100);
      });

      act(() => {
        usePerformanceStore.getState().analyzeBottlenecks("workflow-1", mockNodes);
      });

      expect(result.current.analyzePerformance("workflow-1")).toBeDefined();

      act(() => {
        result.current.clearProfile("workflow-1");
      });

      expect(result.current.analyzePerformance("workflow-1")).toBeUndefined();
    });
  });

  describe("getSummary", () => {
    it("should return 'No profiling data available' when no data", () => {
      const { result } = renderHook(() => useWorkflowProfiler());

      const summary = result.current.getSummary("workflow-1");
      expect(summary).toBe("No profiling data available");
    });
  });
});
