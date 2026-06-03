import useExecutionTimeStore from "../ExecutionTimeStore";

const JOB = "job1";

describe("ExecutionTimeStore", () => {
  beforeEach(() => {
    useExecutionTimeStore.setState({ timings: {} });
  });

  describe("startExecution", () => {
    it("should record start time for a node", () => {
      const { startExecution, getTiming } = useExecutionTimeStore.getState();

      startExecution("workflow1", JOB, "node1");

      const timing = getTiming("workflow1", JOB, "node1");
      expect(timing).toBeDefined();
      expect(timing!.startTime).toBeGreaterThan(0);
      expect(timing!.endTime).toBeUndefined();
    });

    it("should allow multiple nodes in same workflow", () => {
      const { startExecution, getTiming } = useExecutionTimeStore.getState();

      startExecution("workflow1", JOB, "node1");
      startExecution("workflow1", JOB, "node2");

      expect(getTiming("workflow1", JOB, "node1")).toBeDefined();
      expect(getTiming("workflow1", JOB, "node2")).toBeDefined();
    });

    it("should allow same node in different workflows", () => {
      const { startExecution, getTiming } = useExecutionTimeStore.getState();

      startExecution("workflow1", JOB, "node1");
      startExecution("workflow2", JOB, "node1");

      expect(getTiming("workflow1", JOB, "node1")).toBeDefined();
      expect(getTiming("workflow2", JOB, "node1")).toBeDefined();
    });

    it("should keep timings of different jobs independent", () => {
      const { startExecution, getTiming } = useExecutionTimeStore.getState();

      startExecution("workflow1", "jobA", "node1");

      expect(getTiming("workflow1", "jobA", "node1")).toBeDefined();
      expect(getTiming("workflow1", "jobB", "node1")).toBeUndefined();
    });
  });

  describe("endExecution", () => {
    it("should record end time when execution ends", () => {
      const { startExecution, endExecution, getTiming } = useExecutionTimeStore.getState();

      startExecution("workflow1", JOB, "node1");
      const startTime = getTiming("workflow1", JOB, "node1")!.startTime;

      // Simulate some time passing
      const now = Date.now();
      jest.spyOn(Date, "now").mockImplementation(() => now + 1500);

      endExecution("workflow1", JOB, "node1");

      const timing = getTiming("workflow1", JOB, "node1");
      expect(timing).toBeDefined();
      expect(timing!.startTime).toBe(startTime);
      expect(timing!.endTime).toBe(now + 1500);

      jest.restoreAllMocks();
    });

    it("should not create timing if node was not started", () => {
      const { endExecution, getTiming } = useExecutionTimeStore.getState();

      endExecution("workflow1", JOB, "node1");

      const timing = getTiming("workflow1", JOB, "node1");
      expect(timing).toBeUndefined();
    });
  });

  describe("getDuration", () => {
    it("should return undefined for non-existent timing", () => {
      const { getDuration } = useExecutionTimeStore.getState();

      const duration = getDuration("workflow1", JOB, "nonexistent");
      expect(duration).toBeUndefined();
    });

    it("should return undefined for incomplete timing", () => {
      const { startExecution, getDuration } = useExecutionTimeStore.getState();

      startExecution("workflow1", JOB, "node1");
      const duration = getDuration("workflow1", JOB, "node1");

      expect(duration).toBeUndefined();
    });

    it("should return correct duration for completed execution", () => {
      const { startExecution, endExecution, getDuration } = useExecutionTimeStore.getState();

      const startTime = Date.now();
      jest.spyOn(Date, "now").mockImplementation(() => startTime);
      startExecution("workflow1", JOB, "node1");
      jest.spyOn(Date, "now").mockImplementation(() => startTime + 2500);
      endExecution("workflow1", JOB, "node1");

      const duration = getDuration("workflow1", JOB, "node1");
      expect(duration).toBe(2500);

      jest.restoreAllMocks();
    });
  });

  describe("clearTimings", () => {
    it("should clear timings for a specific workflow", () => {
      const { startExecution, endExecution, clearTimings, getTiming } = useExecutionTimeStore.getState();

      startExecution("workflow1", JOB, "node1");
      startExecution("workflow2", JOB, "node1");

      // Use real Date.now() - don't mock
      endExecution("workflow1", JOB, "node1");

      clearTimings("workflow1");

      expect(getTiming("workflow1", JOB, "node1")).toBeUndefined();
      expect(getTiming("workflow2", JOB, "node1")).toBeDefined();
    });

    it("should clear timings across all jobs of a workflow", () => {
      const { startExecution, clearTimings, getTiming } = useExecutionTimeStore.getState();

      startExecution("workflow1", "jobA", "node1");
      startExecution("workflow1", "jobB", "node1");

      clearTimings("workflow1");

      expect(getTiming("workflow1", "jobA", "node1")).toBeUndefined();
      expect(getTiming("workflow1", "jobB", "node1")).toBeUndefined();
    });

    it("should not affect other workflows when clearing", () => {
      const { startExecution, clearTimings, getTiming } = useExecutionTimeStore.getState();

      startExecution("workflow1", JOB, "node1");
      startExecution("workflow2", JOB, "node1");

      clearTimings("workflow1");

      expect(getTiming("workflow1", JOB, "node1")).toBeUndefined();
      expect(getTiming("workflow2", JOB, "node1")).toBeDefined();
    });
  });
});
