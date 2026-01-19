import useProfilerStore from "../ProfilerStore";

describe("ProfilerStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("analyzePerformance", () => {
    it("should analyze workflow performance and return comprehensive metrics", () => {
      const nodes = [
        { id: "node-1", data: { label: "Model Node", nodeType: "nodetool.model.LLM" } },
        { id: "node-2", data: { label: "Text Output", nodeType: "nodetool.output.Text" } },
        { id: "node-3", data: { label: "Image Gen", nodeType: "nodetool.image.ImageGenerator" } },
        { id: "node-4", data: { label: "Pending Node", nodeType: "nodetool.input.Text" } }
      ];

      const result = useProfilerStore.getState().analyzePerformance("test-workflow-1", nodes);

      expect(result.workflowId).toBe("test-workflow-1");
      expect(result.nodeCount).toBe(4);
      expect(result.performanceScore).toBeGreaterThanOrEqual(0);
      expect(result.performanceScore).toBeLessThanOrEqual(100);
      expect(result.recommendations).toBeInstanceOf(Array);
      expect(result.nodeTimings).toHaveLength(4);
      expect(result.bottlenecks).toBeInstanceOf(Array);
    });

    it("should sort nodes by duration descending", () => {
      const nodes = [
        { id: "node-1", data: { label: "Node 1", nodeType: "test" } },
        { id: "node-2", data: { label: "Node 2", nodeType: "test" } }
      ];

      const result = useProfilerStore.getState().analyzePerformance("test-workflow-2", nodes);

      expect(result.nodeTimings[0].duration).toBeGreaterThanOrEqual(result.nodeTimings[1].duration);
    });

    it("should identify slowest node correctly", () => {
      const nodes = [
        { id: "node-1", data: { label: "Model Node", nodeType: "nodetool.model.LLM" } },
        { id: "node-2", data: { label: "Text Output", nodeType: "nodetool.output.Text" } }
      ];

      const result = useProfilerStore.getState().analyzePerformance("test-workflow-3", nodes);

      expect(result.slowestNode).not.toBeNull();
      expect(result.slowestNode?.nodeId).toBe("node-1");
    });

    it("should include recommendations", () => {
      const nodes = [
        { id: "node-1", data: { label: "Model Node", nodeType: "nodetool.model.LLM" } }
      ];

      const result = useProfilerStore.getState().analyzePerformance("test-workflow-4", nodes);

      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(typeof result.recommendations[0]).toBe("string");
    });

    it("should store analysis for later retrieval", () => {
      const nodes = [
        { id: "node-1", data: { label: "Node 1", nodeType: "test" } }
      ];

      useProfilerStore.getState().analyzePerformance("test-workflow-5", nodes);
      const stored = useProfilerStore.getState().getAnalysis("test-workflow-5");

      expect(stored).not.toBeUndefined();
      expect(stored?.workflowId).toBe("test-workflow-5");
    });

    it("should handle empty node list", () => {
      const result = useProfilerStore.getState().analyzePerformance("test-workflow-6", []);

      expect(result.nodeCount).toBe(0);
      expect(result.totalDuration).toBe(0);
      expect(result.performanceScore).toBe(100);
    });
  });

  describe("clearAnalysis", () => {
    it("should remove analysis from store", () => {
      const nodes = [
        { id: "node-1", data: { label: "Node 1", nodeType: "test" } }
      ];

      useProfilerStore.getState().analyzePerformance("test-workflow-7", nodes);
      expect(useProfilerStore.getState().getAnalysis("test-workflow-7")).toBeDefined();

      useProfilerStore.getState().clearAnalysis("test-workflow-7");
      expect(useProfilerStore.getState().getAnalysis("test-workflow-7")).toBeUndefined();
    });
  });

  describe("history tracking", () => {
    it("should add entries to history", () => {
      const nodes = [
        { id: "node-1", data: { label: "Node 1", nodeType: "test" } }
      ];

      useProfilerStore.getState().analyzePerformance("test-workflow-8", nodes);

      const history = useProfilerStore.getState().getHistory("test-workflow-8");
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].workflowId).toBe("test-workflow-8");
    });

    it("should limit history to 50 entries per workflow", () => {
      const nodes = [
        { id: "node-1", data: { label: "Node 1", nodeType: "test" } }
      ];

      for (let i = 0; i < 55; i++) {
        useProfilerStore.getState().analyzePerformance("test-workflow-9", nodes);
      }

      const history = useProfilerStore.getState().getHistory("test-workflow-9");
      expect(history.length).toBeLessThanOrEqual(50);
    });

    it("should return empty history for unknown workflow", () => {
      const history = useProfilerStore.getState().getHistory("nonexistent-workflow");
      expect(history).toHaveLength(0);
    });
  });

  describe("performance score calculation", () => {
    it("should calculate excellent score for fast workflows", () => {
      const nodes = Array.from({ length: 10 }, (_, i) => ({
        id: `node-${i}`,
        data: { label: `Node ${i}`, nodeType: "test" }
      }));

      const result = useProfilerStore.getState().analyzePerformance("test-workflow-10", nodes);
      expect(result.performanceScore).toBeGreaterThanOrEqual(80);
    });

    it("should not exceed 100 or go below 0", () => {
      const nodes = [
        { id: "node-1", data: { label: "Node 1", nodeType: "test" } }
      ];

      const result = useProfilerStore.getState().analyzePerformance("test-workflow-11", nodes);
      expect(result.performanceScore).toBeGreaterThanOrEqual(0);
      expect(result.performanceScore).toBeLessThanOrEqual(100);
    });
  });
});
