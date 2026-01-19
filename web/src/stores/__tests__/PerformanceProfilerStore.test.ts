/**
 * PerformanceProfilerStore Tests
 */
import usePerformanceProfilerStore, {
  NodePerformanceMetrics,
  PerformanceBottleneck
} from "../../stores/PerformanceProfilerStore";

describe("PerformanceProfilerStore", () => {
  let store: ReturnType<typeof usePerformanceProfilerStore.getState>;

  const testWorkflowId = "test-workflow-123";
  const testNodeId = "test-node-456";
  const testNodeId2 = "test-node-789";

  beforeEach(() => {
    store = usePerformanceProfilerStore.getState();
    store.clearMetrics(testWorkflowId);
  });

  afterEach(() => {
    store.clearMetrics(testWorkflowId);
  });

  describe("recordNodeStart", () => {
    it("should record node start time", () => {
      store.recordNodeStart(
        testWorkflowId,
        testNodeId,
        "LLM",
        "Test LLM Node",
        { x: 100, y: 200 }
      );

      const metrics = store.getNodeMetrics(testWorkflowId, testNodeId);
      expect(metrics).toBeDefined();
      expect(metrics?.status).toBe("running");
      expect(metrics?.startTime).toBeDefined();
      expect(metrics?.memoryEstimateMB).toBeGreaterThan(0);
    });

    it("should use custom memory estimate when provided", () => {
      store.recordNodeStart(
        testWorkflowId,
        testNodeId,
        "LLM",
        "Test Node",
        { x: 0, y: 0 },
        { memoryEstimateMB: 4096 }
      );

      const metrics = store.getNodeMetrics(testWorkflowId, testNodeId);
      expect(metrics?.memoryEstimateMB).toBe(4096);
    });
  });

  describe("recordNodeComplete", () => {
    it("should record node completion", () => {
      store.recordNodeStart(
        testWorkflowId,
        testNodeId,
        "LLM",
        "Test Node",
        { x: 0, y: 0 }
      );

      store.recordNodeComplete(testWorkflowId, testNodeId, { ioWaitMs: 500 });

      const metrics = store.getNodeMetrics(testWorkflowId, testNodeId);
      expect(metrics?.status).toBe("completed");
      expect(metrics?.endTime).toBeDefined();
      expect(metrics?.ioWaitMs).toBe(500);
    });
  });

  describe("recordNodeError", () => {
    it("should record node error", () => {
      store.recordNodeStart(
        testWorkflowId,
        testNodeId,
        "LLM",
        "Test Node",
        { x: 0, y: 0 }
      );

      store.recordNodeError(testWorkflowId, testNodeId);

      const metrics = store.getNodeMetrics(testWorkflowId, testNodeId);
      expect(metrics?.status).toBe("error");
      expect(metrics?.endTime).toBeDefined();
    });
  });

  describe("generateReport", () => {
    it("should generate empty report for workflow with no metrics", () => {
      const report = store.generateReport(testWorkflowId, {});

      expect(report.workflowId).toBe(testWorkflowId);
      expect(report.nodeCount).toBe(0);
      expect(report.completedCount).toBe(0);
      expect(report.errorCount).toBe(0);
      expect(report.bottlenecks).toEqual([]);
      expect(report.score).toBe(100);
    });

    it("should calculate score correctly for completed workflow", () => {
      store.recordNodeStart(
        testWorkflowId,
        testNodeId,
        "LLM",
        "Fast Node",
        { x: 0, y: 0 }
      );

      store.recordNodeComplete(testWorkflowId, testNodeId, { ioWaitMs: 100 });

      const report = store.generateReport(testWorkflowId, {});
      expect(report.completedCount).toBe(1);
      expect(report.nodeCount).toBe(1);
      expect(report.score).toBe(100);
    });

    it("should reduce score for errors", () => {
      store.recordNodeStart(
        testWorkflowId,
        testNodeId,
        "LLM",
        "Error Node",
        { x: 0, y: 0 }
      );

      store.recordNodeError(testWorkflowId, testNodeId);

      const report = store.generateReport(testWorkflowId, {});
      expect(report.errorCount).toBe(1);
      expect(report.score).toBeLessThan(100);
    });

    it("should identify bottlenecks for slow nodes", () => {
      store.recordNodeStart(
        testWorkflowId,
        testNodeId,
        "LLM",
        "Slow Node",
        { x: 0, y: 0 }
      );

      store.recordNodeComplete(testWorkflowId, testNodeId, { ioWaitMs: 100 });

      store.recordNodeStart(
        testWorkflowId,
        testNodeId2,
        "Input",
        "Fast Node",
        { x: 0, y: 0 }
      );

      store.recordNodeComplete(testWorkflowId, testNodeId2, { ioWaitMs: 10 });

      const report = store.generateReport(testWorkflowId, {});

      if (report.bottlenecks.length > 0) {
        expect(report.bottlenecks[0]?.nodeName).toBe("Slow Node");
      }
    });
  });

  describe("clearMetrics", () => {
    it("should clear metrics for specific workflow", () => {
      store.recordNodeStart(
        testWorkflowId,
        testNodeId,
        "LLM",
        "Test Node",
        { x: 0, y: 0 }
      );

      store.clearMetrics(testWorkflowId);

      const metrics = store.getNodeMetrics(testWorkflowId, testNodeId);
      expect(metrics).toBeUndefined();
    });
  });

  describe("getAllMetrics", () => {
    it("should return all metrics for workflow", () => {
      store.recordNodeStart(
        testWorkflowId,
        testNodeId,
        "LLM",
        "Node 1",
        { x: 0, y: 0 }
      );

      store.recordNodeStart(
        testWorkflowId,
        testNodeId2,
        "Input",
        "Node 2",
        { x: 0, y: 0 }
      );

      const metrics = store.getAllMetrics(testWorkflowId);
      expect(metrics.length).toBe(2);
    });
  });
});
