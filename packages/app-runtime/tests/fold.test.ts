import { describe, expect, it } from "vitest";

import { messageToEvents, messagesToEvents, errorText } from "../src/fold.js";
import {
  applyEvent,
  applyEvents,
  createInstanceState,
  isOperationRunning,
  type AppInstanceState,
  type InvocationState
} from "../src/state.js";

const invocation = (id: string): InvocationState => ({
  id,
  operationId: "main",
  status: "running",
  startedAt: 1
});

const started = (id: string, outputKeys: string[] = ["main:n9"]) =>
  applyEvent(createInstanceState(), {
    type: "runStarted",
    invocation: invocation(id),
    outputKeys
  });

const ctx = (state: AppInstanceState) => ({
  resolveInvocation: (jobId: string | null | undefined) =>
    jobId ? state.invocations[jobId] ?? null : null,
  outputKey: (operationId: string, nodeId: string) =>
    nodeId === "n9" ? `${operationId}:${nodeId}` : null
});

const fold = (
  state: AppInstanceState,
  messages: Record<string, unknown>[]
): AppInstanceState => applyEvents(state, messagesToEvents(messages, ctx(state)));

describe("run identity", () => {
  it("drops messages from a job this instance did not start", () => {
    const state = started("job-1");
    const next = fold(state, [
      { type: "output_update", job_id: "job-other", node_id: "n9", value: "leak" }
    ]);
    expect(next.outputs["main:n9"].value).toBeUndefined();
  });

  it("drops messages with no job id at all", () => {
    const state = started("job-1");
    const next = fold(state, [
      { type: "output_update", node_id: "n9", value: "leak" }
    ]);
    expect(next.outputs["main:n9"].value).toBeUndefined();
  });

  it("ignores a stale invocation still streaming into a re-run slot", () => {
    let state = started("job-1");
    state = fold(state, [
      { type: "output_update", job_id: "job-1", node_id: "n9", value: "old" }
    ]);
    state = applyEvent(state, {
      type: "runStarted",
      invocation: invocation("job-2"),
      outputKeys: ["main:n9"]
    });
    state = fold(state, [
      { type: "output_update", job_id: "job-1", node_id: "n9", value: " tail" },
      { type: "output_update", job_id: "job-2", node_id: "n9", value: "new" }
    ]);
    expect(state.outputs["main:n9"].value).toBe("new");
  });
});

