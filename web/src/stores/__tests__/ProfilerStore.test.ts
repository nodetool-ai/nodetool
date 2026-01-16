import useProfilerStore, {
  type WorkflowPerformanceProfile,
  type NodePerformanceMetrics
} from "../ProfilerStore";

describe("ProfilerStore", () => {
  beforeEach(() => {
    useProfilerStore.setState({
      profiles: {},
      currentProfileId: null,
      isProfiling: false,
      profileHistory: []
    });
  });

  describe("startProfiling", () => {
    it("should create a new profile for the workflow", () => {
      const { startProfiling, getProfile } = useProfilerStore.getState();

      startProfiling("workflow1", "Test Workflow", 5);

      const profile = getProfile("workflow1");
      expect(profile).toBeDefined();
      expect(profile!.workflowName).toBe("Test Workflow");
      expect(profile!.nodeCount).toBe(5);
      expect(profile!.completedNodes).toBe(0);
      expect(profile!.failedNodes).toBe(0);
      expect(useProfilerStore.getState().isProfiling).toBe(true);
    });

    it("should set currentProfileId to the workflow", () => {
      const { startProfiling } = useProfilerStore.getState();

      startProfiling("workflow1", "Test Workflow", 5);

      expect(useProfilerStore.getState().currentProfileId).toBe("workflow1");
    });

    it("should allow multiple workflows", () => {
      const { startProfiling, getProfile } = useProfilerStore.getState();

      startProfiling("workflow1", "Workflow 1", 3);
      startProfiling("workflow2", "Workflow 2", 4);

      const profile1 = getProfile("workflow1");
      const profile2 = getProfile("workflow2");

      expect(profile1).toBeDefined();
      expect(profile2).toBeDefined();
      expect(profile1!.workflowName).toBe("Workflow 1");
      expect(profile2!.workflowName).toBe("Workflow 2");
    });
  });

  describe("recordNodeStart", () => {
    it("should record node execution start", () => {
      const { startProfiling, recordNodeStart, getProfile } = useProfilerStore.getState();

      startProfiling("workflow1", "Test Workflow", 5);
      recordNodeStart("workflow1", "node1", "nodetool.input.StringInput", "string_input");

      const profile = getProfile("workflow1");
      expect(profile!.nodes["node1"]).toBeDefined();
      expect(profile!.nodes["node1"].nodeType).toBe("nodetool.input.StringInput");
      expect(profile!.nodes["node1"].status).toBe("running");
    });

    it("should handle multiple nodes", () => {
      const { startProfiling, recordNodeStart, getProfile } = useProfilerStore.getState();

      startProfiling("workflow1", "Test Workflow", 5);
      recordNodeStart("workflow1", "node1", "nodetool.input.StringInput", "input1");
      recordNodeStart("workflow1", "node2", "nodetool.process.LLM", "llm1");

      const profile = getProfile("workflow1");
      expect(Object.keys(profile!.nodes)).toHaveLength(2);
    });
  });

  describe("recordNodeEnd", () => {
    it("should record node execution end with duration", () => {
      const { startProfiling, recordNodeStart, recordNodeEnd, getProfile } = useProfilerStore.getState();

      startProfiling("workflow1", "Test Workflow", 5);
      recordNodeStart("workflow1", "node1", "nodetool.input.StringInput", "input1");
      recordNodeEnd("workflow1", "node1", true, 1500);

      const profile = getProfile("workflow1");
      expect(profile!.nodes["node1"].status).toBe("completed");
      expect(profile!.nodes["node1"].totalDuration).toBe(1500);
      expect(profile!.nodes["node1"].averageDuration).toBe(1500);
      expect(profile!.nodes["node1"].executionCount).toBe(1);
      expect(profile!.completedNodes).toBe(1);
    });

    it("should record failed node execution", () => {
      const { startProfiling, recordNodeStart, recordNodeEnd, getProfile } = useProfilerStore.getState();

      startProfiling("workflow1", "Test Workflow", 5);
      recordNodeStart("workflow1", "node1", "nodetool.input.StringInput", "input1");
      recordNodeEnd("workflow1", "node1", false, 500);

      const profile = getProfile("workflow1");
      expect(profile!.nodes["node1"].status).toBe("failed");
      expect(profile!.failedNodes).toBe(1);
    });

    it("should update metrics on multiple executions", () => {
      const { startProfiling, recordNodeStart, recordNodeEnd, getProfile } = useProfilerStore.getState();

      startProfiling("workflow1", "Test Workflow", 5);

      recordNodeStart("workflow1", "node1", "nodetool.process.LLM", "llm1");
      recordNodeEnd("workflow1", "node1", true, 2000);

      recordNodeStart("workflow1", "node1", "nodetool.process.LLM", "llm1");
      recordNodeEnd("workflow1", "node1", true, 3000);

      const profile = getProfile("workflow1");
      expect(profile!.nodes["node1"].executionCount).toBe(2);
      expect(profile!.nodes["node1"].totalDuration).toBe(5000);
      expect(profile!.nodes["node1"].averageDuration).toBe(2500);
      expect(profile!.nodes["node1"].minDuration).toBe(2000);
      expect(profile!.nodes["node1"].maxDuration).toBe(3000);
      expect(profile!.nodes["node1"].lastDuration).toBe(3000);
    });
  });

  describe("stopProfiling", () => {
    it("should finalize profile when stopping", () => {
      const { startProfiling, recordNodeStart, recordNodeEnd, stopProfiling, getProfile } = useProfilerStore.getState();

      const startTime = Date.now();
      startProfiling("workflow1", "Test Workflow", 3);
      recordNodeStart("workflow1", "node1", "nodetool.input.StringInput", "input1");
      recordNodeEnd("workflow1", "node1", true, 1000);

      const endTime = startTime + 5000;
      jest.spyOn(Date, "now").mockReturnValue(endTime);

      stopProfiling("workflow1");

      const profile = getProfile("workflow1");
      expect(profile!.endTime).toBe(endTime);
      expect(profile!.totalDuration).toBe(5000);
      expect(useProfilerStore.getState().isProfiling).toBe(false);

      jest.restoreAllMocks();
    });

    it("should analyze bottlenecks when stopping", () => {
      const { startProfiling, recordNodeStart, recordNodeEnd, stopProfiling, getProfile } = useProfilerStore.getState();

      startProfiling("workflow1", "Test Workflow", 3);

      recordNodeStart("workflow1", "node1", "nodetool.input.StringInput", "input1");
      recordNodeEnd("workflow1", "node1", true, 100);

      recordNodeStart("workflow1", "node2", "nodetool.process.LLM", "llm1");
      recordNodeEnd("workflow1", "node2", true, 10000);

      recordNodeStart("workflow1", "node3", "nodetool.output.TextOutput", "output1");
      recordNodeEnd("workflow1", "node3", true, 50);

      stopProfiling("workflow1");

      const profile = getProfile("workflow1");
      expect(profile!.bottlenecks.length).toBeGreaterThan(0);
      expect(profile!.bottlenecks).toContain("node2");
    });
  });

  describe("analyzeBottlenecks", () => {
    it("should identify nodes taking more than 10% of total time", () => {
      const { startProfiling, recordNodeStart, recordNodeEnd, analyzeBottlenecks } = useProfilerStore.getState();

      startProfiling("workflow1", "Test Workflow", 3);

      recordNodeStart("workflow1", "node1", "nodetool.input.StringInput", "input1");
      recordNodeEnd("workflow1", "node1", true, 100);

      recordNodeStart("workflow1", "node2", "nodetool.process.LLM", "llm1");
      recordNodeEnd("workflow1", "node2", true, 2000);

      recordNodeStart("workflow1", "node3", "nodetool.output.TextOutput", "output1");
      recordNodeEnd("workflow1", "node3", true, 50);

      const bottlenecks = analyzeBottlenecks("workflow1");

      expect(bottlenecks).toContain("node2");
      expect(bottlenecks).not.toContain("node1");
      expect(bottlenecks).not.toContain("node3");
    });

    it("should exclude input nodes from bottleneck analysis", () => {
      const { startProfiling, recordNodeStart, recordNodeEnd, analyzeBottlenecks } = useProfilerStore.getState();

      startProfiling("workflow1", "Test Workflow", 2);

      recordNodeStart("workflow1", "node1", "nodetool.input.StringInput", "input1");
      recordNodeEnd("workflow1", "node1", true, 3000);

      recordNodeStart("workflow1", "node2", "nodetool.output.TextOutput", "output1");
      recordNodeEnd("workflow1", "node2", true, 100);

      const bottlenecks = analyzeBottlenecks("workflow1");

      expect(bottlenecks).not.toContain("node1");
    });
  });

  describe("getEfficiencyScore", () => {
    it("should calculate efficiency score based on success rate and duration", () => {
      const { startProfiling, recordNodeStart, recordNodeEnd, getEfficiencyScore } = useProfilerStore.getState();

      startProfiling("workflow1", "Test Workflow", 2);

      recordNodeStart("workflow1", "node1", "nodetool.input.StringInput", "input1");
      recordNodeEnd("workflow1", "node1", true, 100);

      recordNodeStart("workflow1", "node2", "nodetool.output.TextOutput", "output1");
      recordNodeEnd("workflow1", "node2", true, 100);

      const score = getEfficiencyScore("workflow1");

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("should return lower score for failed nodes", () => {
      const { startProfiling, recordNodeStart, recordNodeEnd, getEfficiencyScore } = useProfilerStore.getState();

      startProfiling("workflow1", "Test Workflow", 2);

      recordNodeStart("workflow1", "node1", "nodetool.input.StringInput", "input1");
      recordNodeEnd("workflow1", "node1", true, 100);

      recordNodeStart("workflow1", "node2", "nodetool.output.TextOutput", "output1");
      recordNodeEnd("workflow1", "node2", false, 50);

      const score = getEfficiencyScore("workflow1");

      expect(score).toBeLessThan(100);
    });
  });

  describe("clearProfile", () => {
    it("should remove a specific profile", () => {
      const { startProfiling, clearProfile, getProfile } = useProfilerStore.getState();

      startProfiling("workflow1", "Workflow 1", 3);
      startProfiling("workflow2", "Workflow 2", 4);

      clearProfile("workflow1");

      expect(getProfile("workflow1")).toBeUndefined();
      expect(getProfile("workflow2")).toBeDefined();
    });
  });

  describe("clearAllProfiles", () => {
    it("should remove all profiles", () => {
      const { startProfiling, clearAllProfiles, getProfile } = useProfilerStore.getState();

      startProfiling("workflow1", "Workflow 1", 3);
      startProfiling("workflow2", "Workflow 2", 4);

      clearAllProfiles();

      expect(getProfile("workflow1")).toBeUndefined();
      expect(getProfile("workflow2")).toBeUndefined();
      expect(useProfilerStore.getState().profileHistory).toHaveLength(0);
    });
  });

  describe("getCurrentProfile", () => {
    it("should return current profile when profiling", () => {
      const { startProfiling, getCurrentProfile } = useProfilerStore.getState();

      startProfiling("workflow1", "Test Workflow", 5);

      const current = getCurrentProfile();
      expect(current).toBeDefined();
      expect(current!.workflowId).toBe("workflow1");
    });

    it("should return undefined when not profiling", () => {
      const { getCurrentProfile } = useProfilerStore.getState();

      const current = getCurrentProfile();
      expect(current).toBeUndefined();
    });
  });
});
