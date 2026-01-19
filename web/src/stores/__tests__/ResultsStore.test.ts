import useResultsStore from "../ResultsStore";

describe("ResultsStore", () => {
  beforeEach(() => {
    useResultsStore.setState({
      results: {},
      outputResults: {},
      progress: {},
      chunks: {},
      tasks: {},
      toolCalls: {},
      edges: {},
      planningUpdates: {},
      previews: {},
    });
  });

  describe("initial state", () => {
    it("should have correct initial values", () => {
      const state = useResultsStore.getState();

      expect(state.results).toEqual({});
      expect(state.outputResults).toEqual({});
      expect(state.progress).toEqual({});
      expect(state.chunks).toEqual({});
      expect(state.tasks).toEqual({});
      expect(state.toolCalls).toEqual({});
      expect(state.edges).toEqual({});
      expect(state.planningUpdates).toEqual({});
      expect(state.previews).toEqual({});
    });
  });

  describe("setResult", () => {
    it("should set result for a node with workflow ID", () => {
      const { setResult } = useResultsStore.getState();
      const mockResult = { output: "test output" };
      setResult("workflow-1", "node-1", mockResult);

      expect(useResultsStore.getState().results["workflow-1:node-1"]).toEqual(mockResult);
    });

    it("should overwrite existing result", () => {
      const { setResult } = useResultsStore.getState();
      setResult("workflow-1", "node-1", { output: "first" });
      setResult("workflow-1", "node-1", { output: "second" });

      expect(useResultsStore.getState().results["workflow-1:node-1"].output).toBe("second");
    });

    it("should handle complex result objects", () => {
      const { setResult } = useResultsStore.getState();
      const complexResult = {
        output: "text",
        data: [1, 2, 3],
        metadata: { size: 100 },
      };
      setResult("workflow-1", "node-1", complexResult);

      expect(useResultsStore.getState().results["workflow-1:node-1"]).toEqual(complexResult);
    });

    it("should handle null results", () => {
      const { setResult } = useResultsStore.getState();
      setResult("workflow-1", "node-1", null);

      expect(useResultsStore.getState().results["workflow-1:node-1"]).toBeNull();
    });
  });

  describe("getResult", () => {
    it("should get result for node", () => {
      const { setResult, getResult } = useResultsStore.getState();
      setResult("workflow-1", "node-1", { output: "test" });

      expect(getResult("workflow-1", "node-1")).toEqual({ output: "test" });
    });

    it("should return undefined for non-existent node", () => {
      const { getResult } = useResultsStore.getState();

      expect(getResult("workflow-1", "non-existent")).toBeUndefined();
    });
  });

  describe("deleteResult", () => {
    it("should remove result for a node", () => {
      const { setResult, deleteResult } = useResultsStore.getState();
      setResult("workflow-1", "node-1", { output: "test" });
      deleteResult("workflow-1", "node-1");

      expect(useResultsStore.getState().results["workflow-1:node-1"]).toBeUndefined();
    });
  });

  describe("clearResults", () => {
    it("should clear all results for a workflow", () => {
      const { setResult, clearResults } = useResultsStore.getState();
      setResult("workflow-1", "node-1", { output: "test1" });
      setResult("workflow-1", "node-2", { output: "test2" });
      setResult("workflow-2", "node-1", { output: "test3" });
      clearResults("workflow-1");

      const state = useResultsStore.getState();
      expect(state.results["workflow-1:node-1"]).toBeUndefined();
      expect(state.results["workflow-1:node-2"]).toBeUndefined();
      expect(state.results["workflow-2:node-1"]).toEqual({ output: "test3" });
    });
  });

  describe("addChunk and getChunk", () => {
    it("should add chunk for streaming results", () => {
      const { addChunk, getChunk } = useResultsStore.getState();
      addChunk("workflow-1", "node-1", "Hello");

      expect(getChunk("workflow-1", "node-1")).toBe("Hello");
    });

    it("should accumulate multiple chunks", () => {
      const { addChunk, getChunk } = useResultsStore.getState();
      addChunk("workflow-1", "node-1", "Hello");
      addChunk("workflow-1", "node-1", " ");
      addChunk("workflow-1", "node-1", "World");

      expect(getChunk("workflow-1", "node-1")).toBe("Hello World");
    });
  });

  describe("setEdge and getEdge", () => {
    it("should set edge status", () => {
      const { setEdge, getEdge } = useResultsStore.getState();
      setEdge("workflow-1", "edge-1", "completed", 5);

      expect(getEdge("workflow-1", "edge-1")).toEqual({ status: "completed", counter: 5 });
    });

    it("should update edge status", () => {
      const { setEdge, getEdge } = useResultsStore.getState();
      setEdge("workflow-1", "edge-1", "pending");
      setEdge("workflow-1", "edge-1", "completed", 10);

      expect(getEdge("workflow-1", "edge-1")).toEqual({ status: "completed", counter: 10 });
    });
  });

  describe("setPreview and getPreview", () => {
    it("should set preview result", () => {
      const { setPreview, getPreview } = useResultsStore.getState();
      setPreview("workflow-1", "node-1", { uri: "data:image/png;base64,abc123" });

      expect(getPreview("workflow-1", "node-1")).toEqual({ uri: "data:image/png;base64,abc123" });
    });

    it("should update preview result", () => {
      const { setPreview, getPreview } = useResultsStore.getState();
      setPreview("workflow-1", "node-1", { uri: "data:image/png;base64,first" });
      setPreview("workflow-1", "node-1", { uri: "data:image/png;base64,second" });

      expect(getPreview("workflow-1", "node-1").uri).toBe("data:image/png;base64,second");
    });
  });

  describe("setProgress and getProgress", () => {
    it("should set progress for a node", () => {
      const { setProgress, getProgress } = useResultsStore.getState();
      setProgress("workflow-1", "node-1", 50, 100, "Processing...");

      expect(getProgress("workflow-1", "node-1")).toEqual({ progress: 50, total: 100, chunk: "Processing..." });
    });

    it("should update progress", () => {
      const { setProgress, getProgress } = useResultsStore.getState();
      setProgress("workflow-1", "node-1", 25, 100);
      setProgress("workflow-1", "node-1", 50, 100);

      const progress = getProgress("workflow-1", "node-1");
      expect(progress?.progress).toBe(50);
    });
  });

  describe("state isolation", () => {
    it("should maintain independent state between operations", () => {
      const { setResult, setProgress, setPreview } = useResultsStore.getState();

      setResult("workflow-1", "node-1", { output: "result" });
      setProgress("workflow-1", "node-1", 50, 100);
      setPreview("workflow-1", "node-1", { uri: "data:image/png;base64,test" });

      const state = useResultsStore.getState();
      const progress = state.progress["workflow-1:node-1"];
      expect(state.results["workflow-1:node-1"]).toEqual({ output: "result" });
      expect(progress.progress).toBe(50);
      expect(progress.total).toBe(100);
      expect(state.previews["workflow-1:node-1"]).toEqual({ uri: "data:image/png;base64,test" });
    });

    it("should handle multiple workflows independently", () => {
      const { setResult, clearResults } = useResultsStore.getState();

      setResult("workflow-1", "node-1", { output: "result1" });
      setResult("workflow-2", "node-1", { output: "result2" });

      clearResults("workflow-1");

      expect(useResultsStore.getState().results["workflow-1:node-1"]).toBeUndefined();
      expect(useResultsStore.getState().results["workflow-2:node-1"]).toEqual({ output: "result2" });
    });
  });
});
