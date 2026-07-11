/** @jest-environment node */
import { buildExecutionTreeState } from "../useExecutionTreeState";

function msg(
  eventType: string,
  content: unknown
): { role: string; content: unknown; execution_event_type: string } {
  return { role: "agent_execution", execution_event_type: eventType, content };
}

describe("buildExecutionTreeState", () => {
  it("returns idle state for empty messages", () => {
    const state = buildExecutionTreeState([]);
    expect(state.phase).toBe("idle");
    expect(state.tasks).toEqual([]);
    expect(state.logs).toEqual([]);
    expect(state.planningLog).toEqual([]);
    expect(state.planningContent).toBe("");
  });

  it("ignores non-agent messages", () => {
    const messages = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" }
    ] as Parameters<typeof buildExecutionTreeState>[0];
    const state = buildExecutionTreeState(messages);
    expect(state.phase).toBe("idle");
    expect(state.tasks).toEqual([]);
  });

  it("sets planning phase on planning_update", () => {
    const messages = [
      msg("planning_update", {
        phase: "analyzing",
        status: "Running",
        content: "Thinking..."
      })
    ] as Parameters<typeof buildExecutionTreeState>[0];
    const state = buildExecutionTreeState(messages);
    expect(state.phase).toBe("planning");
    expect(state.planningContent).toBe("Thinking...");
    expect(state.planningLog).toHaveLength(1);
    expect(state.planningLog[0]).toEqual({
      phase: "analyzing",
      status: "Running",
      content: "Thinking..."
    });
  });

  it("sets phase to done on planning failure", () => {
    const messages = [
      msg("planning_update", {
        phase: "complete",
        status: "Failed",
        content: "Could not plan"
      })
    ] as Parameters<typeof buildExecutionTreeState>[0];
    const state = buildExecutionTreeState(messages);
    expect(state.phase).toBe("done");
  });

  it("populates logs from log_update", () => {
    const messages = [
      msg("log_update", { node_id: "n1", content: "hello", severity: "info" })
    ] as Parameters<typeof buildExecutionTreeState>[0];
    const state = buildExecutionTreeState(messages);
    expect(state.logs).toHaveLength(1);
    expect(state.logs[0]).toEqual({
      nodeId: "n1",
      content: "hello",
      severity: "info"
    });
  });

  it("creates a task on task_created", () => {
    const messages = [
      msg("task_update", {
        event: "task_created",
        task: {
          id: "t1",
          title: "Research",
          steps: [{ id: "s1", instructions: "Search the web" }]
        }
      })
    ] as Parameters<typeof buildExecutionTreeState>[0];
    const state = buildExecutionTreeState(messages);
    expect(state.phase).toBe("executing");
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].id).toBe("t1");
    expect(state.tasks[0].name).toBe("Research");
    expect(state.tasks[0].status).toBe("running");
    expect(state.tasks[0].steps).toHaveLength(1);
    expect(state.tasks[0].steps[0].id).toBe("s1");
    expect(state.tasks[0].steps[0].status).toBe("waiting");
  });

  it("handles step lifecycle: created -> started -> completed", () => {
    const messages = [
      msg("task_update", {
        event: "task_created",
        task: {
          id: "t1",
          title: "Task",
          steps: [{ id: "s1", instructions: "Do work" }]
        }
      }),
      msg("task_update", {
        event: "step_started",
        task: { id: "t1" },
        step: { id: "s1" }
      }),
      msg("task_update", {
        event: "step_completed",
        task: { id: "t1" },
        step: { id: "s1" }
      })
    ] as Parameters<typeof buildExecutionTreeState>[0];
    const state = buildExecutionTreeState(messages);
    expect(state.tasks[0].steps[0].status).toBe("completed");
  });

  it("marks step as failed on step_failed", () => {
    const messages = [
      msg("task_update", {
        event: "task_created",
        task: {
          id: "t1",
          title: "Task",
          steps: [{ id: "s1", instructions: "Fail" }]
        }
      }),
      msg("task_update", {
        event: "step_failed",
        task: { id: "t1" },
        step: { id: "s1" }
      })
    ] as Parameters<typeof buildExecutionTreeState>[0];
    const state = buildExecutionTreeState(messages);
    expect(state.tasks[0].steps[0].status).toBe("failed");
  });

  it("marks task as failed on task_failed (terminal, not stuck running)", () => {
    const messages = [
      msg("task_update", {
        event: "task_created",
        task: {
          id: "t1",
          title: "Task",
          steps: [{ id: "s1", instructions: "Do work" }]
        }
      }),
      msg("task_update", {
        event: "task_failed",
        task: { id: "t1", error: "budget exhausted" }
      })
    ] as Parameters<typeof buildExecutionTreeState>[0];
    const state = buildExecutionTreeState(messages);
    expect(state.tasks[0].status).toBe("failed");
  });

  it("marks task as completed and sets phase to done", () => {
    const messages = [
      msg("task_update", {
        event: "task_created",
        task: { id: "t1", title: "Task", steps: [] }
      }),
      msg("task_update", {
        event: "task_completed",
        task: { id: "t1" }
      })
    ] as Parameters<typeof buildExecutionTreeState>[0];
    const state = buildExecutionTreeState(messages);
    expect(state.tasks[0].status).toBe("completed");
    expect(state.phase).toBe("done");
  });

  it("updates step output and rawResult from step_result", () => {
    const messages = [
      msg("task_update", {
        event: "task_created",
        task: {
          id: "t1",
          title: "Task",
          steps: [{ id: "s1", instructions: "Produce output" }]
        }
      }),
      msg("step_result", {
        step: { id: "s1" },
        result: "The answer is 42"
      })
    ] as Parameters<typeof buildExecutionTreeState>[0];
    const state = buildExecutionTreeState(messages);
    expect(state.tasks[0].steps[0].output).toBe("The answer is 42");
    expect(state.tasks[0].steps[0].rawResult).toBe("The answer is 42");
    expect(state.tasks[0].steps[0].status).toBe("completed");
  });

  it("marks step as failed when step_result has error", () => {
    const messages = [
      msg("task_update", {
        event: "task_created",
        task: {
          id: "t1",
          title: "Task",
          steps: [{ id: "s1", instructions: "Fail" }]
        }
      }),
      msg("step_result", {
        step: { id: "s1" },
        result: "",
        error: "Something broke"
      })
    ] as Parameters<typeof buildExecutionTreeState>[0];
    const state = buildExecutionTreeState(messages);
    expect(state.tasks[0].steps[0].status).toBe("failed");
    expect(state.tasks[0].steps[0].error).toBe("Something broke");
  });

  it("updates step toolName, toolArgs, and toolCalls from tool_call_update", () => {
    const messages = [
      msg("task_update", {
        event: "task_created",
        task: {
          id: "t1",
          title: "Task",
          steps: [{ id: "s1", instructions: "Use a tool" }]
        }
      }),
      msg("task_update", {
        event: "step_started",
        task: { id: "t1" },
        step: { id: "s1" }
      }),
      msg("tool_call_update", {
        node_id: "s1",
        tool_call_id: "tc1",
        name: "web_search",
        args: { query: "test" }
      })
    ] as Parameters<typeof buildExecutionTreeState>[0];
    const state = buildExecutionTreeState(messages);
    const step = state.tasks[0].steps[0];
    expect(step.toolName).toBe("web_search");
    expect(step.toolArgs).toBe("query: test");
    expect(step.toolCalls).toHaveLength(1);
    expect(step.toolCalls[0].name).toBe("web_search");
    expect(step.toolCalls[0].args).toEqual({ query: "test" });
  });

  it("auto-creates a synthetic graph planner task for graph_planner tool calls", () => {
    const messages = [
      msg("tool_call_update", {
        node_id: "graph_planner",
        tool_call_id: "tc-gp-1",
        name: "search_nodes",
        args: { query: "image generation" }
      })
    ] as Parameters<typeof buildExecutionTreeState>[0];
    const state = buildExecutionTreeState(messages);
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].id).toBe("graph_planner");
    expect(state.tasks[0].name).toBe("Graph planner");
    expect(state.tasks[0].status).toBe("running");
    expect(state.tasks[0].steps[0].toolCalls).toHaveLength(1);
    expect(state.tasks[0].steps[0].toolCalls[0].name).toBe("search_nodes");
  });
});
