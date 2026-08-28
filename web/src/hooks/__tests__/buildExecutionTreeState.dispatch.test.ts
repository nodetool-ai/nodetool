/**
 * @jest-environment node
 *
 * Pins the event-dispatch branches of buildExecutionTreeState that the sibling
 * tests leave open: events naming a task or step that does not exist, a second
 * task_created for an id already seen, a step id declared by two tasks, and the
 * event type recovered from the payload instead of the message field.
 */
import { buildExecutionTreeState } from "../useExecutionTreeState";
import { stub } from "../../test-utils/doubles";
import type { Message } from "../../stores/ApiTypes";

function makeMessage(
  eventType: string | undefined,
  content: Message["content"]
): Message {
  return stub<Message>({
    role: "agent_execution",
    execution_event_type: eventType,
    content
  });
}

function taskCreated(
  taskId: string,
  steps: { id: string; instructions?: string }[],
  title = taskId
): Message {
  return makeMessage("task_update", {
    event: "task_created",
    task: { id: taskId, title, steps }
  });
}

describe("buildExecutionTreeState — events naming something that does not exist", () => {
  it.each([
    "step_started",
    "step_completed",
    "step_failed",
    "task_completed",
    "task_failed"
  ])("ignores %s for an unknown task id", (event) => {
    const state = buildExecutionTreeState([
      taskCreated("task-1", [{ id: "step-1", instructions: "First" }]),
      makeMessage("task_update", {
        event,
        task: { id: "task-missing" },
        step: { id: "step-1" }
      })
    ]);

    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].status).toBe("running");
    expect(state.tasks[0].steps[0].status).toBe("waiting");
    expect(state.phase).toBe("executing");
  });

  it("leaves steps untouched when step_completed names an unknown step", () => {
    const state = buildExecutionTreeState([
      taskCreated("task-1", [{ id: "step-1", instructions: "First" }]),
      makeMessage("task_update", {
        event: "step_completed",
        task: { id: "task-1" },
        step: { id: "step-missing" }
      })
    ]);

    expect(state.tasks[0].steps).toHaveLength(1);
    expect(state.tasks[0].steps[0].status).toBe("waiting");
  });

  it("marks the task running on step_started even when the step id is blank", () => {
    const state = buildExecutionTreeState([
      taskCreated("task-1", [{ id: "step-1", instructions: "First" }]),
      makeMessage("task_update", {
        event: "step_started",
        task: { id: "task-1" },
        step: {}
      })
    ]);

    expect(state.tasks[0].steps).toHaveLength(1);
    expect(state.tasks[0].status).toBe("running");
  });

  it("ignores tool_call_update for a step no task declared", () => {
    const state = buildExecutionTreeState([
      taskCreated("task-1", [{ id: "step-1", instructions: "First" }]),
      makeMessage("tool_call_update", {
        step_id: "step-missing",
        name: "web_search",
        args: { query: "x" }
      })
    ]);

    expect(state.tasks[0].steps[0].toolCalls).toEqual([]);
    expect(state.tasks[0].steps[0].status).toBe("waiting");
  });

  it("skips step_result without a step id", () => {
    const state = buildExecutionTreeState([
      taskCreated("task-1", [{ id: "step-1", instructions: "First" }]),
      makeMessage("step_result", { result: "done" })
    ]);

    expect(state.tasks[0].steps[0].status).toBe("waiting");
    expect(state.tasks[0].steps[0].output).toBe("");
  });
});

describe("buildExecutionTreeState — step index", () => {
  it("keeps the first task that declared a step id", () => {
    const state = buildExecutionTreeState([
      taskCreated("task-1", [{ id: "shared", instructions: "From one" }]),
      taskCreated("task-2", [{ id: "shared", instructions: "From two" }]),
      makeMessage("step_result", { step: { id: "shared" }, result: "answer" })
    ]);

    expect(state.tasks[0].steps[0].output).toBe("answer");
    expect(state.tasks[1].steps[0].output).toBe("");
  });

  it("indexes a step created dynamically by step_started", () => {
    const state = buildExecutionTreeState([
      taskCreated("task-1", []),
      makeMessage("task_update", {
        event: "step_started",
        task: { id: "task-1" },
        step: { id: "late", instructions: "Appeared mid-run" }
      }),
      makeMessage("step_result", { step: { id: "late" }, result: "answer" })
    ]);

    expect(state.tasks[0].steps).toHaveLength(1);
    expect(state.tasks[0].steps[0].output).toBe("answer");
    expect(state.tasks[0].steps[0].status).toBe("completed");
  });

  it("ignores a second task_created for an id already seen", () => {
    const state = buildExecutionTreeState([
      taskCreated(
        "task-1",
        [{ id: "step-1", instructions: "First" }],
        "Original"
      ),
      taskCreated(
        "task-1",
        [{ id: "step-2", instructions: "Second" }],
        "Replacement"
      )
    ]);

    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].name).toBe("Original");
    expect(state.tasks[0].steps.map((s) => s.id)).toEqual(["step-1"]);
  });
});

