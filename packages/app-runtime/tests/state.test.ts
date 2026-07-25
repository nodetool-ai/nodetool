import { describe, expect, it } from "vitest";

import {
  applyEvent,
  applyEvents,
  createInstanceState,
  invocationsOf,
  isOperationRunning,
  operationError,
  operationProgress
} from "../src/state.js";

describe("namespaces", () => {
  it("keeps a widget-local value out of the workflow's inputs", () => {
    const state = applyEvents(createInstanceState(), [
      { type: "setInput", key: "main:n1", value: "graph" },
      { type: "setView", key: "Slider-1:value", value: "local" }
    ]);
    expect(state.inputs["main:n1"].value).toBe("graph");
    expect(state.view["Slider-1:value"]).toBe("local");
    expect(state.inputs["Slider-1:value"]).toBeUndefined();
  });

  it("seeds only inputs that have no value yet", () => {
    let state = applyEvent(createInstanceState(), {
      type: "setInput",
      key: "main:n1",
      value: "typed"
    });
    state = applyEvent(state, {
      type: "seedInputs",
      values: { "main:n1": "default", "main:n2": "default" }
    });
    expect(state.inputs["main:n1"].value).toBe("typed");
    expect(state.inputs["main:n1"].dirty).toBe(true);
    expect(state.inputs["main:n2"].value).toBe("default");
    expect(state.inputs["main:n2"].dirty).toBe(false);
  });

  it("toggles a variable from undefined", () => {
    const state = applyEvent(createInstanceState(), {
      type: "toggleVariable",
      variableId: "dark"
    });
    expect(state.variables.dark).toBe(true);
  });
});

describe("invocations", () => {
  it("marks bound outputs pending in the same batch as the run", () => {
    const state = applyEvent(createInstanceState(), {
      type: "runStarted",
      invocation: {
        id: "job-1",
        operationId: "main",
        status: "pending",
        startedAt: 10
      },
      outputKeys: ["main:n9", "main:n8"]
    });
    expect(state.outputs["main:n9"].status).toBe("pending");
    expect(state.outputs["main:n8"].invocationId).toBe("job-1");
    expect(state.activeInvocation.main).toBe("job-1");
    expect(isOperationRunning(state, "main")).toBe(true);
  });

  it("tracks two operations independently", () => {
    const state = applyEvents(createInstanceState(), [
      {
        type: "runStarted",
        invocation: { id: "a", operationId: "analyze", status: "running", startedAt: 1 },
        outputKeys: []
      },
      {
        type: "runStarted",
        invocation: { id: "b", operationId: "publish", status: "running", startedAt: 2 },
        outputKeys: []
      },
      { type: "invocationStatus", invocationId: "a", status: "completed" }
    ]);
    expect(isOperationRunning(state, "analyze")).toBe(false);
    expect(isOperationRunning(state, "publish")).toBe(true);
    expect(invocationsOf(state, "publish")).toHaveLength(1);
  });

  it("reports progress and error of the active invocation", () => {
    const state = applyEvents(createInstanceState(), [
      {
        type: "runStarted",
        invocation: { id: "a", operationId: "main", status: "running", startedAt: 1 },
        outputKeys: []
      },
      { type: "invocationProgress", invocationId: "a", progress: 0.5 },
      { type: "invocationError", invocationId: "a", error: "bad" }
    ]);
    expect(operationProgress(state, "main")).toBe(0.5);
    expect(operationError(state, "main")).toBe("bad");
  });

  it("ignores updates for an unknown invocation", () => {
    const state = createInstanceState();
    expect(
      applyEvent(state, {
        type: "invocationStatus",
        invocationId: "ghost",
        status: "failed"
      })
    ).toBe(state);
  });
});
