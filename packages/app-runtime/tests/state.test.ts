import { describe, expect, it } from "vitest";

import {
  applyEvent,
  applyEvents,
  createInstanceState,
  invocationsOf,
  isOperationRunning,
  liveInvocations,
  operationActivity,
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

describe("seedVariables", () => {
  it("seeds only variables that have no value yet", () => {
    let state = applyEvent(createInstanceState(), {
      type: "setVariable",
      variableId: "tone",
      value: "user picked"
    });
    state = applyEvent(state, {
      type: "seedVariables",
      values: { tone: "default", count: 3 }
    });
    expect(state.variables.tone).toBe("user picked");
    expect(state.variables.count).toBe(3);
  });

  it("skips undefined defaults and returns the same object when nothing changes", () => {
    const state = applyEvent(createInstanceState(), {
      type: "seedVariables",
      values: { tone: undefined }
    });
    expect(state.variables).toEqual({});
    expect(applyEvent(state, { type: "seedVariables", values: {} })).toBe(state);
  });

  it("keeps a value seeded first, which is how a restored user value wins", () => {
    let state = applyEvent(createInstanceState(), {
      type: "seedVariables",
      values: { tone: "restored" }
    });
    state = applyEvent(state, {
      type: "seedVariables",
      values: { tone: "document default" }
    });
    expect(state.variables.tone).toBe("restored");
  });
});

describe("appended variables", () => {
  const running = (id: string) =>
    applyEvent(createInstanceState(), {
      type: "runStarted",
      invocation: { id, operationId: "main", status: "running", startedAt: 1 },
      outputKeys: []
    });

  it("accumulates chunks of one run and restarts on the next", () => {
    let state = applyEvents(running("j1"), [
      { type: "setVariable", variableId: "draft", value: "Hel", disposition: "append", invocationId: "j1" },
      { type: "setVariable", variableId: "draft", value: "lo", disposition: "append", invocationId: "j1" }
    ]);
    expect(state.variables.draft).toBe("Hello");

    state = applyEvent(state, {
      type: "setVariable",
      variableId: "draft",
      value: "Bye",
      disposition: "append",
      invocationId: "j2"
    });
    expect(state.variables.draft).toBe("Bye");
  });

  it("collects structured items into a list", () => {
    const state = applyEvents(running("j1"), [
      { type: "setVariable", variableId: "rows", value: { a: 1 }, disposition: "append", invocationId: "j1" },
      { type: "setVariable", variableId: "rows", value: { a: 2 }, disposition: "append", invocationId: "j1" }
    ]);
    expect(state.variables.rows).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("lets a plain write replace an accumulated value", () => {
    let state = applyEvent(running("j1"), {
      type: "setVariable",
      variableId: "draft",
      value: "streamed",
      disposition: "append",
      invocationId: "j1"
    });
    state = applyEvent(state, {
      type: "setVariable",
      variableId: "draft",
      value: "typed"
    });
    expect(state.variables.draft).toBe("typed");
    expect(state.variableWriters.draft).toBeUndefined();
  });
});

describe("superseded runs", () => {
  /** Run `j1` replaced by the newer `j2`, both on the same operation. */
  const replaced = applyEvents(createInstanceState(), [
    {
      type: "runStarted",
      invocation: { id: "j1", operationId: "main", status: "running", startedAt: 1 },
      outputKeys: []
    },
    {
      type: "runStarted",
      invocation: { id: "j2", operationId: "main", status: "running", startedAt: 2 },
      outputKeys: []
    },
    { type: "invocationStatus", invocationId: "j1", status: "cancelled" }
  ]);

  it("drops a late chunk from a run the newer writer took over", () => {
    const state = applyEvents(replaced, [
      { type: "setVariable", variableId: "draft", value: "new ", disposition: "append", invocationId: "j2" },
      { type: "setVariable", variableId: "draft", value: "run", disposition: "append", invocationId: "j2" },
      { type: "setVariable", variableId: "draft", value: "stale", disposition: "append", invocationId: "j1" }
    ]);
    expect(state.variables.draft).toBe("new run");
    expect(state.variableWriters.draft).toBe("j2");
  });

  it("drops a late chunk before the newer run has written the variable", () => {
    const withStale = applyEvent(replaced, {
      type: "setVariable",
      variableId: "draft",
      value: "stale",
      disposition: "append",
      invocationId: "j1"
    });
    expect(withStale).toBe(replaced);
    expect(withStale.variables.draft).toBeUndefined();
  });

  it("lets a genuinely newer run restart the accumulation", () => {
    let state = applyEvents(createInstanceState(), [
      {
        type: "runStarted",
        invocation: { id: "j1", operationId: "main", status: "running", startedAt: 1 },
        outputKeys: []
      },
      { type: "setVariable", variableId: "draft", value: "He", disposition: "append", invocationId: "j1" },
      { type: "setVariable", variableId: "draft", value: "llo", disposition: "append", invocationId: "j1" }
    ]);
    expect(state.variables.draft).toBe("Hello");

    state = applyEvents(state, [
      {
        type: "runStarted",
        invocation: { id: "j2", operationId: "main", status: "running", startedAt: 2 },
        outputKeys: []
      },
      { type: "setVariable", variableId: "draft", value: "By", disposition: "append", invocationId: "j2" },
      { type: "setVariable", variableId: "draft", value: "e", disposition: "append", invocationId: "j2" }
    ]);
    expect(state.variables.draft).toBe("Bye");
    expect(state.variableWriters.draft).toBe("j2");
  });

  it("lets a widget write overwrite whatever a run left, superseded or not", () => {
    let state = applyEvent(replaced, {
      type: "setVariable",
      variableId: "draft",
      value: "streamed",
      disposition: "append",
      invocationId: "j2"
    });
    state = applyEvent(state, {
      type: "setVariable",
      variableId: "draft",
      value: "typed"
    });
    expect(state.variables.draft).toBe("typed");
    expect(state.variableWriters.draft).toBeUndefined();

    // A widget write from an older run's operation is still a widget write.
    state = applyEvent(state, {
      type: "setVariable",
      variableId: "draft",
      value: "typed again",
      disposition: "replace"
    });
    expect(state.variables.draft).toBe("typed again");
  });

  it("keeps runs of different operations from superseding each other", () => {
    const twoOps = applyEvents(createInstanceState(), [
      {
        type: "runStarted",
        invocation: { id: "a", operationId: "draft", status: "running", startedAt: 1 },
        outputKeys: []
      },
      {
        type: "runStarted",
        invocation: { id: "b", operationId: "review", status: "running", startedAt: 2 },
        outputKeys: []
      }
    ]);
    const state = applyEvents(twoOps, [
      { type: "setVariable", variableId: "notes", value: "from a", disposition: "append", invocationId: "a" },
      { type: "setVariable", variableId: "other", value: "from b", disposition: "append", invocationId: "b" }
    ]);
    expect(state.variables.notes).toBe("from a");
    expect(state.variables.other).toBe("from b");
  });
});

describe("activity", () => {
  const running = applyEvent(createInstanceState(), {
    type: "runStarted",
    invocation: { id: "j1", operationId: "main", status: "running", startedAt: 1 },
    outputKeys: []
  });

  it("records the latest label per invocation", () => {
    const state = applyEvents(running, [
      { type: "invocationActivity", invocationId: "j1", label: "Planning" },
      { type: "invocationActivity", invocationId: "j1", label: "web_search" }
    ]);
    expect(state.activity.j1).toBe("web_search");
    expect(operationActivity(state, "main")).toBe("web_search");
  });

  it("ignores an invocation this instance did not start", () => {
    expect(
      applyEvent(running, {
        type: "invocationActivity",
        invocationId: "other",
        label: "leak"
      })
    ).toBe(running);
  });

  it("clears on reset", () => {
    const state = applyEvents(running, [
      { type: "invocationActivity", invocationId: "j1", label: "Planning" },
      { type: "reset" }
    ]);
    expect(state.activity).toEqual({});
    expect(state.variableWriters).toEqual({});
  });
});

describe("liveInvocations", () => {
  const withRuns = applyEvents(createInstanceState(), [
    {
      type: "runStarted",
      invocation: { id: "j1", operationId: "main", status: "running", startedAt: 1 },
      outputKeys: []
    },
    {
      type: "runStarted",
      invocation: { id: "j2", operationId: "main", status: "pending", startedAt: 2 },
      outputKeys: []
    },
    {
      type: "runStarted",
      invocation: { id: "j3", operationId: "other", status: "running", startedAt: 3 },
      outputKeys: []
    }
  ]);

  it("returns an operation's unsettled runs, newest first", () => {
    expect(liveInvocations(withRuns, "main").map((i) => i.id)).toEqual(["j2", "j1"]);
  });

  it("drops settled runs", () => {
    const state = applyEvents(withRuns, [
      { type: "invocationStatus", invocationId: "j1", status: "completed" },
      { type: "invocationStatus", invocationId: "j2", status: "cancelled" }
    ]);
    expect(liveInvocations(state, "main")).toEqual([]);
    expect(isOperationRunning(state, "main")).toBe(false);
  });
});
