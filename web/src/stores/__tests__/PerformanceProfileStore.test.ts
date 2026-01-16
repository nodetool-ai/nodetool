import usePerformanceProfileStore, {
  WorkflowProfile,
  NodeProfile
} from "../PerformanceProfileStore";

describe("PerformanceProfileStore", () => {
  beforeEach(() => {
    usePerformanceProfileStore.setState({ profiles: {}, currentProfile: null, insights: null });
  });

  describe("startProfile", () => {
    it("should create a new profile for a workflow", () => {
      const { startProfile, profiles } = usePerformanceProfileStore.getState();
      startProfile("wf-1", "Test Workflow");

      const state = usePerformanceProfileStore.getState();
      expect(state.profiles["wf-1"]).toBeDefined();
      expect(state.profiles["wf-1"].workflowName).toBe("Test Workflow");
      expect(state.profiles["wf-1"].status).toBe("running");
      expect(state.currentProfile?.workflowId).toBe("wf-1");
    });

    it("should allow multiple profiles for different workflows", () => {
      const { startProfile } = usePerformanceProfileStore.getState();
      startProfile("wf-1", "Workflow 1");
      startProfile("wf-2", "Workflow 2");

      const { profiles } = usePerformanceProfileStore.getState();
      expect(Object.keys(profiles)).toHaveLength(2);
      expect(profiles["wf-1"].workflowName).toBe("Workflow 1");
      expect(profiles["wf-2"].workflowName).toBe("Workflow 2");
    });
  });

  describe("updateNodeProfile", () => {
    beforeEach(() => {
      const { startProfile } = usePerformanceProfileStore.getState();
      startProfile("wf-1", "Test Workflow");
    });

    it("should add a new node profile", () => {
      const { updateNodeProfile, profiles } = usePerformanceProfileStore.getState();
      updateNodeProfile("wf-1", "node-1", "text", "Text Node", 1500, "completed");

      const state = usePerformanceProfileStore.getState();
      const profile = state.profiles["wf-1"];
      expect(profile.nodes).toHaveLength(1);
      expect(profile.nodes[0].nodeId).toBe("node-1");
      expect(profile.nodes[0].duration).toBe(1500);
      expect(profile.executedNodes).toBe(1);
    });

    it("should update an existing node profile", () => {
      const { updateNodeProfile } = usePerformanceProfileStore.getState();
      updateNodeProfile("wf-1", "node-1", "text", "Text Node", 1500, "completed");
      updateNodeProfile("wf-1", "node-1", "text", "Text Node", 2000, "completed");

      const state = usePerformanceProfileStore.getState();
      const profile = state.profiles["wf-1"];
      expect(profile.nodes).toHaveLength(1);
      expect(profile.nodes[0].duration).toBe(2000);
    });

    it("should track bottlenecks correctly", () => {
      const { updateNodeProfile } = usePerformanceProfileStore.getState();
      updateNodeProfile("wf-1", "fast-1", "text", "Fast Node", 100, "completed");
      updateNodeProfile("wf-1", "slow-1", "model", "Slow Node", 5000, "completed");
      updateNodeProfile("wf-1", "medium-1", "image", "Medium Node", 1500, "completed");

      const state = usePerformanceProfileStore.getState();
      const profile = state.profiles["wf-1"];
      expect(profile.bottlenecks).toHaveLength(3);
      expect(profile.bottlenecks[0].nodeId).toBe("slow-1");
      expect(profile.bottlenecks[0].duration).toBe(5000);
    });

    it("should calculate total duration correctly", () => {
      const { updateNodeProfile } = usePerformanceProfileStore.getState();
      updateNodeProfile("wf-1", "node-1", "text", "Node 1", 1000, "completed");
      updateNodeProfile("wf-1", "node-2", "text", "Node 2", 2000, "completed");
      updateNodeProfile("wf-1", "node-3", "text", "Node 3", 3000, "completed");

      const state = usePerformanceProfileStore.getState();
      const profile = state.profiles["wf-1"];
      expect(profile.totalDuration).toBe(6000);
    });
  });

  describe("endProfile", () => {
    beforeEach(() => {
      const { startProfile, updateNodeProfile } = usePerformanceProfileStore.getState();
      startProfile("wf-1", "Test Workflow");
      updateNodeProfile("wf-1", "node-1", "text", "Node 1", 1000, "completed");
      updateNodeProfile("wf-1", "node-2", "model", "Node 2", 3000, "completed");
    });

    it("should mark profile as completed", () => {
      const { endProfile } = usePerformanceProfileStore.getState();
      endProfile("wf-1");

      const state = usePerformanceProfileStore.getState();
      const profile = state.profiles["wf-1"];
      expect(profile.status).toBe("completed");
    });

    it("should update currentProfile", () => {
      const { endProfile } = usePerformanceProfileStore.getState();
      endProfile("wf-1");

      const state = usePerformanceProfileStore.getState();
      expect(state.currentProfile?.workflowId).toBe("wf-1");
      expect(state.currentProfile?.status).toBe("completed");
    });
  });

  describe("getInsights", () => {
    beforeEach(() => {
      const { startProfile, updateNodeProfile } = usePerformanceProfileStore.getState();
      startProfile("wf-1", "Test Workflow");
      updateNodeProfile("wf-1", "node-1", "text", "Fast Node", 100, "completed");
      updateNodeProfile("wf-1", "node-2", "model", "Slow Model Node", 5000, "completed");
      updateNodeProfile("wf-1", "node-3", "image", "Medium Node", 800, "completed");
    });

    it("should calculate total duration", () => {
      const { getInsights } = usePerformanceProfileStore.getState();
      const insights = getInsights("wf-1");

      expect(insights.totalDuration).toBe(5900);
    });

    it("should identify slowest node", () => {
      const { getInsights } = usePerformanceProfileStore.getState();
      const insights = getInsights("wf-1");

      expect(insights.slowestNode).not.toBeNull();
      expect(insights.slowestNode?.nodeId).toBe("node-2");
    });

    it("should identify fastest node", () => {
      const { getInsights } = usePerformanceProfileStore.getState();
      const insights = getInsights("wf-1");

      expect(insights.fastestNode).not.toBeNull();
      expect(insights.fastestNode?.nodeId).toBe("node-1");
    });

    it("should generate recommendations for slow nodes", () => {
      const { getInsights } = usePerformanceProfileStore.getState();
      const insights = getInsights("wf-1");

      expect(insights.recommendations.length).toBeGreaterThan(0);
      expect(typeof insights.recommendations[0]).toBe("string");
      expect(insights.recommendations[0].length).toBeGreaterThan(0);
    });
  });

  describe("getProfile", () => {
    it("should return undefined for non-existent workflow", () => {
      const { getProfile } = usePerformanceProfileStore.getState();
      expect(getProfile("non-existent")).toBeUndefined();
    });

    it("should return profile for existing workflow", () => {
      const { startProfile, getProfile } = usePerformanceProfileStore.getState();
      startProfile("wf-1", "Test Workflow");

      const profile = getProfile("wf-1");
      expect(profile).toBeDefined();
      expect(profile?.workflowId).toBe("wf-1");
    });
  });

  describe("clearProfile", () => {
    it("should remove a profile", () => {
      const { startProfile, clearProfile } = usePerformanceProfileStore.getState();
      startProfile("wf-1", "Test Workflow");
      clearProfile("wf-1");

      const state = usePerformanceProfileStore.getState();
      expect(state.profiles["wf-1"]).toBeUndefined();
    });
  });
});
