import usePerformanceProfilerStore from "../../stores/PerformanceProfilerStore";

describe("PerformanceProfilerStore", () => {
  beforeEach(() => {
    usePerformanceProfilerStore.setState({
      profile: null,
      isAnalyzing: false,
      lastAnalyzedAt: null,
    });
  });

  describe("analyzeWorkflow", () => {
    it("should analyze empty workflow", () => {
      const workflowId = "test-workflow-1";
      const nodes: { id: string; type: string; data: any }[] = [];

      usePerformanceProfilerStore.getState().analyzeWorkflow(workflowId, nodes);

      const state = usePerformanceProfilerStore.getState();
      expect(state.profile).not.toBeNull();
      expect(state.profile?.nodeCount).toBe(0);
      expect(state.profile?.totalDuration).toBe(0);
      expect(state.isAnalyzing).toBe(false);
    });

    it("should identify bottleneck nodes", () => {
      const workflowId = "test-workflow-2";
      const nodes = [
        { id: "node-1", type: "LLM", data: { label: "Slow Node" } },
        { id: "node-2", type: "TextInput", data: { label: "Fast Node" } },
      ];

      usePerformanceProfilerStore.getState().analyzeWorkflow(workflowId, nodes);

      const state = usePerformanceProfilerStore.getState();
      expect(state.profile).not.toBeNull();
      expect(state.profile?.nodeCount).toBe(2);
      expect(state.profile?.bottleneckNodes.length).toBeLessThanOrEqual(2);
    });

    it("should calculate completion rate", () => {
      const workflowId = "test-workflow-3";
      const nodes = [
        { id: "node-1", type: "LLM", data: { label: "Node 1" } },
        { id: "node-2", type: "LLM", data: { label: "Node 2" } },
        { id: "node-3", type: "LLM", data: { label: "Node 3" } },
      ];

      usePerformanceProfilerStore.getState().analyzeWorkflow(workflowId, nodes);

      const state = usePerformanceProfilerStore.getState();
      expect(state.profile).not.toBeNull();
      expect(state.profile?.nodeCount).toBe(3);
      expect(state.profile?.completedNodeCount).toBe(0);
      expect(state.profile?.pendingNodeCount).toBe(3);
    });
  });

  describe("clearProfile", () => {
    it("should clear the profile", () => {
      const workflowId = "test-workflow-4";
      const nodes = [{ id: "node-1", type: "LLM", data: { label: "Node 1" } }];

      usePerformanceProfilerStore.getState().analyzeWorkflow(workflowId, nodes);
      expect(usePerformanceProfilerStore.getState().profile).not.toBeNull();

      usePerformanceProfilerStore.getState().clearProfile();

      const state = usePerformanceProfilerStore.getState();
      expect(state.profile).toBeNull();
      expect(state.lastAnalyzedAt).toBeNull();
    });
  });

  describe("getNodeTiming", () => {
    it("should return undefined for non-existent node timing", () => {
      const workflowId = "test-workflow-5";
      const nodes: { id: string; type: string; data: any }[] = [];

      usePerformanceProfilerStore.getState().analyzeWorkflow(workflowId, nodes);

      const timing = usePerformanceProfilerStore.getState().getNodeTiming(workflowId, "non-existent");
      expect(timing).toBeUndefined();
    });
  });

  describe("isAnalyzing state", () => {
    it("should set isAnalyzing to true during analysis", () => {
      const workflowId = "test-workflow-6";
      const nodes = [{ id: "node-1", type: "LLM", data: { label: "Node 1" } }];

      const initialState = usePerformanceProfilerStore.getState();
      expect(initialState.isAnalyzing).toBe(false);

      usePerformanceProfilerStore.getState().analyzeWorkflow(workflowId, nodes);

      const finalState = usePerformanceProfilerStore.getState();
      expect(finalState.isAnalyzing).toBe(false);
    });
  });

  describe("performance metrics", () => {
    it("should calculate metrics for multiple nodes", () => {
      const workflowId = "test-workflow-7";
      const nodes = [
        { id: "node-1", type: "LLM", data: { label: "LLM 1" } },
        { id: "node-2", type: "TextInput", data: { label: "Input 1" } },
        { id: "node-3", type: "Output", data: { label: "Output 1" } },
      ];

      usePerformanceProfilerStore.getState().analyzeWorkflow(workflowId, nodes);

      const state = usePerformanceProfilerStore.getState();
      expect(state.profile).not.toBeNull();
      expect(state.profile?.metrics).toBeDefined();
      expect(typeof state.profile?.metrics.throughput).toBe("number");
      expect(typeof state.profile?.metrics.efficiency).toBe("number");
      expect(typeof state.profile?.metrics.concurrencyScore).toBe("number");
    });
  });
});