describe("streaming fold", () => {
  it("concatenates streamed text and marks the stream done", () => {
    let state = started("job-1");
    state = fold(state, [
      { type: "output_update", job_id: "job-1", node_id: "n9", value: "Hel" },
      { type: "output_update", job_id: "job-1", node_id: "n9", value: "lo" },
      { type: "chunk", job_id: "job-1", node_id: "n9", content: "!", done: true }
    ]);
    expect(state.outputs["main:n9"].value).toBe("Hello!");
    expect(state.outputs["main:n9"].status).toBe("done");
  });

  it("collects structured items into a list", () => {
    let state = started("job-1");
    state = fold(state, [
      { type: "output_update", job_id: "job-1", node_id: "n9", value: { a: 1 } },
      { type: "output_update", job_id: "job-1", node_id: "n9", value: { a: 2 } }
    ]);
    expect(state.outputs["main:n9"].value).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("replaces on an explicit replace disposition", () => {
    let state = started("job-1");
    state = fold(state, [
      { type: "output_update", job_id: "job-1", node_id: "n9", value: "draft" },
      {
        type: "output_update",
        job_id: "job-1",
        node_id: "n9",
        value: "final",
        disposition: "replace"
      }
    ]);
    expect(state.outputs["main:n9"].value).toBe("final");
  });

  it("skips non-text chunks", () => {
    const state = fold(started("job-1"), [
      {
        type: "chunk",
        job_id: "job-1",
        node_id: "n9",
        content_type: "audio",
        content: "…"
      }
    ]);
    expect(state.outputs["main:n9"].value).toBeUndefined();
  });

  it("normalizes node progress to a ratio and clears it when the run settles", () => {
    let state = fold(started("job-1"), [
      { type: "node_progress", job_id: "job-1", node_id: "n9", progress: 3, total: 4 }
    ]);
    expect(state.invocations["job-1"].progress).toBeCloseTo(0.75);
    state = fold(state, [
      { type: "job_update", job_id: "job-1", status: "completed" }
    ]);
    expect(state.invocations["job-1"].progress).toBeUndefined();
    expect(isOperationRunning(state, "main")).toBe(false);
  });

  it("records node and job errors against the invocation", () => {
    let state = fold(started("job-1"), [
      { type: "node_update", job_id: "job-1", node_id: "n9", error: { message: "boom" } }
    ]);
    expect(state.invocations["job-1"].error).toBe("boom");
    state = fold(state, [
      { type: "job_update", job_id: "job-1", status: "failed", error: "fatal" }
    ]);
    expect(state.invocations["job-1"].status).toBe("failed");
    expect(state.invocations["job-1"].error).toBe("fatal");
  });

  it("ignores messages it has no rule for", () => {
    const state = started("job-1");
    expect(
      messageToEvents({ type: "edge_update", job_id: "job-1" }, ctx(state))
    ).toEqual([]);
  });
});

describe("errorText", () => {
  it("reads the shapes the kernel sends", () => {
    expect(errorText("plain")).toBe("plain");
    expect(errorText({ message: "wrapped" })).toBe("wrapped");
    expect(errorText({ error: "nested" })).toBe("nested");
    expect(errorText(new Error("thrown"))).toBe("thrown");
    expect(errorText(null)).toBe("");
    expect(errorText({ message: "  " })).toBe("");
  });
});

describe("output → variable", () => {
  const varCtx = (state: AppInstanceState) => ({
    ...ctx(state),
    outputVariable: (_operationId: string, nodeId: string) =>
      nodeId === "n9" || nodeId === "n8" ? "analysis" : null
  });

  const foldVar = (
    state: AppInstanceState,
    messages: Record<string, unknown>[]
  ): AppInstanceState => applyEvents(state, messagesToEvents(messages, varCtx(state)));

  it("writes both the display slot and the variable", () => {
    const state = foldVar(started("job-1"), [
      {
        type: "output_update",
        job_id: "job-1",
        node_id: "n9",
        value: "done",
        disposition: "replace"
      }
    ]);
    expect(state.outputs["main:n9"].value).toBe("done");
    expect(state.variables.analysis).toBe("done");
  });

  it("writes the variable for a node no display is bound to", () => {
    // n8 has no output key, only a variable target.
    const state = foldVar(started("job-1"), [
      { type: "output_update", job_id: "job-1", node_id: "n8", value: 42, disposition: "replace" }
    ]);
    expect(state.variables.analysis).toBe(42);
    expect(state.outputs["main:n8"]).toBeUndefined();
  });

  it("accumulates streamed chunks into the variable", () => {
    const state = foldVar(started("job-1"), [
      { type: "chunk", job_id: "job-1", node_id: "n9", content: "Hel" },
      { type: "chunk", job_id: "job-1", node_id: "n9", content: "lo", done: true }
    ]);
    expect(state.variables.analysis).toBe("Hello");
    expect(state.outputs["main:n9"].value).toBe("Hello");
  });

  it("emits nothing when neither a display nor a variable is bound", () => {
    const state = started("job-1");
    expect(
      messagesToEvents(
        [{ type: "output_update", job_id: "job-1", node_id: "nX", value: "x" }],
        varCtx(state)
      )
    ).toEqual([]);
  });

  it("drops a variable write from a job this instance did not start", () => {
    const state = foldVar(started("job-1"), [
      { type: "output_update", job_id: "job-other", node_id: "n9", value: "leak" }
    ]);
    expect(state.variables.analysis).toBeUndefined();
  });
});

describe("streaming activity", () => {
  it("labels a tool call by its message, falling back to the tool name", () => {
    let state = fold(started("job-1"), [
      { type: "tool_call_update", job_id: "job-1", name: "web_search", args: {} }
    ]);
    expect(state.activity["job-1"]).toBe("web_search");

    state = fold(state, [
      {
        type: "tool_call_update",
        job_id: "job-1",
        name: "web_search",
        args: {},
        message: "Searching for hammocks"
      }
    ]);
    expect(state.activity["job-1"]).toBe("Searching for hammocks");
  });

  it("labels a planning update with its phase and status", () => {
    const state = fold(started("job-1"), [
      { type: "planning_update", job_id: "job-1", phase: "Analysis", status: "Success" }
    ]);
    expect(state.activity["job-1"]).toBe("Analysis: Success");
  });

  it("labels a task update by its task title and step", () => {
    let state = fold(started("job-1"), [
      {
        type: "task_update",
        job_id: "job-1",
        task: { title: "Research" },
        step: { name: "Fetch sources" },
        event: "step_started"
      }
    ]);
    expect(state.activity["job-1"]).toBe("Research: Fetch sources");

    state = fold(state, [
      { type: "task_update", job_id: "job-1", task: {}, event: "task_completed" }
    ]);
    expect(state.activity["job-1"]).toBe("task completed");
  });

  it("ignores an activity message with nothing to say", () => {
    const state = fold(started("job-1"), [
      { type: "planning_update", job_id: "job-1", phase: "", status: "" }
    ]);
    expect(state.activity["job-1"]).toBeUndefined();
  });

  it("folds a top-level error onto the invocation", () => {
    const state = fold(started("job-1"), [
      { type: "error", job_id: "job-1", message: "provider refused" }
    ]);
    expect(state.invocations["job-1"].error).toBe("provider refused");
  });
});
