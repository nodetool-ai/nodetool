import useResultsStore, { hashKey } from "../ResultsStore";
import { PlanningUpdate, Task, ToolCallUpdate } from "../ApiTypes";

describe("ResultsStore", () => {
  const workflowId1 = "workflow-1";
  const workflowId2 = "workflow-2";
  const nodeId1 = "node-1";
  const nodeId2 = "node-2";
  const edgeId1 = "edge-1";

  beforeEach(() => {
    useResultsStore.setState({
      results: {},
      outputResults: {},
      progress: {},
      edges: {},
      chunks: {},
      tasks: {},
      toolCalls: {},
      planningUpdates: {},
      previews: {}
    });
  });

  describe("hashKey", () => {
    it("should create correct hash key", () => {
      expect(hashKey("wf-1", "node-1")).toBe("wf-1:node-1");
      expect(hashKey("workflow-123", "node-abc")).toBe("workflow-123:node-abc");
    });
  });

  describe("results", () => {
    it("should set result for a node", () => {
      const result = { data: "test result" };
      useResultsStore.getState().setResult(workflowId1, nodeId1, result);

      expect(useResultsStore.getState().getResult(workflowId1, nodeId1)).toEqual(result);
    });

    it("should set result without appending by default", () => {
      const result1 = { data: "first" };
      const result2 = { data: "second" };

      useResultsStore.getState().setResult(workflowId1, nodeId1, result1);
      useResultsStore.getState().setResult(workflowId1, nodeId1, result2);

      expect(useResultsStore.getState().getResult(workflowId1, nodeId1)).toEqual(result2);
    });

    it("should append result when append is true and existing result is array", () => {
      const result1 = { data: "first" };
      const result2 = { data: "second" };

      useResultsStore.getState().setResult(workflowId1, nodeId1, result1);
      useResultsStore.getState().setResult(workflowId1, nodeId1, result2, true);

      expect(useResultsStore.getState().getResult(workflowId1, nodeId1)).toEqual([result1, result2]);
    });

    it("should append result when append is true and existing result is object", () => {
      const result1 = { data: "first" };
      const result2 = { data: "second" };

      useResultsStore.getState().setResult(workflowId1, nodeId1, result1);
      useResultsStore.getState().setResult(workflowId1, nodeId1, result2, true);

      const stored = useResultsStore.getState().getResult(workflowId1, nodeId1);
      expect(Array.isArray(stored)).toBe(true);
      expect(stored).toHaveLength(2);
    });

    it("should return undefined for non-existent result", () => {
      expect(useResultsStore.getState().getResult(workflowId1, nodeId1)).toBeUndefined();
    });

    it("should isolate results between workflows", () => {
      const result1 = { data: "result1" };
      const result2 = { data: "result2" };

      useResultsStore.getState().setResult(workflowId1, nodeId1, result1);
      useResultsStore.getState().setResult(workflowId2, nodeId1, result2);

      expect(useResultsStore.getState().getResult(workflowId1, nodeId1)).toEqual(result1);
      expect(useResultsStore.getState().getResult(workflowId2, nodeId1)).toEqual(result2);
    });

    it("should delete result for a node", () => {
      const result = { data: "test" };
      useResultsStore.getState().setResult(workflowId1, nodeId1, result);
      expect(useResultsStore.getState().getResult(workflowId1, nodeId1)).toEqual(result);

      useResultsStore.getState().deleteResult(workflowId1, nodeId1);
      expect(useResultsStore.getState().getResult(workflowId1, nodeId1)).toBeUndefined();
    });

    it("should clear all results for a workflow", () => {
      useResultsStore.getState().setResult(workflowId1, nodeId1, { data: "1" });
      useResultsStore.getState().setResult(workflowId1, nodeId2, { data: "2" });
      useResultsStore.getState().setResult(workflowId2, nodeId1, { data: "3" });

      useResultsStore.getState().clearResults(workflowId1);

      expect(useResultsStore.getState().getResult(workflowId1, nodeId1)).toBeUndefined();
      expect(useResultsStore.getState().getResult(workflowId1, nodeId2)).toBeUndefined();
      expect(useResultsStore.getState().getResult(workflowId2, nodeId1)).toEqual({ data: "3" });
    });
  });

  describe("outputResults", () => {
    it("should set output result for a node", () => {
      const output = { output: "test output" };
      useResultsStore.getState().setOutputResult(workflowId1, nodeId1, output);

      expect(useResultsStore.getState().getOutputResult(workflowId1, nodeId1)).toEqual(output);
    });

    it("should isolate output results between workflows", () => {
      useResultsStore.getState().setOutputResult(workflowId1, nodeId1, { data: "1" });
      useResultsStore.getState().setOutputResult(workflowId2, nodeId1, { data: "2" });

      expect(useResultsStore.getState().getOutputResult(workflowId1, nodeId1)).toEqual({ data: "1" });
      expect(useResultsStore.getState().getOutputResult(workflowId2, nodeId1)).toEqual({ data: "2" });
    });

    it("should clear output results for a workflow", () => {
      useResultsStore.getState().setOutputResult(workflowId1, nodeId1, { data: "1" });
      useResultsStore.getState().setOutputResult(workflowId1, nodeId2, { data: "2" });
      useResultsStore.getState().setOutputResult(workflowId2, nodeId1, { data: "3" });

      useResultsStore.getState().clearOutputResults(workflowId1);

      expect(useResultsStore.getState().getOutputResult(workflowId1, nodeId1)).toBeUndefined();
      expect(useResultsStore.getState().getOutputResult(workflowId1, nodeId2)).toBeUndefined();
      expect(useResultsStore.getState().getOutputResult(workflowId2, nodeId1)).toEqual({ data: "3" });
    });
  });

  describe("progress", () => {
    it("should set progress for a node", () => {
      useResultsStore.getState().setProgress(workflowId1, nodeId1, 50, 100);

      const progress = useResultsStore.getState().getProgress(workflowId1, nodeId1);
      expect(progress).toEqual({ progress: 50, total: 100, chunk: "" });
    });

    it("should accumulate chunk data", () => {
      useResultsStore.getState().setProgress(workflowId1, nodeId1, 25, 100, "chunk1");
      useResultsStore.getState().setProgress(workflowId1, nodeId1, 50, 100, "chunk2");

      const progress = useResultsStore.getState().getProgress(workflowId1, nodeId1);
      expect(progress).toEqual({ progress: 50, total: 100, chunk: "chunk1chunk2" });
    });

    it("should clear progress for a workflow", () => {
      useResultsStore.getState().setProgress(workflowId1, nodeId1, 50, 100);
      useResultsStore.getState().setProgress(workflowId2, nodeId1, 25, 50);

      useResultsStore.getState().clearProgress(workflowId1);

      expect(useResultsStore.getState().getProgress(workflowId1, nodeId1)).toBeUndefined();
      expect(useResultsStore.getState().getProgress(workflowId2, nodeId1)).toEqual({ progress: 25, total: 50, chunk: "" });
    });
  });

  describe("edges", () => {
    it("should set edge status", () => {
      useResultsStore.getState().setEdge(workflowId1, edgeId1, "running");

      const edge = useResultsStore.getState().getEdge(workflowId1, edgeId1);
      expect(edge).toEqual({ status: "running" });
    });

    it("should set edge with counter", () => {
      useResultsStore.getState().setEdge(workflowId1, edgeId1, "running", 5);

      const edge = useResultsStore.getState().getEdge(workflowId1, edgeId1);
      expect(edge).toEqual({ status: "running", counter: 5 });
    });

    it("should preserve existing counter when not provided", () => {
      useResultsStore.getState().setEdge(workflowId1, edgeId1, "running", 5);
      useResultsStore.getState().setEdge(workflowId1, edgeId1, "completed");

      const edge = useResultsStore.getState().getEdge(workflowId1, edgeId1);
      expect(edge).toEqual({ status: "completed", counter: 5 });
    });

    it("should clear edges for a workflow", () => {
      useResultsStore.getState().setEdge(workflowId1, edgeId1, "running");
      useResultsStore.getState().setEdge(workflowId2, edgeId1, "running");

      useResultsStore.getState().clearEdges(workflowId1);

      expect(useResultsStore.getState().getEdge(workflowId1, edgeId1)).toBeUndefined();
      expect(useResultsStore.getState().getEdge(workflowId2, edgeId1)).toBeDefined();
    });
  });

  describe("chunks", () => {
    it("should add chunk to existing chunks", () => {
      useResultsStore.getState().addChunk(workflowId1, nodeId1, "part1");
      useResultsStore.getState().addChunk(workflowId1, nodeId1, "part2");

      expect(useResultsStore.getState().getChunk(workflowId1, nodeId1)).toBe("part1part2");
    });

    it("should get chunk for a node", () => {
      useResultsStore.getState().addChunk(workflowId1, nodeId1, "test chunk");

      expect(useResultsStore.getState().getChunk(workflowId1, nodeId1)).toBe("test chunk");
    });

    it("should return undefined for non-existent chunk", () => {
      expect(useResultsStore.getState().getChunk(workflowId1, nodeId1)).toBeUndefined();
    });

    it("should clear chunks for a workflow", () => {
      useResultsStore.getState().addChunk(workflowId1, nodeId1, "chunk1");
      useResultsStore.getState().addChunk(workflowId2, nodeId1, "chunk2");

      useResultsStore.getState().clearChunks(workflowId1);

      expect(useResultsStore.getState().getChunk(workflowId1, nodeId1)).toBeUndefined();
      expect(useResultsStore.getState().getChunk(workflowId2, nodeId1)).toBe("chunk2");
    });
  });

  describe("tasks", () => {
    const mockTask: Task = {
      type: "task",
      id: "task-1",
      title: "Test Task",
      description: "Test task",
      steps: []
    };

    it("should set task for a node", () => {
      useResultsStore.getState().setTask(workflowId1, nodeId1, mockTask);

      expect(useResultsStore.getState().getTask(workflowId1, nodeId1)).toEqual(mockTask);
    });

    it("should return undefined for non-existent task", () => {
      expect(useResultsStore.getState().getTask(workflowId1, nodeId1)).toBeUndefined();
    });

    it("should clear tasks for a workflow", () => {
      useResultsStore.getState().setTask(workflowId1, nodeId1, mockTask);
      useResultsStore.getState().setTask(workflowId2, nodeId1, mockTask);

      useResultsStore.getState().clearTasks(workflowId1);

      expect(useResultsStore.getState().getTask(workflowId1, nodeId1)).toBeUndefined();
      expect(useResultsStore.getState().getTask(workflowId2, nodeId1)).toEqual(mockTask);
    });
  });

  describe("toolCalls", () => {
    const mockToolCall: ToolCallUpdate = {
      type: "tool_call_update",
      name: "test_tool",
      args: { param: "value" },
      message: "Calling tool"
    };

    it("should set tool call for a node", () => {
      useResultsStore.getState().setToolCall(workflowId1, nodeId1, mockToolCall);

      expect(useResultsStore.getState().getToolCall(workflowId1, nodeId1)).toEqual(mockToolCall);
    });

    it("should return undefined for non-existent tool call", () => {
      expect(useResultsStore.getState().getToolCall(workflowId1, nodeId1)).toBeUndefined();
    });

    it("should clear tool calls for a workflow", () => {
      useResultsStore.getState().setToolCall(workflowId1, nodeId1, mockToolCall);
      useResultsStore.getState().setToolCall(workflowId2, nodeId1, mockToolCall);

      useResultsStore.getState().clearToolCalls(workflowId1);

      expect(useResultsStore.getState().getToolCall(workflowId1, nodeId1)).toBeUndefined();
      expect(useResultsStore.getState().getToolCall(workflowId2, nodeId1)).toEqual(mockToolCall);
    });
  });

  describe("planningUpdates", () => {
    const mockPlanningUpdate: PlanningUpdate = {
      type: "planning_update",
      phase: "planning",
      status: "in_progress",
      content: "New plan"
    };

    it("should set planning update for a node", () => {
      useResultsStore.getState().setPlanningUpdate(workflowId1, nodeId1, mockPlanningUpdate);

      expect(useResultsStore.getState().getPlanningUpdate(workflowId1, nodeId1)).toEqual(mockPlanningUpdate);
    });

    it("should return undefined for non-existent planning update", () => {
      expect(useResultsStore.getState().getPlanningUpdate(workflowId1, nodeId1)).toBeUndefined();
    });

    it("should clear planning updates for a workflow", () => {
      useResultsStore.getState().setPlanningUpdate(workflowId1, nodeId1, mockPlanningUpdate);
      useResultsStore.getState().setPlanningUpdate(workflowId2, nodeId1, mockPlanningUpdate);

      useResultsStore.getState().clearPlanningUpdates(workflowId1);

      expect(useResultsStore.getState().getPlanningUpdate(workflowId1, nodeId1)).toBeUndefined();
      expect(useResultsStore.getState().getPlanningUpdate(workflowId2, nodeId1)).toEqual(mockPlanningUpdate);
    });
  });

  describe("previews", () => {
    it("should set preview for a node", () => {
      const preview = { type: "image", data: "base64..." };
      useResultsStore.getState().setPreview(workflowId1, nodeId1, preview);

      expect(useResultsStore.getState().getPreview(workflowId1, nodeId1)).toEqual(preview);
    });

    it("should append preview when append is true and existing is array", () => {
      const preview1 = { type: "image", data: "img1" };
      const preview2 = { type: "image", data: "img2" };

      useResultsStore.getState().setPreview(workflowId1, nodeId1, preview1);
      useResultsStore.getState().setPreview(workflowId1, nodeId1, preview2, true);

      const stored = useResultsStore.getState().getPreview(workflowId1, nodeId1);
      expect(Array.isArray(stored)).toBe(true);
      expect(stored).toHaveLength(2);
    });

    it("should return undefined for non-existent preview", () => {
      expect(useResultsStore.getState().getPreview(workflowId1, nodeId1)).toBeUndefined();
    });

    it("should clear previews for a workflow", () => {
      useResultsStore.getState().setPreview(workflowId1, nodeId1, { data: "1" });
      useResultsStore.getState().setPreview(workflowId2, nodeId1, { data: "2" });

      useResultsStore.getState().clearPreviews(workflowId1);

      expect(useResultsStore.getState().getPreview(workflowId1, nodeId1)).toBeUndefined();
      expect(useResultsStore.getState().getPreview(workflowId2, nodeId1)).toEqual({ data: "2" });
    });
  });
});
