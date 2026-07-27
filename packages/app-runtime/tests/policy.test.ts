import { describe, expect, it } from "vitest";

import type { OperationBinding, OperationPolicy } from "../src/document.js";
import { implicitOperation } from "../src/operations.js";
import { decideRun } from "../src/policy.js";
import {
  applyEvent,
  applyEvents,
  createInstanceState,
  type AppInstanceState
} from "../src/state.js";

const operation = (policy: OperationPolicy): OperationBinding => ({
  ...implicitOperation("wf1"),
  policy
});

const withRuns = (): AppInstanceState =>
  applyEvents(createInstanceState(), [
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

describe("decideRun", () => {
  it("starts under every policy when nothing is in flight", () => {
    const idle = createInstanceState();
    for (const policy of ["parallel", "replace", "queue"] as const) {
      expect(decideRun(idle, operation(policy))).toEqual({ kind: "start" });
    }
  });

  it("starts a parallel operation even while it is running", () => {
    expect(decideRun(withRuns(), operation("parallel"))).toEqual({ kind: "start" });
  });

  it("cancels every live run of the operation under replace", () => {
    expect(decideRun(withRuns(), operation("replace"))).toEqual({
      kind: "replace",
      cancel: ["j2", "j1"]
    });
  });

  it("awaits every live run of the operation under queue", () => {
    expect(decideRun(withRuns(), operation("queue"))).toEqual({
      kind: "queue",
      after: ["j2", "j1"]
    });
  });

  it("ignores other operations' runs", () => {
    const state = applyEvent(createInstanceState(), {
      type: "runStarted",
      invocation: { id: "j3", operationId: "other", status: "running", startedAt: 3 },
      outputKeys: []
    });
    expect(decideRun(state, operation("replace"))).toEqual({ kind: "start" });
  });

  it("starts again once the previous run settled", () => {
    const state = applyEvent(withRuns(), {
      type: "invocationStatus",
      invocationId: "j1",
      status: "completed"
    });
    expect(decideRun(state, operation("queue"))).toEqual({
      kind: "queue",
      after: ["j2"]
    });
  });
});
