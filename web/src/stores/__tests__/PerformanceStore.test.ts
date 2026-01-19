/**
 * PerformanceStore tests.
 */
import { renderHook, act } from "@testing-library/react";
import usePerformanceStore from "../../stores/PerformanceStore";

describe("PerformanceStore", () => {
  beforeEach(() => {
    act(() => {
      usePerformanceStore.setState({ profiles: {}, currentExecutionNodes: {} });
    });
  });

  describe("recordExecutionStart", () => {
    it("should record execution start for a node", () => {
      const { result } = renderHook(() => usePerformanceStore());

      act(() => {
        result.current.recordExecutionStart(
          "workflow-1",
          "node-1",
          "text",
          "Text Node"
        );
      });

      const nodeMetrics = result.current.getNodeMetrics("workflow-1", "node-1");
      expect(nodeMetrics).toBeDefined();
      expect(nodeMetrics?.nodeId).toBe("node-1");
      expect(nodeMetrics?.nodeType).toBe("text");
      expect(nodeMetrics?.nodeLabel).toBe("Text Node");
      expect(nodeMetrics?.status).toBe("running");
      expect(nodeMetrics?.startTime).toBeGreaterThan(0);
    });

    it("should record multiple nodes independently", () => {
      const { result } = renderHook(() => usePerformanceStore());

      act(() => {
        result.current.recordExecutionStart("workflow-1", "node-1", "text", "Node 1");
        result.current.recordExecutionStart("workflow-1", "node-2", "image", "Node 2");
      });

      const node1 = result.current.getNodeMetrics("workflow-1", "node-1");
      const node2 = result.current.getNodeMetrics("workflow-1", "node-2");

      expect(node1?.nodeType).toBe("text");
      expect(node2?.nodeType).toBe("image");
    });
  });

  describe("recordExecutionEnd", () => {
    it("should update node with execution metrics", () => {
      const { result } = renderHook(() => usePerformanceStore());

      act(() => {
        result.current.recordExecutionStart("workflow-1", "node-1", "text", "Text Node");
      });

      act(() => {
        result.current.recordExecutionEnd("workflow-1", "node-1", 1500, 256);
      });

      const nodeMetrics = result.current.getNodeMetrics("workflow-1", "node-1");
      expect(nodeMetrics?.duration).toBe(1500);
      expect(nodeMetrics?.memoryEstimate).toBe(256);
      expect(nodeMetrics?.status).toBe("completed");
      expect(nodeMetrics?.endTime).toBeDefined();
    });
  });

  describe("recordExecutionFailed", () => {
    it("should mark node as failed", () => {
      const { result } = renderHook(() => usePerformanceStore());

      act(() => {
        result.current.recordExecutionStart("workflow-1", "node-1", "text", "Text Node");
      });

      act(() => {
        result.current.recordExecutionFailed("workflow-1", "node-1", 500);
      });

      const nodeMetrics = result.current.getNodeMetrics("workflow-1", "node-1");
      expect(nodeMetrics?.status).toBe("failed");
      expect(nodeMetrics?.duration).toBe(500);
    });
  });

  describe("analyzeBottlenecks", () => {
    it("should identify bottleneck nodes", () => {
      const { result } = renderHook(() => usePerformanceStore());

      act(() => {
        result.current.recordExecutionStart("workflow-1", "fast-node", "text", "Fast");
        result.current.recordExecutionStart("workflow-1", "slow-node", "llm", "Slow");
        result.current.recordExecutionStart("workflow-1", "medium-node", "image", "Medium");
      });

      act(() => {
        result.current.recordExecutionEnd("workflow-1", "fast-node", 100, 64);
        result.current.recordExecutionEnd("workflow-1", "slow-node", 15000, 512);
        result.current.recordExecutionEnd("workflow-1", "medium-node", 500, 128);
      });

      const nodes = [
        { id: "fast-node", type: "text", data: { label: "Fast" } },
        { id: "slow-node", type: "llm", data: { label: "Slow" } },
        { id: "medium-node", type: "image", data: { label: "Medium" } }
      ];

      act(() => {
        result.current.analyzeBottlenecks("workflow-1", nodes);
      });

      const metrics = result.current.getMetrics("workflow-1");
      expect(metrics).toBeDefined();
      expect(metrics?.totalDuration).toBe(15600);
      expect(metrics?.nodeCount).toBe(3);
      expect(metrics?.completedCount).toBe(3);
      expect(metrics?.bottleneckNodes.length).toBeGreaterThan(0);
      expect(metrics?.bottleneckNodes[0]?.nodeId).toBe("slow-node");
    });

    it("should generate optimization suggestions", () => {
      const { result } = renderHook(() => usePerformanceStore());

      act(() => {
        result.current.recordExecutionStart("workflow-1", "node-1", "llm", "LLM");
        result.current.recordExecutionStart("workflow-1", "node-2", "llm", "LLM 2");
      });

      act(() => {
        result.current.recordExecutionEnd("workflow-1", "node-1", 5000, 256);
        result.current.recordExecutionEnd("workflow-1", "node-2", 8000, 256);
      });

      const nodes = [
        { id: "node-1", type: "llm", data: { label: "LLM" } },
        { id: "node-2", type: "llm", data: { label: "LLM 2" } }
      ];

      act(() => {
        result.current.analyzeBottlenecks("workflow-1", nodes);
      });

      const metrics = result.current.getMetrics("workflow-1");
      expect(metrics?.optimizationSuggestions.length).toBeGreaterThan(0);
    });
  });

  describe("clearProfile", () => {
    it("should clear all data for a workflow", () => {
      const { result } = renderHook(() => usePerformanceStore());

      act(() => {
        result.current.recordExecutionStart("workflow-1", "node-1", "text", "Node");
        result.current.recordExecutionEnd("workflow-1", "node-1", 1000, 64);
      });

      act(() => {
        result.current.analyzeBottlenecks("workflow-1", [
          { id: "node-1", type: "text", data: { label: "Node" } }
        ]);
      });

      expect(result.current.getMetrics("workflow-1")).toBeDefined();
      expect(result.current.getNodeMetrics("workflow-1", "node-1")).toBeDefined();

      act(() => {
        result.current.clearProfile("workflow-1");
      });

      expect(result.current.getMetrics("workflow-1")).toBeUndefined();
      expect(result.current.getNodeMetrics("workflow-1", "node-1")).toBeUndefined();
    });
  });

  describe("getMetrics", () => {
    it("should return undefined for non-existent workflow", () => {
      const { result } = renderHook(() => usePerformanceStore());

      const metrics = result.current.getMetrics("non-existent");
      expect(metrics).toBeUndefined();
    });

    it("should return profile after analysis", () => {
      const { result } = renderHook(() => usePerformanceStore());

      act(() => {
        result.current.recordExecutionStart("workflow-1", "node-1", "text", "Node");
        result.current.recordExecutionEnd("workflow-1", "node-1", 1000, 64);
      });

      act(() => {
        result.current.analyzeBottlenecks("workflow-1", [
          { id: "node-1", type: "text", data: { label: "Node" } }
        ]);
      });

      const metrics = result.current.getMetrics("workflow-1");
      expect(metrics).toBeDefined();
      expect(metrics?.workflowId).toBe("workflow-1");
      expect(metrics?.totalDuration).toBe(1000);
    });
  });
});
