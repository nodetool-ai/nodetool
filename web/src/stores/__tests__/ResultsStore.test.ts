import { renderHook, act } from "@testing-library/react";
import useResultsStore, { hashKey } from "../ResultsStore";
import { Task, ToolCallUpdate, PlanningUpdate } from "../ApiTypes";

describe("ResultsStore", () => {
  beforeEach(() => {
    useResultsStore.setState(useResultsStore.getInitialState());
  });

  describe("hashKey", () => {
    it("creates correct composite key", () => {
      expect(hashKey("workflow-1", "node-1")).toBe("workflow-1:node-1");
      expect(hashKey("wf-123", "n-456")).toBe("wf-123:n-456");
    });
  });

  describe("Initial State", () => {
    it("initializes with empty results", () => {
      const { result } = renderHook(() => useResultsStore());
      expect(result.current.results).toEqual({});
      expect(result.current.outputResults).toEqual({});
      expect(result.current.progress).toEqual({});
      expect(result.current.chunks).toEqual({});
      expect(result.current.tasks).toEqual({});
      expect(result.current.toolCalls).toEqual({});
      expect(result.current.edges).toEqual({});
      expect(result.current.planningUpdates).toEqual({});
      expect(result.current.previews).toEqual({});
    });
  });

  describe("setResult and getResult", () => {
    it("sets and retrieves a result", () => {
      const { result } = renderHook(() => useResultsStore());

      act(() => {
        result.current.setResult("wf-1", "node-1", { data: "test" });
      });

      expect(result.current.getResult("wf-1", "node-1")).toEqual({ data: "test" });
    });

    it("appends to existing array result", () => {
      const { result } = renderHook(() => useResultsStore());

      act(() => {
        result.current.setResult("wf-1", "node-1", "first", true);
        result.current.setResult("wf-1", "node-1", "second", true);
      });

      expect(result.current.getResult("wf-1", "node-1")).toEqual(["first", "second"]);
    });

    it("overwrites non-array result when appending", () => {
      const { result } = renderHook(() => useResultsStore());

      act(() => {
        result.current.setResult("wf-1", "node-1", "first");
        result.current.setResult("wf-1", "node-1", "second", true);
      });

      expect(result.current.getResult("wf-1", "node-1")).toEqual(["first", "second"]);
    });

    it("isolates results between workflows", () => {
      const { result } = renderHook(() => useResultsStore());

      act(() => {
        result.current.setResult("wf-1", "node-1", { data: "workflow1" });
        result.current.setResult("wf-2", "node-1", { data: "workflow2" });
      });

      expect(result.current.getResult("wf-1", "node-1")).toEqual({ data: "workflow1" });
      expect(result.current.getResult("wf-2", "node-1")).toEqual({ data: "workflow2" });
    });
  });

  describe("setOutputResult and getOutputResult", () => {
    it("sets and retrieves output result", () => {
      const { result } = renderHook(() => useResultsStore());

      act(() => {
        result.current.setOutputResult("wf-1", "node-1", { output: "test" });
      });

      expect(result.current.getOutputResult("wf-1", "node-1")).toEqual({ output: "test" });
    });

    it("appends to existing output array", () => {
      const { result } = renderHook(() => useResultsStore());

      act(() => {
        result.current.setOutputResult("wf-1", "node-1", "first", true);
        result.current.setOutputResult("wf-1", "node-1", "second", true);
      });

      expect(result.current.getOutputResult("wf-1", "node-1")).toEqual(["first", "second"]);
    });
  });

  describe("setProgress and getProgress", () => {
    it("sets and retrieves progress", () => {
      const { result } = renderHook(() => useResultsStore());

      act(() => {
        result.current.setProgress("wf-1", "node-1", 50, 100);
      });

      expect(result.current.getProgress("wf-1", "node-1")).toEqual({
        progress: 50,
        total: 100,
        chunk: ""
      });
    });

    it("accumulates chunk data", () => {
      const { result } = renderHook(() => useResultsStore());

      act(() => {
        result.current.setProgress("wf-1", "node-1", 10, 100, "chunk1");
        result.current.setProgress("wf-1", "node-1", 20, 100, "chunk2");
      });

      const progress = result.current.getProgress("wf-1", "node-1");
      expect(progress?.chunk).toBe("chunk1chunk2");
    });
  });

  describe("addChunk and getChunk", () => {
    it("adds and retrieves chunks", () => {
      const { result } = renderHook(() => useResultsStore());

      act(() => {
        result.current.addChunk("wf-1", "node-1", "part1");
        result.current.addChunk("wf-1", "node-1", "part2");
      });

      expect(result.current.getChunk("wf-1", "node-1")).toBe("part1part2");
    });

    it("returns undefined for missing chunk", () => {
      const { result } = renderHook(() => useResultsStore());

      expect(result.current.getChunk("wf-1", "node-1")).toBeUndefined();
    });
  });

  describe("setTask and getTask", () => {
    it("sets and retrieves task", () => {
      const { result } = renderHook(() => useResultsStore());
      const task: Task = {
        type: "task",
        id: "task-1",
        title: "Test Task",
        description: "A test task",
        steps: [],
        output_schema: {}
      };

      act(() => {
        result.current.setTask("wf-1", "node-1", task);
      });

      expect(result.current.getTask("wf-1", "node-1")).toEqual(task);
    });
  });

  describe("setToolCall and getToolCall", () => {
    it("sets and retrieves tool call", () => {
      const { result } = renderHook(() => useResultsStore());
      const toolCall: ToolCallUpdate = {
        type: "tool_call_update",
        tool_call_id: "tool-1",
        name: "test_tool",
        args: {}
      };

      act(() => {
        result.current.setToolCall("wf-1", "node-1", toolCall);
      });

      expect(result.current.getToolCall("wf-1", "node-1")).toEqual(toolCall);
    });
  });

  describe("setEdge and getEdge", () => {
    it("sets and retrieves edge status", () => {
      const { result } = renderHook(() => useResultsStore());

      act(() => {
        result.current.setEdge("wf-1", "edge-1", "running", 5);
      });

      expect(result.current.getEdge("wf-1", "edge-1")).toEqual({ status: "running", counter: 5 });
    });

    it("preserves existing counter when not provided", () => {
      const { result } = renderHook(() => useResultsStore());

      act(() => {
        result.current.setEdge("wf-1", "edge-1", "running", 5);
        result.current.setEdge("wf-1", "edge-1", "completed");
      });

      expect(result.current.getEdge("wf-1", "edge-1")).toEqual({ status: "completed", counter: 5 });
    });
  });

  describe("setPreview and getPreview", () => {
    it("sets and retrieves preview", () => {
      const { result } = renderHook(() => useResultsStore());

      act(() => {
        result.current.setPreview("wf-1", "node-1", { image: "preview.png" });
      });

      expect(result.current.getPreview("wf-1", "node-1")).toEqual({ image: "preview.png" });
    });

    it("appends to existing preview array", () => {
      const { result } = renderHook(() => useResultsStore());

      act(() => {
        result.current.setPreview("wf-1", "node-1", "first", true);
        result.current.setPreview("wf-1", "node-1", "second", true);
      });

      expect(result.current.getPreview("wf-1", "node-1")).toEqual(["first", "second"]);
    });
  });

  describe("setPlanningUpdate and getPlanningUpdate", () => {
    it("sets and retrieves planning update", () => {
      const { result } = renderHook(() => useResultsStore());
      const update: PlanningUpdate = {
        type: "planning_update",
        phase: "planning",
        status: "in_progress",
        content: JSON.stringify({ plan: ["step1", "step2"] })
      };

      act(() => {
        result.current.setPlanningUpdate("wf-1", "node-1", update);
      });

      expect(result.current.getPlanningUpdate("wf-1", "node-1")).toEqual(update);
    });
  });

  describe("deleteResult", () => {
    it("deletes a specific result", () => {
      const { result } = renderHook(() => useResultsStore());

      act(() => {
        result.current.setResult("wf-1", "node-1", { data: "test" });
        result.current.setResult("wf-1", "node-2", { data: "other" });
        result.current.deleteResult("wf-1", "node-1");
      });

      expect(result.current.getResult("wf-1", "node-1")).toBeUndefined();
      expect(result.current.getResult("wf-1", "node-2")).toEqual({ data: "other" });
    });
  });

  describe("clearResults", () => {
    it("clears all results for a workflow", () => {
      const { result } = renderHook(() => useResultsStore());

      act(() => {
        result.current.setResult("wf-1", "node-1", { data: "test1" });
        result.current.setResult("wf-1", "node-2", { data: "test2" });
        result.current.setResult("wf-2", "node-1", { data: "other" });
        result.current.clearResults("wf-1");
      });

      expect(result.current.getResult("wf-1", "node-1")).toBeUndefined();
      expect(result.current.getResult("wf-1", "node-2")).toBeUndefined();
      expect(result.current.getResult("wf-2", "node-1")).toEqual({ data: "other" });
    });
  });

  describe("clearOutputResults", () => {
    it("clears all output results for a workflow", () => {
      const { result } = renderHook(() => useResultsStore());

      act(() => {
        result.current.setOutputResult("wf-1", "node-1", "output1");
        result.current.setOutputResult("wf-2", "node-1", "output2");
        result.current.clearOutputResults("wf-1");
      });

      expect(result.current.getOutputResult("wf-1", "node-1")).toBeUndefined();
      expect(result.current.getOutputResult("wf-2", "node-1")).toBe("output2");
    });
  });

  describe("clearProgress", () => {
    it("clears all progress for a workflow", () => {
      const { result } = renderHook(() => useResultsStore());

      act(() => {
        result.current.setProgress("wf-1", "node-1", 50, 100);
        result.current.setProgress("wf-2", "node-1", 75, 100);
        result.current.clearProgress("wf-1");
      });

      expect(result.current.getProgress("wf-1", "node-1")).toBeUndefined();
      expect(result.current.getProgress("wf-2", "node-1")).toEqual({ progress: 75, total: 100, chunk: "" });
    });
  });

  describe("clearChunks", () => {
    it("clears all chunks for a workflow", () => {
      const { result } = renderHook(() => useResultsStore());

      act(() => {
        result.current.addChunk("wf-1", "node-1", "chunk1");
        result.current.addChunk("wf-2", "node-1", "chunk2");
        result.current.clearChunks("wf-1");
      });

      expect(result.current.getChunk("wf-1", "node-1")).toBeUndefined();
      expect(result.current.getChunk("wf-2", "node-1")).toBe("chunk2");
    });
  });

  describe("clearTasks", () => {
    it("clears all tasks for a workflow", () => {
      const { result } = renderHook(() => useResultsStore());
      const task1: Task = {
        type: "task",
        id: "t1",
        title: "Task 1",
        description: "",
        steps: [],
        output_schema: {}
      };
      const task2: Task = {
        type: "task",
        id: "t2",
        title: "Task 2",
        description: "",
        steps: [],
        output_schema: {}
      };

      act(() => {
        result.current.setTask("wf-1", "node-1", task1);
        result.current.setTask("wf-2", "node-1", task2);
        result.current.clearTasks("wf-1");
      });

      expect(result.current.getTask("wf-1", "node-1")).toBeUndefined();
      expect(result.current.getTask("wf-2", "node-1")).toEqual(task2);
    });
  });

  describe("clearToolCalls", () => {
    it("clears all tool calls for a workflow", () => {
      const { result } = renderHook(() => useResultsStore());
      const toolCall1: ToolCallUpdate = {
        type: "tool_call_update",
        tool_call_id: "tc1",
        name: "tool1",
        args: {}
      };
      const toolCall2: ToolCallUpdate = {
        type: "tool_call_update",
        tool_call_id: "tc2",
        name: "tool2",
        args: {}
      };

      act(() => {
        result.current.setToolCall("wf-1", "node-1", toolCall1);
        result.current.setToolCall("wf-2", "node-1", toolCall2);
        result.current.clearToolCalls("wf-1");
      });

      expect(result.current.getToolCall("wf-1", "node-1")).toBeUndefined();
      expect(result.current.getToolCall("wf-2", "node-1")).toEqual(toolCall2);
    });
  });

  describe("clearEdges", () => {
    it("clears all edges for a workflow", () => {
      const { result } = renderHook(() => useResultsStore());

      act(() => {
        result.current.setEdge("wf-1", "edge-1", "running");
        result.current.setEdge("wf-1", "edge-2", "completed");
        result.current.setEdge("wf-2", "edge-1", "running");
        result.current.clearEdges("wf-1");
      });

      expect(result.current.getEdge("wf-1", "edge-1")).toBeUndefined();
      expect(result.current.getEdge("wf-1", "edge-2")).toBeUndefined();
      expect(result.current.getEdge("wf-2", "edge-1")).toEqual({ status: "running" });
    });
  });

  describe("clearPlanningUpdates", () => {
    it("clears all planning updates for a workflow", () => {
      const { result } = renderHook(() => useResultsStore());
      const update1: PlanningUpdate = {
        type: "planning_update",
        phase: "planning",
        status: "in_progress",
        content: '{"plan": ["step1"]}'
      };
      const update2: PlanningUpdate = {
        type: "planning_update",
        phase: "executing",
        status: "in_progress",
        content: '{"plan": ["step2"]}'
      };

      act(() => {
        result.current.setPlanningUpdate("wf-1", "node-1", update1);
        result.current.setPlanningUpdate("wf-2", "node-1", update2);
        result.current.clearPlanningUpdates("wf-1");
      });

      expect(result.current.getPlanningUpdate("wf-1", "node-1")).toBeUndefined();
      expect(result.current.getPlanningUpdate("wf-2", "node-1")).toEqual(update2);
    });
  });

  describe("clearPreviews", () => {
    it("clears all previews for a workflow", () => {
      const { result } = renderHook(() => useResultsStore());

      act(() => {
        result.current.setPreview("wf-1", "node-1", { preview: "p1" });
        result.current.setPreview("wf-2", "node-1", { preview: "p2" });
        result.current.clearPreviews("wf-1");
      });

      expect(result.current.getPreview("wf-1", "node-1")).toBeUndefined();
      expect(result.current.getPreview("wf-2", "node-1")).toEqual({ preview: "p2" });
    });
  });
});
