import usePerformanceProfilerStore from "../PerformanceProfilerStore";

describe("PerformanceProfilerStore", () => {
  beforeEach(() => {
    usePerformanceProfilerStore.setState({ profiles: {}, currentRunTimings: {}, isProfiling: false });
  });

  describe("startProfiling", () => {
    it("should start profiling for a workflow", () => {
      usePerformanceProfilerStore.getState().startProfiling("workflow-1");
      expect(usePerformanceProfilerStore.getState().isProfiling).toBe(true);
      expect(usePerformanceProfilerStore.getState().currentRunTimings).toEqual({});
    });
  });

  describe("endProfiling", () => {
    it("should create a new profile with timing data", () => {
      const workflowId = "workflow-1";
      const workflowName = "Test Workflow";
      const totalDuration = 5000;
      const nodeTimings = {
        "node-1": 1000,
        "node-2": 2000,
        "node-3": 2000
      };
      const nodeTypes = {
        "node-1": { type: "text", label: "Text Input" },
        "node-2": { type: "llm", label: "LLM" },
        "node-3": { type: "output", label: "Output" }
      };

      usePerformanceProfilerStore.getState().endProfiling(
        workflowId,
        workflowName,
        totalDuration,
        nodeTimings,
        nodeTypes
      );

      const profile = usePerformanceProfilerStore.getState().getProfile(workflowId);
      expect(profile).toBeDefined();
      expect(profile?.workflowId).toBe(workflowId);
      expect(profile?.workflowName).toBe(workflowName);
      expect(profile?.totalDuration).toBe(totalDuration);
      expect(profile?.runCount).toBe(1);
      expect(Object.keys(profile?.nodeData || {})).toHaveLength(3);
    });

    it("should accumulate timing data across multiple runs", () => {
      const workflowId = "workflow-1";
      const workflowName = "Test Workflow";
      const nodeTypes = { "node-1": { type: "llm", label: "LLM" } };

      usePerformanceProfilerStore.getState().endProfiling(
        workflowId,
        workflowName,
        5000,
        { "node-1": 1000 },
        nodeTypes
      );

      usePerformanceProfilerStore.getState().endProfiling(
        workflowId,
        workflowName,
        4000,
        { "node-1": 800 },
        nodeTypes
      );

      const profile = usePerformanceProfilerStore.getState().getProfile(workflowId);
      expect(profile?.runCount).toBe(2);
      expect(profile?.nodeData["node-1"].executionCount).toBe(2);
      expect(profile?.nodeData["node-1"].durations).toHaveLength(2);
      expect(profile?.nodeData["node-1"].avgDuration).toBe(900);
    });

    it("should limit history to last 20 runs per node", () => {
      const workflowId = "workflow-1";
      const workflowName = "Test Workflow";
      const nodeTypes = { "node-1": { type: "llm", label: "LLM" } };

      for (let i = 0; i < 25; i++) {
        usePerformanceProfilerStore.getState().endProfiling(
          workflowId,
          workflowName,
          5000,
          { "node-1": 1000 + i * 10 },
          nodeTypes
        );
      }

      const profile = usePerformanceProfilerStore.getState().getProfile(workflowId);
      expect(profile?.nodeData["node-1"].durations).toHaveLength(20);
    });

    it("should identify bottlenecks as slowest nodes", () => {
      const workflowId = "workflow-1";
      const workflowName = "Test Workflow";
      const nodeTypes = {
        "fast-node": { type: "input", label: "Fast Node" },
        "slow-node": { type: "llm", label: "Slow Node" },
        "medium-node": { type: "transform", label: "Medium Node" }
      };

      usePerformanceProfilerStore.getState().endProfiling(
        workflowId,
        workflowName,
        10000,
        {
          "fast-node": 100,
          "slow-node": 8000,
          "medium-node": 1900
        },
        nodeTypes
      );

      const profile = usePerformanceProfilerStore.getState().getProfile(workflowId);
      expect(profile?.bottlenecks).toContain("slow-node");
      expect(profile?.bottlenecks).toHaveLength(3);
    });
  });

  describe("getNodeStats", () => {
    it("should return node statistics for a specific node", () => {
      const workflowId = "workflow-1";
      const nodeTypes = { "node-1": { type: "llm", label: "LLM" } };

      usePerformanceProfilerStore.getState().endProfiling(
        workflowId,
        "Test",
        5000,
        { "node-1": 2000 },
        nodeTypes
      );

      const stats = usePerformanceProfilerStore.getState().getNodeStats(workflowId, "node-1");
      expect(stats).toBeDefined();
      expect(stats?.avgDuration).toBe(2000);
      expect(stats?.executionCount).toBe(1);
    });

    it("should return undefined for non-existent node", () => {
      const stats = usePerformanceProfilerStore.getState().getNodeStats("workflow-1", "non-existent");
      expect(stats).toBeUndefined();
    });
  });

  describe("compareWithPrevious", () => {
    it("should return null for workflow with no previous runs", () => {
      const comparison = usePerformanceProfilerStore.getState().compareWithPrevious(
        "new-workflow",
        { "node-1": 1000 }
      );
      expect(comparison).toBeNull();
    });

    it("should identify faster nodes", () => {
      const workflowId = "workflow-1";
      const nodeTypes = { "node-1": { type: "llm", label: "LLM" } };

      usePerformanceProfilerStore.getState().endProfiling(
        workflowId,
        "Test",
        5000,
        { "node-1": 2000 },
        nodeTypes
      );

      const comparison = usePerformanceProfilerStore.getState().compareWithPrevious(
        workflowId,
        { "node-1": 1500 }
      );

      expect(comparison).not.toBeNull();
      expect(comparison?.fasterNodes).toHaveLength(1);
      expect(comparison?.fasterNodes[0].nodeId).toBe("node-1");
    });

    it("should identify slower nodes", () => {
      const workflowId = "workflow-1";
      const nodeTypes = { "node-1": { type: "llm", label: "LLM" } };

      usePerformanceProfilerStore.getState().endProfiling(
        workflowId,
        "Test",
        5000,
        { "node-1": 1000 },
        nodeTypes
      );

      const comparison = usePerformanceProfilerStore.getState().compareWithPrevious(
        workflowId,
        { "node-1": 2000 }
      );

      expect(comparison).not.toBeNull();
      expect(comparison?.slowerNodes).toHaveLength(1);
      expect(comparison?.slowerNodes[0].nodeId).toBe("node-1");
    });

    it("should calculate total time change correctly", () => {
      const workflowId = "workflow-1";
      const nodeTypes = {
        "node-1": { type: "llm", label: "LLM" },
        "node-2": { type: "output", label: "Output" }
      };

      usePerformanceProfilerStore.getState().endProfiling(
        workflowId,
        "Test",
        5000,
        { "node-1": 2000, "node-2": 1000 },
        nodeTypes
      );

      const comparison = usePerformanceProfilerStore.getState().compareWithPrevious(
        workflowId,
        { "node-1": 3000, "node-2": 1000 }
      );

      expect(comparison?.totalTimeChange).toBe(1000);
      expect(comparison?.percentChange).toBeCloseTo(33.33, 2);
    });
  });

  describe("clearProfile", () => {
    it("should remove profile for a workflow", () => {
      usePerformanceProfilerStore.getState().endProfiling(
        "workflow-1",
        "Test",
        5000,
        { "node-1": 1000 },
        { "node-1": { type: "llm", label: "LLM" } }
      );

      expect(usePerformanceProfilerStore.getState().getProfile("workflow-1")).toBeDefined();

      usePerformanceProfilerStore.getState().clearProfile("workflow-1");

      expect(usePerformanceProfilerStore.getState().getProfile("workflow-1")).toBeUndefined();
    });
  });

  describe("clearAllProfiles", () => {
    it("should remove all profiles", () => {
      usePerformanceProfilerStore.getState().endProfiling(
        "workflow-1",
        "Test 1",
        5000,
        { "node-1": 1000 },
        { "node-1": { type: "llm", label: "LLM" } }
      );
      usePerformanceProfilerStore.getState().endProfiling(
        "workflow-2",
        "Test 2",
        6000,
        { "node-2": 2000 },
        { "node-2": { type: "llm", label: "LLM" } }
      );

      expect(usePerformanceProfilerStore.getState().getAllProfiles()).toHaveLength(2);

      usePerformanceProfilerStore.getState().clearAllProfiles();

      expect(usePerformanceProfilerStore.getState().getAllProfiles()).toHaveLength(0);
    });
  });

  describe("getAllProfiles", () => {
    it("should return all profiles sorted by timestamp", () => {
      usePerformanceProfilerStore.getState().endProfiling(
        "workflow-1",
        "Test 1",
        5000,
        { "node-1": 1000 },
        { "node-1": { type: "llm", label: "LLM" } }
      );

      jest.useFakeTimers();
      jest.advanceTimersByTime(10);

      usePerformanceProfilerStore.getState().endProfiling(
        "workflow-2",
        "Test 2",
        6000,
        { "node-2": 2000 },
        { "node-2": { type: "llm", label: "LLM" } }
      );

      jest.useRealTimers();

      const profiles = usePerformanceProfilerStore.getState().getAllProfiles();
      expect(profiles).toHaveLength(2);
      expect(profiles[0].workflowId).toBe("workflow-2");
      expect(profiles[1].workflowId).toBe("workflow-1");
    });
  });
});
