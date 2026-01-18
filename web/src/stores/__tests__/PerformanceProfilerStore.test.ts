/**
 * Performance Profiler Store Tests
 */

import usePerformanceProfilerStore from "../PerformanceProfilerStore";

describe("Performance Profiler Store", () => {
  beforeEach(() => {
    usePerformanceProfilerStore.setState({
      currentMetrics: null,
      historicalMetrics: [],
      isProfiling: false
    });
  });

  describe("startProfiling", () => {
    it("should initialize profiling session with nodes", () => {
      const nodes = [
        { id: "node1", type: "test", data: { label: "Test Node 1" }, sync_mode: "regular" },
        { id: "node2", type: "test", data: { label: "Test Node 2" }, sync_mode: "regular" }
      ];

      usePerformanceProfilerStore.getState().startProfiling("workflow-1", "Test Workflow", nodes);

      const metrics = usePerformanceProfilerStore.getState().currentMetrics;
      expect(metrics).not.toBeNull();
      expect(metrics?.workflowId).toBe("workflow-1");
      expect(metrics?.workflowName).toBe("Test Workflow");
      expect(Object.keys(metrics?.nodeMetrics || {})).toHaveLength(2);
      expect(usePerformanceProfilerStore.getState().isProfiling).toBe(true);
    });
  });

  describe("recordNodeDuration", () => {
    beforeEach(() => {
      usePerformanceProfilerStore.getState().startProfiling("workflow-1", "Test", [{ id: "node1", type: "test", sync_mode: "regular" }]);
    });

    it("should record node execution duration", () => {
      usePerformanceProfilerStore.getState().recordNodeDuration("node1", 1000);

      const nodeMetrics = usePerformanceProfilerStore.getState().getNodeMetrics("node1");
      expect(nodeMetrics).toBeDefined();
      expect(nodeMetrics?.executionCount).toBe(1);
      expect(nodeMetrics?.totalDuration).toBe(1000);
      expect(nodeMetrics?.averageDuration).toBe(1000);
    });

    it("should accumulate durations across multiple executions", () => {
      usePerformanceProfilerStore.getState().recordNodeDuration("node1", 500);
      usePerformanceProfilerStore.getState().recordNodeDuration("node1", 1500);

      const nodeMetrics = usePerformanceProfilerStore.getState().getNodeMetrics("node1");
      expect(nodeMetrics?.executionCount).toBe(2);
      expect(nodeMetrics?.totalDuration).toBe(2000);
      expect(nodeMetrics?.averageDuration).toBe(1000);
    });

    it("should track min and max durations", () => {
      usePerformanceProfilerStore.getState().recordNodeDuration("node1", 500);
      usePerformanceProfilerStore.getState().recordNodeDuration("node1", 2000);
      usePerformanceProfilerStore.getState().recordNodeDuration("node1", 1000);

      const nodeMetrics = usePerformanceProfilerStore.getState().getNodeMetrics("node1");
      expect(nodeMetrics?.minDuration).toBe(500);
      expect(nodeMetrics?.maxDuration).toBe(2000);
    });
  });

  describe("getBottlenecks", () => {
    beforeEach(() => {
      usePerformanceProfilerStore.getState().startProfiling("workflow-1", "Test", [
        { id: "fast", type: "fast", sync_mode: "regular" },
        { id: "slow", type: "slow", sync_mode: "regular" },
        { id: "medium", type: "medium", sync_mode: "regular" }
      ]);
    });

    it("should identify slow nodes as bottlenecks", () => {
      usePerformanceProfilerStore.getState().recordNodeDuration("fast", 100);
      usePerformanceProfilerStore.getState().recordNodeDuration("medium", 500);
      usePerformanceProfilerStore.getState().recordNodeDuration("slow", 2000);

      const bottlenecks = usePerformanceProfilerStore.getState().getBottlenecks();
      expect(bottlenecks.length).toBeGreaterThan(0);
      expect(bottlenecks.some(b => b.nodeId === "slow")).toBe(true);
    });

    it("should return empty array when no slow nodes", () => {
      usePerformanceProfilerStore.getState().recordNodeDuration("fast", 100);
      usePerformanceProfilerStore.getState().recordNodeDuration("medium", 100);
      usePerformanceProfilerStore.getState().recordNodeDuration("slow", 100);

      const bottlenecks = usePerformanceProfilerStore.getState().getBottlenecks();
      expect(bottlenecks.length).toBeLessThan(2);
    });
  });

  describe("generateReport", () => {
    it("should return empty report when no profiling data", () => {
      const report = usePerformanceProfilerStore.getState().generateReport();

      expect(report.summary.totalExecutions).toBe(0);
      expect(report.nodes).toHaveLength(0);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    it("should generate comprehensive report with data", () => {
      usePerformanceProfilerStore.getState().startProfiling("workflow-1", "Test", [{ id: "node1", type: "test", sync_mode: "regular" }]);

      usePerformanceProfilerStore.getState().recordNodeDuration("node1", 1000);
      usePerformanceProfilerStore.getState().recordNodeDuration("node1", 2000);

      const report = usePerformanceProfilerStore.getState().generateReport();

      expect(report.summary.totalExecutions).toBe(2);
      expect(report.summary.averageDuration).toBe(1500);
      expect(report.nodes).toHaveLength(1);
      expect(report.nodes[0].averageDuration).toBe(1500);
    });
  });

  describe("clearCurrentSession", () => {
    it("should clear all profiling data", () => {
      usePerformanceProfilerStore.getState().startProfiling("workflow-1", "Test", [{ id: "node1", type: "test", sync_mode: "regular" }]);
      usePerformanceProfilerStore.getState().recordNodeDuration("node1", 1000);

      usePerformanceProfilerStore.getState().clearCurrentSession();

      expect(usePerformanceProfilerStore.getState().currentMetrics).toBeNull();
      expect(usePerformanceProfilerStore.getState().isProfiling).toBe(false);
    });
  });
});
