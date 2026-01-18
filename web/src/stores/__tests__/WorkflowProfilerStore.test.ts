import useWorkflowProfilerStore from "../WorkflowProfilerStore";

describe("WorkflowProfilerStore", () => {
  beforeEach(() => {
    useWorkflowProfilerStore.setState({
      sessions: {},
      currentSession: null,
      isProfiling: false,
      showHeatmap: false,
      heatmapMode: "duration"
    });
  });

  describe("startProfiling", () => {
    it("should start a new profiling session", () => {
      const store = useWorkflowProfilerStore;
      store.getState().startProfiling("workflow-1");

      const state = store.getState();
      expect(state.currentSession).not.toBeNull();
      expect(state.currentSession?.workflowId).toBe("workflow-1");
      expect(state.isProfiling).toBe(true);
    });

    it("should generate unique session IDs", () => {
      const store = useWorkflowProfilerStore;
      store.getState().startProfiling("workflow-1");
      const firstSessionId = store.getState().currentSession?.id;

      store.getState().startProfiling("workflow-2");
      const secondSessionId = store.getState().currentSession?.id;

      expect(firstSessionId).not.toBe(secondSessionId);
    });
  });

  describe("endProfiling", () => {
    it("should complete profiling session with timing data", () => {
      const store = useWorkflowProfilerStore;
      store.getState().startProfiling("workflow-1");
      store.getState().endProfiling("workflow-1");

      const state = store.getState();
      expect(state.currentSession).toBeNull();
      expect(state.isProfiling).toBe(false);
    });

    it("should store session in workflow sessions", () => {
      const store = useWorkflowProfilerStore;
      store.getState().startProfiling("workflow-1");
      store.getState().endProfiling("workflow-1");

      const session = store.getState().getLatestSession("workflow-1");
      expect(session).not.toBeNull();
      expect(session?.workflowId).toBe("workflow-1");
    });
  });

  describe("getStatistics", () => {
    it("should return empty statistics for non-existent session", () => {
      const store = useWorkflowProfilerStore;
      const stats = store.getState().getStatistics("workflow-1", "non-existent");

      expect(stats.totalDuration).toBe(0);
      expect(stats.nodeCount).toBe(0);
    });
  });

  describe("heatmap controls", () => {
    it("should toggle heatmap visibility", () => {
      const store = useWorkflowProfilerStore;
      const state = store.getState();

      expect(state.showHeatmap).toBe(false);

      state.setHeatmapVisible(true);
      expect(store.getState().showHeatmap).toBe(true);

      state.setHeatmapVisible(false);
      expect(store.getState().showHeatmap).toBe(false);
    });

    it("should set heatmap mode", () => {
      const store = useWorkflowProfilerStore;
      const state = store.getState();

      expect(state.heatmapMode).toBe("duration");

      state.setHeatmapMode("relative");
      expect(store.getState().heatmapMode).toBe("relative");

      state.setHeatmapMode("category");
      expect(store.getState().heatmapMode).toBe("category");
    });
  });

  describe("clearSessions", () => {
    it("should clear all sessions for a workflow", () => {
      const store = useWorkflowProfilerStore;
      const state = store.getState();

      state.startProfiling("workflow-1");
      state.endProfiling("workflow-1");
      state.startProfiling("workflow-1");
      state.endProfiling("workflow-1");

      expect(state.getAllSessions("workflow-1").length).toBe(2);

      state.clearSessions("workflow-1");

      expect(state.getAllSessions("workflow-1").length).toBe(0);
    });
  });
});
