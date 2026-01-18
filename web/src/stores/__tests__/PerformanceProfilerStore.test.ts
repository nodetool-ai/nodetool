import usePerformanceProfilerStore, {
  PerformanceProfile,
  NodePerformanceMetrics
} from "../PerformanceProfilerStore";

describe("PerformanceProfilerStore", () => {
  beforeEach(() => {
    usePerformanceProfilerStore.setState({
      currentProfile: null,
      historicalProfiles: [],
      isAnalyzing: false,
      lastAnalysisTime: null
    });
  });

  const createMockProfile = (overrides: Partial<PerformanceProfile> = {}): PerformanceProfile => ({
    workflowId: "test-workflow",
    totalDuration: 5000,
    nodeCount: 5,
    completedNodes: 4,
    failedNodes: 1,
    nodes: [
      {
        nodeId: "node-1",
        nodeType: "nodetool.llm.LLM",
        nodeName: "LLM Node",
        duration: 3000,
        status: "completed",
        isParallelizable: true
      },
      {
        nodeId: "node-2",
        nodeType: "nodetool.image.ImageGeneration",
        nodeName: "Image Node",
        duration: 2000,
        status: "completed",
        isParallelizable: true
      }
    ],
    bottlenecks: [],
    parallelismScore: 75,
    timestamp: Date.now(),
    ...overrides
  });

  describe("setProfile", () => {
    it("should set the current profile", () => {
      const mockProfile = createMockProfile();
      usePerformanceProfilerStore.getState().setProfile(mockProfile);

      const state = usePerformanceProfilerStore.getState();
      expect(state.currentProfile).toEqual(mockProfile);
      expect(state.lastAnalysisTime).not.toBeNull();
    });

    it("should update existing profile", () => {
      const profile1 = createMockProfile({ workflowId: "workflow-1", totalDuration: 1000 });
      const profile2 = createMockProfile({ workflowId: "workflow-1", totalDuration: 2000 });

      usePerformanceProfilerStore.getState().setProfile(profile1);
      usePerformanceProfilerStore.getState().setProfile(profile2);

      expect(usePerformanceProfilerStore.getState().currentProfile?.totalDuration).toBe(2000);
    });
  });

  describe("addHistoricalProfile", () => {
    it("should add profile to historical list", () => {
      const mockProfile = createMockProfile();
      usePerformanceProfilerStore.getState().addHistoricalProfile(mockProfile);

      const state = usePerformanceProfilerStore.getState();
      expect(state.historicalProfiles).toHaveLength(1);
      expect(state.historicalProfiles[0]).toEqual(mockProfile);
    });

    it("should maintain most recent profiles first", () => {
      const profile1 = createMockProfile({ workflowId: "workflow-1", timestamp: 1000 });
      const profile2 = createMockProfile({ workflowId: "workflow-1", timestamp: 2000 });
      const profile3 = createMockProfile({ workflowId: "workflow-1", timestamp: 3000 });

      usePerformanceProfilerStore.getState().addHistoricalProfile(profile1);
      usePerformanceProfilerStore.getState().addHistoricalProfile(profile2);
      usePerformanceProfilerStore.getState().addHistoricalProfile(profile3);

      const state = usePerformanceProfilerStore.getState();
      expect(state.historicalProfiles).toHaveLength(3);
      expect(state.historicalProfiles[0].timestamp).toBe(3000);
      expect(state.historicalProfiles[2].timestamp).toBe(1000);
    });

    it("should limit historical profiles to 20", () => {
      for (let i = 0; i < 25; i++) {
        usePerformanceProfilerStore.getState().addHistoricalProfile(
          createMockProfile({ workflowId: `workflow-${i}`, timestamp: i })
        );
      }

      const state = usePerformanceProfilerStore.getState();
      expect(state.historicalProfiles).toHaveLength(20);
    });
  });

  describe("clearProfiles", () => {
    it("should clear all profiles when no workflowId provided", () => {
      usePerformanceProfilerStore.getState().setProfile(createMockProfile());
      usePerformanceProfilerStore.getState().addHistoricalProfile(createMockProfile());
      usePerformanceProfilerStore.getState().clearProfiles();

      const state = usePerformanceProfilerStore.getState();
      expect(state.currentProfile).toBeNull();
      expect(state.historicalProfiles).toHaveLength(0);
    });

    it("should clear profiles for specific workflow", () => {
      const profile1 = createMockProfile({ workflowId: "workflow-1" });
      const profile2 = createMockProfile({ workflowId: "workflow-2" });
      const profile3 = createMockProfile({ workflowId: "workflow-1" });

      usePerformanceProfilerStore.getState().setProfile(profile1);
      usePerformanceProfilerStore.getState().addHistoricalProfile(profile2);
      usePerformanceProfilerStore.getState().addHistoricalProfile(profile3);
      usePerformanceProfilerStore.getState().clearProfiles("workflow-1");

      const state = usePerformanceProfilerStore.getState();
      expect(state.currentProfile).toBeNull();
      expect(state.historicalProfiles).toHaveLength(1);
      expect(state.historicalProfiles[0].workflowId).toBe("workflow-2");
    });
  });

  describe("setAnalyzing", () => {
    it("should set analyzing state", () => {
      expect(usePerformanceProfilerStore.getState().isAnalyzing).toBe(false);

      usePerformanceProfilerStore.getState().setAnalyzing(true);
      expect(usePerformanceProfilerStore.getState().isAnalyzing).toBe(true);

      usePerformanceProfilerStore.getState().setAnalyzing(false);
      expect(usePerformanceProfilerStore.getState().isAnalyzing).toBe(false);
    });
  });

  describe("getBottleneckCount", () => {
    it("should return 0 when no profile", () => {
      expect(usePerformanceProfilerStore.getState().getBottleneckCount()).toBe(0);
    });

    it("should return bottleneck count from profile", () => {
      const profile = createMockProfile({
        bottlenecks: [
          { nodeId: "node-1", nodeType: "test", nodeName: "Test", duration: 1000, status: "completed", isParallelizable: false },
          { nodeId: "node-2", nodeType: "test", nodeName: "Test", duration: 2000, status: "completed", isParallelizable: false }
        ]
      });
      usePerformanceProfilerStore.getState().setProfile(profile);

      expect(usePerformanceProfilerStore.getState().getBottleneckCount()).toBe(2);
    });
  });

  describe("getTotalPotentialSavings", () => {
    it("should return 0 when no profile", () => {
      expect(usePerformanceProfilerStore.getState().getTotalPotentialSavings()).toBe(0);
    });

    it("should calculate potential savings from parallelizable bottlenecks", () => {
      const profile = createMockProfile({
        bottlenecks: [
          {
            nodeId: "node-1",
            nodeType: "nodetool.llm.LLM",
            nodeName: "Test",
            duration: 1000,
            status: "completed",
            isParallelizable: true
          },
          {
            nodeId: "node-2",
            nodeType: "nodetool.image.ImageGeneration",
            nodeName: "Test",
            duration: 2000,
            status: "completed",
            isParallelizable: true
          },
          {
            nodeId: "node-3",
            nodeType: "nodetool.text.TextProcessing",
            nodeName: "Test",
            duration: 1500,
            status: "completed",
            isParallelizable: false
          }
        ]
      });
      usePerformanceProfilerStore.getState().setProfile(profile);

      expect(usePerformanceProfilerStore.getState().getTotalPotentialSavings()).toBe(2100);
    });
  });
});
