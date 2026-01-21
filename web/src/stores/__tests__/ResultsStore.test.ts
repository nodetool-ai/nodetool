import useResultsStore from "../ResultsStore";

describe("ResultsStore", () => {
  beforeEach(() => {
    useResultsStore.setState(useResultsStore.getInitialState());
  });

  afterEach(() => {
    useResultsStore.setState(useResultsStore.getInitialState());
  });

  describe("initial state", () => {
    it("has empty results initially", () => {
      expect(useResultsStore.getState().results).toEqual({});
    });

    it("has empty outputResults initially", () => {
      expect(useResultsStore.getState().outputResults).toEqual({});
    });

    it("has empty progress initially", () => {
      expect(useResultsStore.getState().progress).toEqual({});
    });

    it("has empty edges initially", () => {
      expect(useResultsStore.getState().edges).toEqual({});
    });

    it("has empty chunks initially", () => {
      expect(useResultsStore.getState().chunks).toEqual({});
    });

    it("has empty tasks initially", () => {
      expect(useResultsStore.getState().tasks).toEqual({});
    });

    it("has empty toolCalls initially", () => {
      expect(useResultsStore.getState().toolCalls).toEqual({});
    });

    it("has empty planningUpdates initially", () => {
      expect(useResultsStore.getState().planningUpdates).toEqual({});
    });

    it("has empty previews initially", () => {
      expect(useResultsStore.getState().previews).toEqual({});
    });
  });

  describe("setResult and getResult", () => {
    it("sets result for a node", () => {
      useResultsStore.getState().setResult("workflow-1", "node-1", { output: "test" });

      const result = useResultsStore.getState().results["workflow-1:node-1"];
      expect(result).toEqual({ output: "test" });
    });

    it("overwrites existing result", () => {
      useResultsStore.getState().setResult("workflow-1", "node-1", { output: "first" });
      useResultsStore.getState().setResult("workflow-1", "node-1", { output: "second" });

      const result = useResultsStore.getState().results["workflow-1:node-1"];
      expect(result.output).toBe("second");
    });

    it("gets result for existing node", () => {
      useResultsStore.getState().setResult("workflow-1", "node-1", { output: "test" });

      const result = useResultsStore.getState().getResult("workflow-1", "node-1");
      expect(result).toEqual({ output: "test" });
    });

    it("returns undefined for non-existing node", () => {
      const result = useResultsStore.getState().getResult("workflow-1", "non-existent");
      expect(result).toBeUndefined();
    });

    it("stores results for different workflows separately", () => {
      useResultsStore.getState().setResult("workflow-1", "node-1", { output: "wf1" });
      useResultsStore.getState().setResult("workflow-2", "node-1", { output: "wf2" });

      expect(useResultsStore.getState().getResult("workflow-1", "node-1").output).toBe("wf1");
      expect(useResultsStore.getState().getResult("workflow-2", "node-1").output).toBe("wf2");
    });
  });

  describe("setOutputResult and getOutputResult", () => {
    it("sets output result for a node", () => {
      useResultsStore.getState().setOutputResult("workflow-1", "node-1", "output value");

      const result = useResultsStore.getState().outputResults["workflow-1:node-1"];
      expect(result).toBe("output value");
    });

    it("gets output result for existing node", () => {
      useResultsStore.getState().setOutputResult("workflow-1", "node-1", "output value");

      const result = useResultsStore.getState().getOutputResult("workflow-1", "node-1");
      expect(result).toBe("output value");
    });

    it("returns undefined for non-existing node", () => {
      const result = useResultsStore.getState().getOutputResult("workflow-1", "non-existent");
      expect(result).toBeUndefined();
    });
  });

  describe("setProgress and getProgress", () => {
    it("sets progress for a node", () => {
      useResultsStore.getState().setProgress("workflow-1", "node-1", 50, 100, "chunk data");

      const progress = useResultsStore.getState().progress["workflow-1:node-1"];
      expect(progress.progress).toBe(50);
      expect(progress.total).toBe(100);
      expect(progress.chunk).toBe("chunk data");
    });

    it("gets progress for existing node", () => {
      useResultsStore.getState().setProgress("workflow-1", "node-1", 75, 100);

      const progress = useResultsStore.getState().getProgress("workflow-1", "node-1");
      expect(progress.progress).toBe(75);
      expect(progress.total).toBe(100);
    });

    it("returns undefined for non-existing node", () => {
      const progress = useResultsStore.getState().getProgress("workflow-1", "non-existent");
      expect(progress).toBeUndefined();
    });
  });

  describe("setEdge and getEdge", () => {
    it("sets edge status", () => {
      useResultsStore.getState().setEdge("workflow-1", "edge-1", "streaming");

      const edge = useResultsStore.getState().edges["workflow-1:edge-1"];
      expect(edge.status).toBe("streaming");
    });

    it("sets edge with counter", () => {
      useResultsStore.getState().setEdge("workflow-1", "edge-1", "streaming", 5);

      const edge = useResultsStore.getState().edges["workflow-1:edge-1"];
      expect(edge.status).toBe("streaming");
      expect(edge.counter).toBe(5);
    });

    it("gets edge status", () => {
      useResultsStore.getState().setEdge("workflow-1", "edge-1", "completed");

      const edge = useResultsStore.getState().getEdge("workflow-1", "edge-1");
      expect(edge.status).toBe("completed");
    });

    it("returns undefined for non-existing edge", () => {
      const edge = useResultsStore.getState().getEdge("workflow-1", "non-existent");
      expect(edge).toBeUndefined();
    });
  });

  describe("setPreview and getPreview", () => {
    it("sets preview for a node", () => {
      useResultsStore.getState().setPreview("workflow-1", "node-1", { data: "preview" });

      const preview = useResultsStore.getState().previews["workflow-1:node-1"];
      expect(preview).toEqual({ data: "preview" });
    });

    it("gets preview for existing node", () => {
      useResultsStore.getState().setPreview("workflow-1", "node-1", { data: "preview" });

      const preview = useResultsStore.getState().getPreview("workflow-1", "node-1");
      expect(preview).toEqual({ data: "preview" });
    });
  });

  describe("chunk management", () => {
    it("adds chunk for a node", () => {
      useResultsStore.getState().addChunk("workflow-1", "node-1", "chunk1");
      useResultsStore.getState().addChunk("workflow-1", "node-1", "chunk2");

      const chunk = useResultsStore.getState().chunks["workflow-1:node-1"];
      expect(chunk).toBe("chunk1chunk2");
    });

    it("gets chunk for existing node", () => {
      useResultsStore.getState().addChunk("workflow-1", "node-1", "test chunk");

      const chunk = useResultsStore.getState().getChunk("workflow-1", "node-1");
      expect(chunk).toBe("test chunk");
    });
  });

  describe("clear methods", () => {
    it("clears results for workflow", () => {
      useResultsStore.getState().setResult("workflow-1", "node-1", { output: "test" });
      useResultsStore.getState().setResult("workflow-1", "node-2", { output: "test2" });

      useResultsStore.getState().clearResults("workflow-1");

      expect(useResultsStore.getState().results["workflow-1:node-1"]).toBeUndefined();
      expect(useResultsStore.getState().results["workflow-1:node-2"]).toBeUndefined();
    });

    it("clears output results for workflow", () => {
      useResultsStore.getState().setOutputResult("workflow-1", "node-1", "output");

      useResultsStore.getState().clearOutputResults("workflow-1");

      expect(useResultsStore.getState().outputResults["workflow-1:node-1"]).toBeUndefined();
    });

    it("clears progress for workflow", () => {
      useResultsStore.getState().setProgress("workflow-1", "node-1", 50, 100);

      useResultsStore.getState().clearProgress("workflow-1");

      expect(useResultsStore.getState().progress["workflow-1:node-1"]).toBeUndefined();
    });

    it("clears chunks for workflow", () => {
      useResultsStore.getState().addChunk("workflow-1", "node-1", "chunk");

      useResultsStore.getState().clearChunks("workflow-1");

      expect(useResultsStore.getState().chunks["workflow-1:node-1"]).toBeUndefined();
    });

    it("clears tool calls for workflow", () => {
      useResultsStore.getState().setToolCall("workflow-1", "node-1", { id: "tool-1" } as any);

      useResultsStore.getState().clearToolCalls("workflow-1");

      expect(useResultsStore.getState().toolCalls["workflow-1:node-1"]).toBeUndefined();
    });

    it("clears tasks for workflow", () => {
      useResultsStore.getState().setTask("workflow-1", "node-1", { id: "task-1" } as any);

      useResultsStore.getState().clearTasks("workflow-1");

      expect(useResultsStore.getState().tasks["workflow-1:node-1"]).toBeUndefined();
    });

    it("clears planning updates for workflow", () => {
      useResultsStore.getState().setPlanningUpdate("workflow-1", "node-1", { type: "planning" } as any);

      useResultsStore.getState().clearPlanningUpdates("workflow-1");

      expect(useResultsStore.getState().planningUpdates["workflow-1:node-1"]).toBeUndefined();
    });

    it("clears previews for workflow", () => {
      useResultsStore.getState().setPreview("workflow-1", "node-1", { data: "preview" });

      useResultsStore.getState().clearPreviews("workflow-1");

      expect(useResultsStore.getState().previews["workflow-1:node-1"]).toBeUndefined();
    });

    it("clears edges for workflow", () => {
      useResultsStore.getState().setEdge("workflow-1", "edge-1", "completed");

      useResultsStore.getState().clearEdges("workflow-1");

      expect(useResultsStore.getState().edges["workflow-1:edge-1"]).toBeUndefined();
    });
  });

  describe("deleteResult", () => {
    it("deletes result for specific workflow and node", () => {
      useResultsStore.getState().setResult("workflow-1", "node-1", { output: "test" });
      useResultsStore.getState().setResult("workflow-1", "node-2", { output: "test2" });
      useResultsStore.getState().setResult("workflow-2", "node-1", { output: "test3" });

      useResultsStore.getState().deleteResult("workflow-1", "node-1");

      expect(useResultsStore.getState().getResult("workflow-1", "node-1")).toBeUndefined();
      expect(useResultsStore.getState().getResult("workflow-1", "node-2")).toBeDefined();
      expect(useResultsStore.getState().getResult("workflow-2", "node-1")).toBeDefined();
    });
  });
});
