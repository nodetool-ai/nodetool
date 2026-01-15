import useExecutionTimeStore from "../ExecutionTimeStore";

describe("ExecutionTimeStore", () => {
  beforeEach(() => {
    useExecutionTimeStore.setState({ timings: {}, history: [] });
  });

  describe("startExecution", () => {
    it("should record start time for a node", () => {
      const { startExecution, getTiming } = useExecutionTimeStore.getState();

      startExecution("workflow1", "node1");

      const timing = getTiming("workflow1", "node1");
      expect(timing).toBeDefined();
      expect(timing!.startTime).toBeGreaterThan(0);
      expect(timing!.endTime).toBeUndefined();
    });

    it("should allow multiple nodes in same workflow", () => {
      const { startExecution, getTiming } = useExecutionTimeStore.getState();

      startExecution("workflow1", "node1");
      startExecution("workflow1", "node2");

      expect(getTiming("workflow1", "node1")).toBeDefined();
      expect(getTiming("workflow1", "node2")).toBeDefined();
    });

    it("should allow same node in different workflows", () => {
      const { startExecution, getTiming } = useExecutionTimeStore.getState();

      startExecution("workflow1", "node1");
      startExecution("workflow2", "node1");

      expect(getTiming("workflow1", "node1")).toBeDefined();
      expect(getTiming("workflow2", "node1")).toBeDefined();
    });
  });

  describe("endExecution", () => {
    it("should record end time when execution ends", () => {
      const { startExecution, endExecution, getTiming } = useExecutionTimeStore.getState();

      startExecution("workflow1", "node1");
      const startTime = getTiming("workflow1", "node1")!.startTime;

      const now = Date.now();
      jest.spyOn(Date, "now").mockImplementation(() => now + 1500);

      endExecution("workflow1", "node1", "completed");

      const timing = getTiming("workflow1", "node1");
      expect(timing).toBeDefined();
      expect(timing!.startTime).toBe(startTime);
      expect(timing!.endTime).toBe(now + 1500);

      jest.restoreAllMocks();
    });

    it("should add to history when execution ends", () => {
      const { startExecution, endExecution } = useExecutionTimeStore.getState();

      startExecution("workflow1", "node1");
      const now = Date.now();
      jest.spyOn(Date, "now").mockImplementation(() => now + 2000);

      endExecution("workflow1", "node1", "completed", "text", "Text Node");

      const updatedHistory = useExecutionTimeStore.getState().history;
      expect(updatedHistory.length).toBe(1);
      expect(updatedHistory[0]).toEqual({
        workflowId: "workflow1",
        nodeId: "node1",
        nodeType: "text",
        nodeName: "Text Node",
        duration: 2000,
        status: "completed",
        timestamp: now + 2000
      });

      jest.restoreAllMocks();
    });

    it("should record error status in history", () => {
      const { startExecution, endExecution } = useExecutionTimeStore.getState();

      startExecution("workflow1", "node1");
      const now = Date.now();
      jest.spyOn(Date, "now").mockImplementation(() => now + 500);

      endExecution("workflow1", "node1", "error", "image", "Image Node");

      const updatedHistory = useExecutionTimeStore.getState().history;
      expect(updatedHistory.length).toBe(1);
      expect(updatedHistory[0].status).toBe("error");
      expect(updatedHistory[0].nodeType).toBe("image");

      jest.restoreAllMocks();
    });

    it("should not create timing if node was not started", () => {
      const { endExecution, getTiming } = useExecutionTimeStore.getState();

      endExecution("workflow1", "node1", "completed");

      const timing = getTiming("workflow1", "node1");
      expect(timing).toBeUndefined();
    });
  });

  describe("getDuration", () => {
    it("should return undefined for non-existent timing", () => {
      const { getDuration } = useExecutionTimeStore.getState();

      const duration = getDuration("workflow1", "nonexistent");
      expect(duration).toBeUndefined();
    });

    it("should return undefined for incomplete timing", () => {
      const { startExecution, getDuration } = useExecutionTimeStore.getState();

      startExecution("workflow1", "node1");
      const duration = getDuration("workflow1", "node1");

      expect(duration).toBeUndefined();
    });

    it("should return correct duration for completed execution", () => {
      const { startExecution, endExecution, getDuration } = useExecutionTimeStore.getState();

      startExecution("workflow1", "node1");
      const startTime = Date.now();
      jest.spyOn(Date, "now").mockImplementation(() => startTime + 2500);
      endExecution("workflow1", "node1", "completed");

      const duration = getDuration("workflow1", "node1");
      expect(duration).toBe(2500);

      jest.restoreAllMocks();
    });
  });

  describe("getNodeHistory", () => {
    it("should return empty array for node with no history", () => {
      const { getNodeHistory } = useExecutionTimeStore.getState();

      const history = getNodeHistory("nonexistent");
      expect(history).toEqual([]);
    });

    it("should return all history for a node", () => {
      const { startExecution, endExecution, getNodeHistory } = useExecutionTimeStore.getState();

      const now = Date.now();
      jest.spyOn(Date, "now").mockImplementation(() => now);

      startExecution("workflow1", "node1");
      endExecution("workflow1", "node1", "completed", "text", "Text");

      jest.spyOn(Date, "now").mockImplementation(() => now + 1000);
      startExecution("workflow1", "node1");
      endExecution("workflow1", "node1", "completed", "text", "Text");

      const history = getNodeHistory("node1");
      expect(history.length).toBe(2);

      jest.restoreAllMocks();
    });
  });

  describe("getWorkflowHistory", () => {
    it("should return history for specific workflow", () => {
      const { startExecution, endExecution, getWorkflowHistory } = useExecutionTimeStore.getState();

      const now = Date.now();
      jest.spyOn(Date, "now").mockImplementation(() => now);

      startExecution("workflow1", "node1");
      endExecution("workflow1", "node1", "completed", "text", "Text");

      startExecution("workflow2", "node1");
      endExecution("workflow2", "node1", "completed", "image", "Image");

      const w1History = getWorkflowHistory("workflow1");
      const w2History = getWorkflowHistory("workflow2");

      expect(w1History.length).toBe(1);
      expect(w1History[0].nodeType).toBe("text");
      expect(w2History.length).toBe(1);
      expect(w2History[0].nodeType).toBe("image");

      jest.restoreAllMocks();
    });
  });

  describe("getPerformanceSummary", () => {
    it("should return null for workflow with no history", () => {
      const { getPerformanceSummary } = useExecutionTimeStore.getState();

      const summary = getPerformanceSummary("workflow1");
      expect(summary).toBeNull();
    });

    it("should return correct performance summary", () => {
      const { startExecution, endExecution, getPerformanceSummary } = useExecutionTimeStore.getState();

      const baseTime = Date.now();

      startExecution("workflow1", "node1");
      const endTime1 = baseTime + 500;
      jest.spyOn(Date, "now").mockReturnValue(endTime1);
      endExecution("workflow1", "node1", "completed", "text", "Text Node");

      startExecution("workflow1", "node2");
      const endTime2 = baseTime + 1000;
      jest.spyOn(Date, "now").mockReturnValue(endTime2);
      endExecution("workflow1", "node2", "completed", "image", "Image Node");

      startExecution("workflow1", "node3");
      const endTime3 = baseTime + 1500;
      jest.spyOn(Date, "now").mockReturnValue(endTime3);
      endExecution("workflow1", "node3", "error", "audio", "Audio Node");

      const summary = getPerformanceSummary("workflow1");
      expect(summary).toBeDefined();
      expect(summary!.workflowId).toBe("workflow1");
      expect(summary!.nodeCount).toBe(3);
      expect(summary!.completedCount).toBe(2);
      expect(summary!.errorCount).toBe(1);
      expect(summary!.averageDuration).toBe(500);

      jest.restoreAllMocks();
    });

    it("should identify slowest and fastest nodes", () => {
      const { startExecution, endExecution, getPerformanceSummary } = useExecutionTimeStore.getState();

      const baseTime = Date.now();

      startExecution("workflow1", "slow");
      const slowEndTime = baseTime + 10000;
      jest.spyOn(Date, "now").mockReturnValue(slowEndTime);
      endExecution("workflow1", "slow", "completed", "llm", "Slow Node");

      startExecution("workflow1", "fast");
      const fastEndTime = baseTime + 500;
      jest.spyOn(Date, "now").mockReturnValue(fastEndTime);
      endExecution("workflow1", "fast", "completed", "constant", "Fast Node");

      const summary = getPerformanceSummary("workflow1");
      expect(summary!.slowestNode!.nodeId).toBe("slow");
      expect(summary!.fastestNode!.nodeId).toBe("fast");

      jest.restoreAllMocks();
    });
  });

  describe("getAggregatedStats", () => {
    it("should return aggregated statistics", () => {
      const { startExecution, endExecution, getAggregatedStats } = useExecutionTimeStore.getState();

      const now = Date.now();
      jest.spyOn(Date, "now").mockImplementation(() => now);

      startExecution("workflow1", "node1");
      endExecution("workflow1", "node1", "completed", "text", "Text");

      startExecution("workflow1", "node2");
      endExecution("workflow1", "node2", "completed", "image", "Image");

      jest.spyOn(Date, "now").mockImplementation(() => now + 2000);
      startExecution("workflow2", "node1");
      endExecution("workflow2", "node1", "error", "text", "Text");

      const stats = getAggregatedStats();
      expect(stats.totalRuns).toBe(2);
      expect(stats.totalNodesExecuted).toBe(2);
      expect(stats.errorRate).toBeCloseTo(33.33, 1);

      jest.restoreAllMocks();
    });

    it("should identify frequent bottlenecks", () => {
      const { startExecution, endExecution, getAggregatedStats } = useExecutionTimeStore.getState();

      const now = Date.now();
      jest.spyOn(Date, "now").mockImplementation(() => now);

      for (let i = 0; i < 3; i++) {
        startExecution("workflow1", `node${i}`);
        jest.spyOn(Date, "now").mockImplementation(() => now + 2000 * (i + 1));
        endExecution("workflow1", `node${i}`, "completed", "llm", "LLM Node");
      }

      const stats = getAggregatedStats();
      const bottlenecks = Array.from(stats.frequentBottlenecks.entries());
      expect(bottlenecks.length).toBe(1);
      expect(bottlenecks[0][0]).toBe("llm");
      expect(bottlenecks[0][1].count).toBe(3);

      jest.restoreAllMocks();
    });
  });

  describe("clearTimings", () => {
    it("should clear timings for a specific workflow", () => {
      const { startExecution, endExecution, clearTimings, getTiming } = useExecutionTimeStore.getState();

      startExecution("workflow1", "node1");
      startExecution("workflow2", "node1");

      const now = Date.now();
      jest.spyOn(Date, "now").mockImplementation(() => now);
      endExecution("workflow1", "node1", "completed");

      clearTimings("workflow1");

      expect(getTiming("workflow1", "node1")).toBeUndefined();
      expect(getTiming("workflow2", "node1")).toBeDefined();

      jest.restoreAllMocks();
    });

    it("should not affect other workflows when clearing", () => {
      const { startExecution, clearTimings, getTiming } = useExecutionTimeStore.getState();

      startExecution("workflow1", "node1");
      startExecution("workflow2", "node1");

      clearTimings("workflow1");

      expect(getTiming("workflow1", "node1")).toBeUndefined();
      expect(getTiming("workflow2", "node1")).toBeDefined();
    });
  });

  describe("clearHistory", () => {
    it("should clear all history", () => {
      const { startExecution, endExecution, clearHistory, getWorkflowHistory } = useExecutionTimeStore.getState();

      const now = Date.now();
      jest.spyOn(Date, "now").mockImplementation(() => now);

      startExecution("workflow1", "node1");
      endExecution("workflow1", "node1", "completed", "text", "Text");

      expect(getWorkflowHistory("workflow1").length).toBe(1);

      clearHistory();

      expect(getWorkflowHistory("workflow1").length).toBe(0);

      jest.restoreAllMocks();
    });
  });
});