describe("buildExecutionTreeState — event type resolution", () => {
  it("reads the event type from the payload when the message omits it", () => {
    const state = buildExecutionTreeState([
      makeMessage(undefined, {
        type: "planning_update",
        phase: "analysis",
        status: "Running",
        content: "thinking"
      })
    ]);

    expect(state.phase).toBe("planning");
    expect(state.planningContent).toBe("thinking");
  });

  it("ignores an event type nothing handles", () => {
    const state = buildExecutionTreeState([
      makeMessage("chunk", { content: "hello" })
    ]);

    expect(state).toEqual({
      phase: "idle",
      planningContent: "",
      planningLog: [],
      logs: [],
      tasks: []
    });
  });

  it("keeps string content that is not JSON", () => {
    const state = buildExecutionTreeState([
      makeMessage("log_update", "not json at all")
    ]);

    // A string payload has no `content` field, and `JSON.stringify(undefined)`
    // returns undefined rather than a string — so LogEntry.content is undefined
    // here despite its `string` type. Pinned as-is; see the PR body.
    expect(state.logs).toEqual([
      { nodeId: "", content: undefined, severity: "info" }
    ]);
  });

  it("defaults planning_update fields that are absent", () => {
    const state = buildExecutionTreeState([makeMessage("planning_update", {})]);

    expect(state.planningContent).toBe("");
    expect(state.planningLog).toEqual([{ phase: "", status: "", content: "" }]);
  });
});

describe("buildExecutionTreeState — tool call args", () => {
  it("records empty args when the update carries none", () => {
    const state = buildExecutionTreeState([
      taskCreated("task-1", [{ id: "step-1", instructions: "First" }]),
      makeMessage("tool_call_update", { step_id: "step-1", name: "noop" })
    ]);

    const step = state.tasks[0].steps[0];
    expect(step.toolCalls).toEqual([
      { id: undefined, name: "noop", args: {}, message: undefined }
    ]);
    expect(step.toolArgs).toBe("");
    expect(step.status).toBe("running");
  });

  it("appends rather than merges when a tool call carries no id", () => {
    const state = buildExecutionTreeState([
      taskCreated("task-1", [{ id: "step-1", instructions: "First" }]),
      makeMessage("tool_call_update", { step_id: "step-1", name: "first" }),
      makeMessage("tool_call_update", { step_id: "step-1", name: "second" })
    ]);

    expect(state.tasks[0].steps[0].toolCalls.map((c) => c.name)).toEqual([
      "first",
      "second"
    ]);
  });

  it("prefers node_id over step_id when both are present", () => {
    const state = buildExecutionTreeState([
      taskCreated("task-1", [
        { id: "step-1", instructions: "First" },
        { id: "step-2", instructions: "Second" }
      ]),
      makeMessage("tool_call_update", {
        node_id: "step-2",
        step_id: "step-1",
        name: "web_search"
      })
    ]);

    expect(state.tasks[0].steps[0].toolCalls).toEqual([]);
    expect(state.tasks[0].steps[1].toolCalls).toHaveLength(1);
  });

  it("truncates each rendered arg value to 40 characters", () => {
    const state = buildExecutionTreeState([
      taskCreated("task-1", [{ id: "step-1", instructions: "First" }]),
      makeMessage("tool_call_update", {
        step_id: "step-1",
        name: "web_search",
        args: { query: "y".repeat(50), limit: 3 }
      })
    ]);

    expect(state.tasks[0].steps[0].toolArgs).toBe(
      `query: ${"y".repeat(40)}, limit: 3`
    );
  });
});

describe("buildExecutionTreeState — completion phase", () => {
  it("stays executing while one task is still running", () => {
    const state = buildExecutionTreeState([
      taskCreated("task-1", [{ id: "step-1" }]),
      taskCreated("task-2", [{ id: "step-2" }]),
      makeMessage("task_update", {
        event: "task_completed",
        task: { id: "task-1" }
      })
    ]);

    expect(state.phase).toBe("executing");
  });

  it("reaches done when every task settled, failed included", () => {
    const state = buildExecutionTreeState([
      taskCreated("task-1", [{ id: "step-1" }]),
      taskCreated("task-2", [{ id: "step-2" }]),
      makeMessage("task_update", {
        event: "task_completed",
        task: { id: "task-1" }
      }),
      makeMessage("task_update", {
        event: "task_failed",
        task: { id: "task-2" }
      })
    ]);

    expect(state.phase).toBe("done");
    expect(state.tasks.map((t) => t.status)).toEqual(["completed", "failed"]);
    expect(state.tasks.every((t) => t.expanded === false)).toBe(true);
  });

  it("leaves toolName alone when toolCallsByStep holds no calls for a step", () => {
    const state = buildExecutionTreeState(
      [taskCreated("task-1", [{ id: "step-1" }])],
      { "step-1": [], "step-other": [] }
    );

    expect(state.tasks[0].steps[0].toolName).toBeUndefined();
  });
});
