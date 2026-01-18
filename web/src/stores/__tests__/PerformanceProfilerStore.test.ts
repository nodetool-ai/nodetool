import usePerformanceProfilerStore from "../PerformanceProfilerStore";

describe("PerformanceProfilerStore", () => {
  beforeEach(() => {
    usePerformanceProfilerStore.setState({
      snapshots: [],
      currentRun: null,
      isRecording: false
    });
  });

  describe("startRecording", () => {
    it("should start recording a new workflow run", () => {
      usePerformanceProfilerStore.getState().startRecording("workflow-123");

      const state = usePerformanceProfilerStore.getState();
      expect(state.isRecording).toBe(true);
      expect(state.currentRun).not.toBeNull();
      expect(state.currentRun?.workflowId).toBe("workflow-123");
      expect(state.currentRun?.runId).toMatch(/^run_\d+_[a-z0-9]+$/);
    });

    it("should reset current run when starting a new recording", () => {
      usePerformanceProfilerStore.getState().startRecording("workflow-1");
      usePerformanceProfilerStore.getState().recordNodeStart("node-1", "TextInput", "Input");

      usePerformanceProfilerStore.getState().startRecording("workflow-2");

      const state = usePerformanceProfilerStore.getState();
      expect(state.currentRun?.workflowId).toBe("workflow-2");
      expect(state.currentRun?.nodePerformances).toHaveLength(0);
    });
  });

  describe("recordNodeStart", () => {
    it("should record node start time", () => {
      usePerformanceProfilerStore.getState().startRecording("workflow-123");
      usePerformanceProfilerStore
        .getState()
        .recordNodeStart("node-1", "TextInput", "Text Input");

      const state = usePerformanceProfilerStore.getState();
      expect(state.currentRun?.nodeCount).toBe(1);
      expect(state.currentRun?.nodePerformances).toHaveLength(1);
      expect(state.currentRun?.nodePerformances[0]).toMatchObject({
        nodeId: "node-1",
        nodeType: "TextInput",
        nodeName: "Text Input",
        status: "skipped"
      });
    });

    it("should not duplicate nodes with same ID", () => {
      usePerformanceProfilerStore.getState().startRecording("workflow-123");
      usePerformanceProfilerStore
        .getState()
        .recordNodeStart("node-1", "TextInput", "Input 1");
      usePerformanceProfilerStore
        .getState()
        .recordNodeStart("node-1", "TextInput", "Input 1");

      const state = usePerformanceProfilerStore.getState();
      expect(state.currentRun?.nodePerformances).toHaveLength(1);
    });
  });

  describe("recordNodeComplete", () => {
    it("should record node completion with duration", () => {
      usePerformanceProfilerStore.getState().startRecording("workflow-123");
      usePerformanceProfilerStore
        .getState()
        .recordNodeStart("node-1", "TextInput", "Text Input");
      usePerformanceProfilerStore.getState().recordNodeComplete(
        "node-1",
        1500,
        50.5,
        "completed"
      );

      const state = usePerformanceProfilerStore.getState();
      const nodePerf = state.currentRun?.nodePerformances[0];
      expect(nodePerf?.executionTimeMs).toBe(1500);
      expect(nodePerf?.memoryUsageMb).toBe(50.5);
      expect(nodePerf?.status).toBe("completed");
      expect(state.currentRun?.completedNodes).toBe(1);
    });

    it("should record failed nodes", () => {
      usePerformanceProfilerStore.getState().startRecording("workflow-123");
      usePerformanceProfilerStore
        .getState()
        .recordNodeStart("node-1", "LLM", "Language Model");
      usePerformanceProfilerStore
        .getState()
        .recordNodeComplete("node-1", 500, undefined, "failed", "API error");

      const state = usePerformanceProfilerStore.getState();
      expect(state.currentRun?.failedNodes).toBe(1);
      expect(state.currentRun?.nodePerformances[0]?.errorMessage).toBe("API error");
    });
  });

  describe("finishRecording", () => {
    it("should create a snapshot when recording finishes", () => {
      usePerformanceProfilerStore.getState().startRecording("workflow-123");

      const startTime = Date.now();
      usePerformanceProfilerStore
        .getState()
        .recordNodeStart("node-1", "TextInput", "Text Input");
      usePerformanceProfilerStore.getState().recordNodeComplete("node-1", 500);

      usePerformanceProfilerStore.getState().recordNodeStart("node-2", "LLM", "LLM");
      usePerformanceProfilerStore.getState().recordNodeComplete("node-2", 2000);

      usePerformanceProfilerStore.getState().finishRecording();

      const state = usePerformanceProfilerStore.getState();
      expect(state.isRecording).toBe(false);
      expect(state.currentRun).toBeNull();
      expect(state.snapshots).toHaveLength(1);

      const snapshot = state.snapshots[0];
      expect(snapshot.workflowId).toBe("workflow-123");
      expect(snapshot.durationMs).toBeGreaterThanOrEqual(0);
      expect(snapshot.nodeCount).toBe(2);
      expect(snapshot.status).toBe("success");
      expect(snapshot.topBottlenecks).toHaveLength(2);
    });

    it("should mark snapshot as failed when nodes fail", () => {
      usePerformanceProfilerStore.getState().startRecording("workflow-123");

      usePerformanceProfilerStore
        .getState()
        .recordNodeStart("node-1", "TextInput", "Text Input");
      usePerformanceProfilerStore.getState().recordNodeComplete("node-1", 500, undefined, "completed");

      usePerformanceProfilerStore
        .getState()
        .recordNodeStart("node-2", "LLM", "LLM");
      usePerformanceProfilerStore
        .getState()
        .recordNodeComplete("node-2", 1000, undefined, "failed", "Error");

      usePerformanceProfilerStore.getState().finishRecording();

      const snapshot = usePerformanceProfilerStore.getState().snapshots[0];
      expect(snapshot.status).toBe("failed");
    });
  });

  describe("cancelRecording", () => {
    it("should cancel recording without creating snapshot", () => {
      usePerformanceProfilerStore.getState().startRecording("workflow-123");
      usePerformanceProfilerStore
        .getState()
        .recordNodeStart("node-1", "TextInput", "Text Input");

      usePerformanceProfilerStore.getState().cancelRecording();

      const state = usePerformanceProfilerStore.getState();
      expect(state.isRecording).toBe(false);
      expect(state.currentRun).toBeNull();
      expect(state.snapshots).toHaveLength(0);
    });
  });

  describe("getSnapshots", () => {
    it("should return snapshots for specific workflow", () => {
      usePerformanceProfilerStore.getState().startRecording("workflow-1");
      usePerformanceProfilerStore.getState().finishRecording();

      usePerformanceProfilerStore.getState().startRecording("workflow-2");
      usePerformanceProfilerStore.getState().finishRecording();

      usePerformanceProfilerStore.getState().startRecording("workflow-1");
      usePerformanceProfilerStore.getState().finishRecording();

      const workflow1Snapshots = usePerformanceProfilerStore
        .getState()
        .getSnapshots("workflow-1");
      const workflow2Snapshots = usePerformanceProfilerStore
        .getState()
        .getSnapshots("workflow-2");

      expect(workflow1Snapshots).toHaveLength(2);
      expect(workflow2Snapshots).toHaveLength(1);
    });
  });

  describe("clearSnapshots", () => {
    it("should clear snapshots for specific workflow", () => {
      usePerformanceProfilerStore.getState().startRecording("workflow-1");
      usePerformanceProfilerStore.getState().finishRecording();

      usePerformanceProfilerStore.getState().startRecording("workflow-2");
      usePerformanceProfilerStore.getState().finishRecording();

      usePerformanceProfilerStore.getState().clearSnapshots("workflow-1");

      const state = usePerformanceProfilerStore.getState();
      expect(state.snapshots).toHaveLength(1);
      expect(state.snapshots[0].workflowId).toBe("workflow-2");
    });

    it("should clear all snapshots when no workflowId provided", () => {
      usePerformanceProfilerStore.getState().startRecording("workflow-1");
      usePerformanceProfilerStore.getState().finishRecording();

      usePerformanceProfilerStore.getState().startRecording("workflow-2");
      usePerformanceProfilerStore.getState().finishRecording();

      usePerformanceProfilerStore.getState().clearSnapshots();

      expect(usePerformanceProfilerStore.getState().snapshots).toHaveLength(0);
    });
  });
});
