import usePerformanceProfilerStore from "../../stores/PerformanceProfilerStore";

describe("PerformanceProfilerStore", () => {
  beforeEach(() => {
    usePerformanceProfilerStore.setState({
      profiles: {},
      isProfiling: false,
      currentWorkflowId: null
    });
  });

  describe("startProfiling", () => {
    it("creates a new profile for the workflow", () => {
      const workflowId = "workflow-1";
      const workflowName = "Test Workflow";

      usePerformanceProfilerStore.getState().startProfiling(workflowId, workflowName);

      const profile = usePerformanceProfilerStore.getState().profiles[workflowId];
      expect(profile).toBeDefined();
      expect(profile?.workflowId).toBe(workflowId);
      expect(profile?.workflowName).toBe(workflowName);
      expect(usePerformanceProfilerStore.getState().isProfiling).toBe(true);
      expect(usePerformanceProfilerStore.getState().currentWorkflowId).toBe(workflowId);
    });
  });

  describe("stopProfiling", () => {
    it("stops profiling and calculates total duration", () => {
      const workflowId = "workflow-1";
      usePerformanceProfilerStore.getState().startProfiling(workflowId, "Test");
      
      usePerformanceProfilerStore.getState().stopProfiling();

      expect(usePerformanceProfilerStore.getState().isProfiling).toBe(false);
      expect(usePerformanceProfilerStore.getState().currentWorkflowId).toBeNull();
    });

    it("handles stop when not profiling", () => {
      usePerformanceProfilerStore.getState().stopProfiling();

      expect(usePerformanceProfilerStore.getState().isProfiling).toBe(false);
    });
  });

  describe("recordNodeExecution", () => {
    it("records execution metrics for a node", () => {
      const workflowId = "workflow-1";
      usePerformanceProfilerStore.getState().startProfiling(workflowId, "Test");

      usePerformanceProfilerStore.getState().recordNodeExecution(
        workflowId,
        "node-1",
        "nodetool.llm.LLM",
        "LLM Node",
        5000
      );

      const profile = usePerformanceProfilerStore.getState().profiles[workflowId];
      const metrics = profile?.nodeMetrics["node-1"];
      
      expect(metrics).toBeDefined();
      expect(metrics?.duration).toBe(5000);
      expect(metrics?.calls).toBe(1);
      expect(metrics?.avgDuration).toBe(5000);
    });

    it("accumulates multiple executions", () => {
      const workflowId = "workflow-1";
      usePerformanceProfilerStore.getState().startProfiling(workflowId, "Test");

      usePerformanceProfilerStore.getState().recordNodeExecution(
        workflowId,
        "node-1",
        "nodetool.llm.LLM",
        "LLM Node",
        3000
      );

      usePerformanceProfilerStore.getState().recordNodeExecution(
        workflowId,
        "node-1",
        "nodetool.llm.LLM",
        "LLM Node",
        5000
      );

      const metrics = usePerformanceProfilerStore.getState().profiles[workflowId]?.nodeMetrics["node-1"];
      expect(metrics?.duration).toBe(8000);
      expect(metrics?.calls).toBe(2);
      expect(metrics?.avgDuration).toBe(4000);
    });

    it("ignores recordings when not profiling", () => {
      usePerformanceProfilerStore.getState().recordNodeExecution(
        "workflow-1",
        "node-1",
        "nodetool.llm.LLM",
        "LLM Node",
        5000
      );

      const profile = usePerformanceProfilerStore.getState().profiles["workflow-1"];
      expect(profile).toBeUndefined();
    });

    it("ignores recordings for different workflow", () => {
      usePerformanceProfilerStore.getState().startProfiling("workflow-1", "Test");

      usePerformanceProfilerStore.getState().recordNodeExecution(
        "workflow-2",
        "node-1",
        "nodetool.llm.LLM",
        "LLM Node",
        5000
      );

      const profile = usePerformanceProfilerStore.getState().profiles["workflow-2"];
      expect(profile).toBeUndefined();
    });
  });

  describe("getProfile", () => {
    it("returns the profile for a workflow", () => {
      const workflowId = "workflow-1";
      usePerformanceProfilerStore.getState().startProfiling(workflowId, "Test");

      const profile = usePerformanceProfilerStore.getState().getProfile(workflowId);
      expect(profile).toBeDefined();
      expect(profile?.workflowId).toBe(workflowId);
    });

    it("returns undefined for non-existent workflow", () => {
      const profile = usePerformanceProfilerStore.getState().getProfile("non-existent");
      expect(profile).toBeUndefined();
    });
  });

  describe("getBottlenecks", () => {
    it("identifies nodes with high duration", () => {
      const workflowId = "workflow-1";
      usePerformanceProfilerStore.getState().startProfiling(workflowId, "Test");

      usePerformanceProfilerStore.getState().recordNodeExecution(
        workflowId,
        "node-1",
        "nodetool.llm.LLM",
        "LLM Node",
        10000
      );

      usePerformanceProfilerStore.getState().recordNodeExecution(
        workflowId,
        "node-2",
        "nodetool.input.StringInput",
        "String Input",
        100
      );

      const bottlenecks = usePerformanceProfilerStore.getState().getBottlenecks(workflowId);
      expect(bottlenecks.length).toBe(1);
      expect(bottlenecks[0].nodeId).toBe("node-1");
    });

    it("returns empty array when no profile", () => {
      const bottlenecks = usePerformanceProfilerStore.getState().getBottlenecks("non-existent");
      expect(bottlenecks).toEqual([]);
    });
  });

  describe("clearProfile", () => {
    it("removes the profile for a workflow", () => {
      const workflowId = "workflow-1";
      usePerformanceProfilerStore.getState().startProfiling(workflowId, "Test");

      usePerformanceProfilerStore.getState().clearProfile(workflowId);

      expect(usePerformanceProfilerStore.getState().profiles[workflowId]).toBeUndefined();
    });
  });

  describe("clearAllProfiles", () => {
    it("removes all profiles", () => {
      usePerformanceProfilerStore.getState().startProfiling("workflow-1", "Test 1");
      usePerformanceProfilerStore.getState().startProfiling("workflow-2", "Test 2");

      usePerformanceProfilerStore.getState().clearAllProfiles();

      expect(Object.keys(usePerformanceProfilerStore.getState().profiles)).toHaveLength(0);
      expect(usePerformanceProfilerStore.getState().isProfiling).toBe(false);
    });
  });
});
