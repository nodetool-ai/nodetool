import useWorkflowStatsStore from "../WorkflowStatsStore";

describe("WorkflowStatsStore", () => {
  beforeEach(() => {
    useWorkflowStatsStore.setState({ stats: {} });
  });

  describe("recordExecution", () => {
    it("should record first execution for a workflow", () => {
      const { recordExecution, getStats } = useWorkflowStatsStore.getState();

      recordExecution("workflow1", 5000);

      const stats = getStats("workflow1");
      expect(stats.runCount).toBe(1);
      expect(stats.totalExecutionDuration).toBe(5000);
      expect(stats.averageExecutionDuration).toBe(5000);
      expect(stats.lastExecutionTime).toBeDefined();
      expect(stats.lastExecutionTime).toBeGreaterThan(0);
    });

    it("should accumulate multiple executions for a workflow", () => {
      const { recordExecution, getStats } = useWorkflowStatsStore.getState();

      recordExecution("workflow1", 5000);
      recordExecution("workflow1", 3000);
      recordExecution("workflow1", 7000);

      const stats = getStats("workflow1");
      expect(stats.runCount).toBe(3);
      expect(stats.totalExecutionDuration).toBe(15000);
      expect(stats.averageExecutionDuration).toBe(5000);
    });

    it("should handle zero duration executions", () => {
      const { recordExecution, getStats } = useWorkflowStatsStore.getState();

      recordExecution("workflow1", 0);

      const stats = getStats("workflow1");
      expect(stats.runCount).toBe(1);
      expect(stats.totalExecutionDuration).toBe(0);
      expect(stats.averageExecutionDuration).toBe(0);
    });

    it("should track stats for multiple workflows independently", () => {
      const { recordExecution, getStats } = useWorkflowStatsStore.getState();

      recordExecution("workflow1", 5000);
      recordExecution("workflow2", 3000);
      recordExecution("workflow1", 2000);

      expect(getStats("workflow1").runCount).toBe(2);
      expect(getStats("workflow1").totalExecutionDuration).toBe(7000);
      expect(getStats("workflow2").runCount).toBe(1);
      expect(getStats("workflow2").totalExecutionDuration).toBe(3000);
    });

    it("should update lastExecutionTime on each execution", () => {
      const { recordExecution, getStats } = useWorkflowStatsStore.getState();

      const firstTime = Date.now();
      jest.spyOn(Date, "now").mockImplementation(() => firstTime);
      recordExecution("workflow1", 5000);

      const secondTime = firstTime + 10000;
      jest.spyOn(Date, "now").mockImplementation(() => secondTime);
      recordExecution("workflow1", 3000);

      const stats = getStats("workflow1");
      expect(stats.lastExecutionTime).toBe(secondTime);

      jest.restoreAllMocks();
    });
  });

  describe("getStats", () => {
    it("should return empty stats for non-existent workflow", () => {
      const { getStats } = useWorkflowStatsStore.getState();

      const stats = getStats("nonexistent");
      expect(stats.runCount).toBe(0);
      expect(stats.totalExecutionDuration).toBe(0);
      expect(stats.averageExecutionDuration).toBeUndefined();
      expect(stats.lastExecutionTime).toBeUndefined();
    });

    it("should return stats for existing workflow", () => {
      const { recordExecution, getStats } = useWorkflowStatsStore.getState();

      recordExecution("workflow1", 5000);

      const stats = getStats("workflow1");
      expect(stats.runCount).toBe(1);
      expect(stats.totalExecutionDuration).toBe(5000);
      expect(stats.averageExecutionDuration).toBe(5000);
      expect(stats.lastExecutionTime).toBeDefined();
    });
  });

  describe("resetStats", () => {
    it("should reset stats for a specific workflow", () => {
      const { recordExecution, resetStats, getStats } = useWorkflowStatsStore.getState();

      recordExecution("workflow1", 5000);
      recordExecution("workflow2", 3000);

      resetStats("workflow1");

      expect(getStats("workflow1").runCount).toBe(0);
      expect(getStats("workflow1").totalExecutionDuration).toBe(0);
      expect(getStats("workflow2").runCount).toBe(1);
      expect(getStats("workflow2").totalExecutionDuration).toBe(3000);
    });

    it("should clear lastExecutionTime and averageExecutionDuration on reset", () => {
      const { recordExecution, resetStats, getStats } = useWorkflowStatsStore.getState();

      recordExecution("workflow1", 5000);

      resetStats("workflow1");

      const stats = getStats("workflow1");
      expect(stats.runCount).toBe(0);
      expect(stats.totalExecutionDuration).toBe(0);
      expect(stats.averageExecutionDuration).toBeUndefined();
      expect(stats.lastExecutionTime).toBeUndefined();
    });
  });

  describe("clearAllStats", () => {
    it("should clear all workflow stats", () => {
      const { recordExecution, clearAllStats, getStats } = useWorkflowStatsStore.getState();

      recordExecution("workflow1", 5000);
      recordExecution("workflow2", 3000);
      recordExecution("workflow3", 7000);

      clearAllStats();

      expect(getStats("workflow1").runCount).toBe(0);
      expect(getStats("workflow2").runCount).toBe(0);
      expect(getStats("workflow3").runCount).toBe(0);
    });
  });
});
