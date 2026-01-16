import { renderHook, act } from "@testing-library/react";
import useResultsStore, { hashKey } from "../ResultsStore";
import { PlanningUpdate, Task, ToolCallUpdate } from "../ApiTypes";

describe("ResultsStore", () => {
  beforeEach(() => {
    useResultsStore.setState(useResultsStore.getInitialState());
  });

  describe("hashKey", () => {
    it("creates correct hash key", () => {
      expect(hashKey("wf-1", "node-1")).toBe("wf-1:node-1");
    });
  });

  describe("results", () => {
    it("sets a result for a node", () => {
      const { result } = renderHook(() => useResultsStore());
      act(() => {
        result.current.setResult("wf-1", "node-1", { data: "test" });
      });
      expect(result.current.getResult("wf-1", "node-1")).toEqual({ data: "test" });
    });

    it("appends result when append is true", () => {
      const { result } = renderHook(() => useResultsStore());
      act(() => {
        result.current.setResult("wf-1", "node-1", "first");
        result.current.setResult("wf-1", "node-1", "second", true);
      });
      expect(result.current.getResult("wf-1", "node-1")).toEqual(["first", "second"]);
    });

    it("creates array when appending to non-array", () => {
      const { result } = renderHook(() => useResultsStore());
      act(() => {
        result.current.setResult("wf-1", "node-1", "single");
        result.current.setResult("wf-1", "node-1", "appended", true);
      });
      expect(result.current.getResult("wf-1", "node-1")).toEqual(["single", "appended"]);
    });

    it("clears results for a workflow", () => {
      const { result } = renderHook(() => useResultsStore());
      act(() => {
        result.current.setResult("wf-1", "node-1", { data: "test" });
        result.current.setResult("wf-2", "node-1", { data: "test2" });
        result.current.clearResults("wf-1");
      });
      expect(result.current.getResult("wf-1", "node-1")).toBeUndefined();
      expect(result.current.getResult("wf-2", "node-1")).toEqual({ data: "test2" });
    });

    it("deletes a specific result", () => {
      const { result } = renderHook(() => useResultsStore());
      act(() => {
        result.current.setResult("wf-1", "node-1", { data: "test" });
        result.current.deleteResult("wf-1", "node-1");
      });
      expect(result.current.getResult("wf-1", "node-1")).toBeUndefined();
    });
  });

  describe("outputResults", () => {
    it("sets output result", () => {
      const { result } = renderHook(() => useResultsStore());
      act(() => {
        result.current.setOutputResult("wf-1", "node-1", "output data");
      });
      expect(result.current.getOutputResult("wf-1", "node-1")).toBe("output data");
    });

    it("appends output result", () => {
      const { result } = renderHook(() => useResultsStore());
      act(() => {
        result.current.setOutputResult("wf-1", "node-1", "first");
        result.current.setOutputResult("wf-1", "node-1", "second", true);
      });
      expect(result.current.getOutputResult("wf-1", "node-1")).toEqual(["first", "second"]);
    });

    it("clears output results for a workflow", () => {
      const { result } = renderHook(() => useResultsStore());
      act(() => {
        result.current.setOutputResult("wf-1", "node-1", "output");
        result.current.setOutputResult("wf-2", "node-1", "output2");
        result.current.clearOutputResults("wf-1");
      });
      expect(result.current.getOutputResult("wf-1", "node-1")).toBeUndefined();
      expect(result.current.getOutputResult("wf-2", "node-1")).toBe("output2");
    });
  });

  describe("progress", () => {
  it("sets progress for a node", () => {
    const { result } = renderHook(() => useResultsStore());
    act(() => {
      result.current.setProgress("wf-1", "node-1", 50, 100);
    });
    expect(result.current.getProgress("wf-1", "node-1")).toEqual({ progress: 50, total: 100, chunk: "" });
  });

    it("accumulates chunk in progress", () => {
      const { result } = renderHook(() => useResultsStore());
      act(() => {
        result.current.setProgress("wf-1", "node-1", 25, 100);
        result.current.setProgress("wf-1", "node-1", 50, 100);
      });
      const progress = result.current.getProgress("wf-1", "node-1");
      expect(progress?.chunk).toBe("");
    });

  it("clears progress for a workflow", () => {
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

  describe("chunks", () => {
    it("adds chunk", () => {
      const { result } = renderHook(() => useResultsStore());
      act(() => {
        result.current.addChunk("wf-1", "node-1", "part1");
        result.current.addChunk("wf-1", "node-1", "part2");
      });
      expect(result.current.getChunk("wf-1", "node-1")).toBe("part1part2");
    });

    it("clears chunks for a workflow", () => {
      const { result } = renderHook(() => useResultsStore());
      act(() => {
        result.current.addChunk("wf-1", "node-1", "data");
        result.current.addChunk("wf-2", "node-1", "data2");
        result.current.clearChunks("wf-1");
      });
      expect(result.current.getChunk("wf-1", "node-1")).toBeUndefined();
      expect(result.current.getChunk("wf-2", "node-1")).toBe("data2");
    });
  });

  describe("edges", () => {
    it("sets edge status", () => {
      const { result } = renderHook(() => useResultsStore());
      act(() => {
        result.current.setEdge("wf-1", "edge-1", "running");
      });
      expect(result.current.getEdge("wf-1", "edge-1")).toEqual({ status: "running" });
    });

    it("preserves counter when not provided", () => {
      const { result } = renderHook(() => useResultsStore());
      act(() => {
        result.current.setEdge("wf-1", "edge-1", "running", 5);
        result.current.setEdge("wf-1", "edge-1", "completed");
      });
      expect(result.current.getEdge("wf-1", "edge-1")).toEqual({ status: "completed", counter: 5 });
    });

    it("clears edges for a workflow", () => {
      const { result } = renderHook(() => useResultsStore());
      act(() => {
        result.current.setEdge("wf-1", "edge-1", "running");
        result.current.setEdge("wf-2", "edge-1", "running");
        result.current.clearEdges("wf-1");
      });
      expect(result.current.getEdge("wf-1", "edge-1")).toBeUndefined();
      expect(result.current.getEdge("wf-2", "edge-1")).toEqual({ status: "running" });
    });
  });

  describe("tasks", () => {
    it("sets task", () => {
      const { result } = renderHook(() => useResultsStore());
      const task = { id: "task-1", title: "Test task", description: "Test description", type: "task", steps: [], output_schema: {} } as any;
      act(() => {
        result.current.setTask("wf-1", "node-1", task);
      });
      expect(result.current.getTask("wf-1", "node-1")).toEqual(task);
    });

    it("clears tasks for a workflow", () => {
      const { result } = renderHook(() => useResultsStore());
      const task = { id: "task-1", title: "Test task", description: "Test description", type: "task", steps: [], output_schema: {} } as any;
      act(() => {
        result.current.setTask("wf-1", "node-1", task);
        result.current.setTask("wf-2", "node-1", task);
        result.current.clearTasks("wf-1");
      });
      expect(result.current.getTask("wf-1", "node-1")).toBeUndefined();
      expect(result.current.getTask("wf-2", "node-1")).toEqual(task);
    });
  });

  describe("toolCalls", () => {
    it("sets tool call", () => {
      const { result } = renderHook(() => useResultsStore());
      const toolCall = { type: "tool_call_update", name: "test-tool", args: {} } as any;
      act(() => {
        result.current.setToolCall("wf-1", "node-1", toolCall);
      });
      expect(result.current.getToolCall("wf-1", "node-1")).toEqual(toolCall);
    });

    it("clears tool calls for a workflow", () => {
      const { result } = renderHook(() => useResultsStore());
      const toolCall: ToolCallUpdate = { name: "test-tool", args: {} };
      act(() => {
        result.current.setToolCall("wf-1", "node-1", toolCall);
        result.current.setToolCall("wf-2", "node-1", toolCall);
        result.current.clearToolCalls("wf-1");
      });
      expect(result.current.getToolCall("wf-1", "node-1")).toBeUndefined();
      expect(result.current.getToolCall("wf-2", "node-1")).toEqual(toolCall);
    });
  });

  describe("planningUpdates", () => {
    it("sets planning update", () => {
      const { result } = renderHook(() => useResultsStore());
      const planningUpdate = { type: "planning_update", phase: "planning", status: "planning" } as any;
      act(() => {
        result.current.setPlanningUpdate("wf-1", "node-1", planningUpdate);
      });
      expect(result.current.getPlanningUpdate("wf-1", "node-1")).toEqual(planningUpdate);
    });

    it("clears planning updates for a workflow", () => {
      const { result } = renderHook(() => useResultsStore());
      const planningUpdate = { type: "planning_update", phase: "planning", status: "planning" } as any;
      act(() => {
        result.current.setPlanningUpdate("wf-1", "node-1", planningUpdate);
        result.current.setPlanningUpdate("wf-2", "node-1", planningUpdate);
        result.current.clearPlanningUpdates("wf-1");
      });
      expect(result.current.getPlanningUpdate("wf-1", "node-1")).toBeUndefined();
      expect(result.current.getPlanningUpdate("wf-2", "node-1")).toEqual(planningUpdate);
    });
  });

  describe("previews", () => {
    it("sets preview", () => {
      const { result } = renderHook(() => useResultsStore());
      act(() => {
        result.current.setPreview("wf-1", "node-1", { image: "data:image/png;base64,abc" });
      });
      expect(result.current.getPreview("wf-1", "node-1")).toEqual({ image: "data:image/png;base64,abc" });
    });

    it("appends preview when append is true", () => {
      const { result } = renderHook(() => useResultsStore());
      act(() => {
        result.current.setPreview("wf-1", "node-1", { image: "first" });
        result.current.setPreview("wf-1", "node-1", { image: "second" }, true);
      });
      expect(result.current.getPreview("wf-1", "node-1")).toEqual([{ image: "first" }, { image: "second" }]);
    });

    it("creates array when appending to non-array", () => {
      const { result } = renderHook(() => useResultsStore());
      act(() => {
        result.current.setPreview("wf-1", "node-1", "single");
        result.current.setPreview("wf-1", "node-1", "appended", true);
      });
      expect(result.current.getPreview("wf-1", "node-1")).toEqual(["single", "appended"]);
    });

    it("clears previews for a workflow", () => {
      const { result } = renderHook(() => useResultsStore());
      act(() => {
        result.current.setPreview("wf-1", "node-1", "preview1");
        result.current.setPreview("wf-2", "node-1", "preview2");
        result.current.clearPreviews("wf-1");
      });
      expect(result.current.getPreview("wf-1", "node-1")).toBeUndefined();
      expect(result.current.getPreview("wf-2", "node-1")).toBe("preview2");
    });
  });

  describe("initial state", () => {
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
});
