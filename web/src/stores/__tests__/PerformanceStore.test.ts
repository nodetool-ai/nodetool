import { act } from "@testing-library/react";
import usePerformanceStore from "../../stores/PerformanceStore";

describe("PerformanceStore", () => {
  beforeEach(() => {
    act(() => {
      usePerformanceStore.getState().clearMetrics();
    });
  });

  describe("startProfiling", () => {
    it("should initialize metrics for all nodes", () => {
      act(() => {
        usePerformanceStore.getState().startProfiling(
          "workflow-1",
          ["node-1", "node-2"],
          { "node-1": "Input Node", "node-2": "Output Node" },
          { "node-1": "nodetool.input.StringInput", "node-2": "nodetool.output.TextOutput" }
        );
      });

      const metrics = usePerformanceStore.getState().getAllMetrics();
      expect(metrics).toHaveLength(2);
      expect(metrics[0].nodeId).toBe("node-1");
      expect(metrics[0].nodeName).toBe("Input Node");
      expect(metrics[0].status).toBe("pending");
    });

    it("should set workflow summary", () => {
      act(() => {
        usePerformanceStore.getState().startProfiling(
          "workflow-1",
          ["node-1", "node-2", "node-3"],
          {},
          {}
        );
      });

      const summary = usePerformanceStore.getState().workflowSummary;
      expect(summary).not.toBeNull();
      expect(summary?.workflowId).toBe("workflow-1");
      expect(summary?.nodeCount).toBe(3);
      expect(summary?.pendingNodes).toBe(3);
    });
  });

  describe("recordNodeStart", () => {
    beforeEach(() => {
      act(() => {
        usePerformanceStore.getState().startProfiling(
          "workflow-1",
          ["node-1"],
          {},
          {}
        );
      });
    });

    it("should update node status to running", () => {
      act(() => {
        usePerformanceStore.getState().recordNodeStart("node-1");
      });

      const metrics = usePerformanceStore.getState().getMetrics("node-1");
      expect(metrics?.status).toBe("running");
    });

    it("should decrement pending nodes count", () => {
      act(() => {
        usePerformanceStore.getState().startProfiling(
          "workflow-1",
          ["node-1", "node-2"],
          {},
          {}
        );
      });

      act(() => {
        usePerformanceStore.getState().recordNodeStart("node-1");
      });

      const summary = usePerformanceStore.getState().workflowSummary;
      expect(summary?.pendingNodes).toBe(1);
    });
  });

  describe("recordNodeComplete", () => {
    beforeEach(() => {
      act(() => {
        usePerformanceStore.getState().startProfiling(
          "workflow-1",
          ["node-1"],
          {},
          {}
        );
      });
    });

    it("should update node metrics after completion", () => {
      act(() => {
        usePerformanceStore.getState().recordNodeComplete("node-1", 150, 1024);
      });

      const metrics = usePerformanceStore.getState().getMetrics("node-1");
      expect(metrics?.status).toBe("completed");
      expect(metrics?.executionCount).toBe(1);
      expect(metrics?.lastDuration).toBe(150);
      expect(metrics?.averageDuration).toBe(150);
      expect(metrics?.totalDuration).toBe(150);
      expect(metrics?.outputSize).toBe(1024);
    });

    it("should calculate correct average duration", () => {
      act(() => {
        usePerformanceStore.getState().recordNodeComplete("node-1", 100);
      });

      act(() => {
        usePerformanceStore.getState().recordNodeComplete("node-1", 200);
      });

      const metrics = usePerformanceStore.getState().getMetrics("node-1");
      expect(metrics?.executionCount).toBe(2);
      expect(metrics?.totalDuration).toBe(300);
      expect(metrics?.averageDuration).toBe(150);
    });

    it("should update min and max duration", () => {
      act(() => {
        usePerformanceStore.getState().recordNodeComplete("node-1", 100);
      });

      act(() => {
        usePerformanceStore.getState().recordNodeComplete("node-1", 300);
      });

      act(() => {
        usePerformanceStore.getState().recordNodeComplete("node-1", 200);
      });

      const metrics = usePerformanceStore.getState().getMetrics("node-1");
      expect(metrics?.minDuration).toBe(100);
      expect(metrics?.maxDuration).toBe(300);
    });

    it("should increment completed nodes count", () => {
      act(() => {
        usePerformanceStore.getState().startProfiling(
          "workflow-1",
          ["node-1", "node-2"],
          {},
          {}
        );
      });

      act(() => {
        usePerformanceStore.getState().recordNodeComplete("node-1", 100);
      });

      const summary = usePerformanceStore.getState().workflowSummary;
      expect(summary?.completedNodes).toBe(1);
    });
  });

  describe("recordNodeError", () => {
    beforeEach(() => {
      act(() => {
        usePerformanceStore.getState().startProfiling(
          "workflow-1",
          ["node-1"],
          {},
          {}
        );
      });
    });

    it("should update node status to error", () => {
      act(() => {
        usePerformanceStore.getState().recordNodeError("node-1", "Connection failed");
      });

      const metrics = usePerformanceStore.getState().getMetrics("node-1");
      expect(metrics?.status).toBe("error");
      expect(metrics?.errorMessage).toBe("Connection failed");
    });

    it("should increment failed nodes count", () => {
      act(() => {
        usePerformanceStore.getState().startProfiling(
          "workflow-1",
          ["node-1", "node-2"],
          {},
          {}
        );
      });

      act(() => {
        usePerformanceStore.getState().recordNodeError("node-1", "Error");
      });

      const summary = usePerformanceStore.getState().workflowSummary;
      expect(summary?.failedNodes).toBe(1);
    });
  });

  describe("getSlowestNodes", () => {
    beforeEach(() => {
      act(() => {
        usePerformanceStore.getState().startProfiling(
          "workflow-1",
          ["fast-node", "slow-node", "medium-node"],
          {},
          {}
        );
      });
    });

    it("should return nodes sorted by average duration", () => {
      act(() => {
        usePerformanceStore.getState().recordNodeComplete("fast-node", 50);
      });

      act(() => {
        usePerformanceStore.getState().recordNodeComplete("slow-node", 500);
      });

      act(() => {
        usePerformanceStore.getState().recordNodeComplete("medium-node", 200);
      });

      const slowest = usePerformanceStore.getState().getSlowestNodes(2);
      expect(slowest).toHaveLength(2);
      expect(slowest[0].nodeId).toBe("slow-node");
      expect(slowest[1].nodeId).toBe("medium-node");
    });

    it("should respect limit parameter", () => {
      act(() => {
        usePerformanceStore.getState().recordNodeComplete("fast-node", 50);
      });

      act(() => {
        usePerformanceStore.getState().recordNodeComplete("slow-node", 500);
      });

      act(() => {
        usePerformanceStore.getState().recordNodeComplete("medium-node", 200);
      });

      const slowest = usePerformanceStore.getState().getSlowestNodes(1);
      expect(slowest).toHaveLength(1);
      expect(slowest[0].nodeId).toBe("slow-node");
    });
  });

  describe("clearMetrics", () => {
    it("should clear all metrics", () => {
      act(() => {
        usePerformanceStore.getState().startProfiling(
          "workflow-1",
          ["node-1"],
          {},
          {}
        );
      });

      act(() => {
        usePerformanceStore.getState().recordNodeComplete("node-1", 100);
      });

      act(() => {
        usePerformanceStore.getState().clearMetrics();
      });

      const metrics = usePerformanceStore.getState().getAllMetrics();
      expect(metrics).toHaveLength(0);
      expect(usePerformanceStore.getState().workflowSummary).toBeNull();
      expect(usePerformanceStore.getState().isProfiling).toBe(false);
    });
  });

  describe("stopProfiling", () => {
    it("should update workflow summary with total execution time", () => {
      act(() => {
        usePerformanceStore.getState().startProfiling(
          "workflow-1",
          ["node-1"],
          {},
          {}
        );
      });

      act(() => {
        usePerformanceStore.getState().stopProfiling();
      });

      const summary = usePerformanceStore.getState().workflowSummary;
      expect(summary?.endTime).toBeDefined();
      expect(summary?.totalExecutionTime).toBeGreaterThanOrEqual(0);
    });
  });
});
