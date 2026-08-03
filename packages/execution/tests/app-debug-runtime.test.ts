/**
 * Tests for the headless app runtime driver (src/app-debug/runtime.ts): value
 * seeding, param resolution, run policy, timeouts, and dispatch over the shared
 * runtime core. The fold rules themselves are tested in
 * `@nodetool-ai/app-runtime`.
 */
import { describe, expect, it, vi } from "vitest";
import type { OperationBinding } from "@nodetool-ai/app-runtime";
import {
  effectiveTimeoutMs,
  HeadlessAppRuntime,
  type HeadlessOperationInit,
  type HeadlessRunResult
} from "../src/app-debug/runtime.js";

const IN_PROMPT = { kind: "input", operationId: "main", nodeId: "in1" } as const;
const IN_COUNT = { kind: "input", operationId: "main", nodeId: "in2" } as const;
const OUT_RESULT = { kind: "output", operationId: "main", nodeId: "out1" } as const;

type Messages = ReadonlyArray<Record<string, unknown>>;

const binding = (over: Partial<OperationBinding> = {}): OperationBinding => ({
  id: "main",
  name: "Run",
  workflowId: "wf1",
  inputs: {},
  outputs: {},
  policy: "replace",
  ...over
});

/** One operation over a two-input, one-output workflow. */
const operation = (
  run: (params: Record<string, unknown>) => Promise<Messages>,
  over: Partial<OperationBinding> = {},
  runIndex = 0
): HeadlessOperationInit => ({
  binding: binding(over),
  outputKeyByNodeId: new Map([["out1", `${over.id ?? "main"}:out1`]]),
  inputNodeIds: ["in1", "in2"],
  inputNameByNodeId: new Map([
    ["in1", "prompt"],
    ["in2", "count"]
  ]),
  defaults: { [`${over.id ?? "main"}:in1`]: "hi" },
  runWorkflow: async (params): Promise<HeadlessRunResult> => ({
    messages: await run(params),
    runIndex
  })
});

const runtime = (
  run: (params: Record<string, unknown>) => Promise<Messages> = async () => [],
  over: Partial<OperationBinding> = {}
) =>
  new HeadlessAppRuntime({
    operations: [operation(run, over)],
    defaultOperationId: "main"
  });

/** A run that never settles — what a timeout has to save the harness from. */
const hangs = () => new Promise<Messages>(() => {});

describe("HeadlessAppRuntime", () => {
  it("seeds values from input defaults and collects only defined params", () => {
    const rt = runtime();
    expect(rt.read(IN_PROMPT)).toBe("hi");
    expect(rt.collectParams("main")).toEqual({ prompt: "hi" });
    rt.write(IN_COUNT, 3);
    expect(rt.collectParams("main")).toEqual({ prompt: "hi", count: 3 });
  });

  it("seeds declared variable defaults without clobbering a written value", () => {
    const rt = new HeadlessAppRuntime({
      operations: [operation(async () => [])],
      defaultOperationId: "main",
      variables: [
        { id: "tone", name: "tone", default: "formal", scope: "instance", persist: false },
        { id: "empty", name: "empty", scope: "instance", persist: false }
      ]
    });
    expect(rt.state.variables.tone).toBe("formal");
    expect(rt.state.variables).not.toHaveProperty("empty");
  });

  it("folds a run's stream into the output slot", async () => {
    const run = vi.fn(async () => [
      { type: "output_update", node_id: "out1", output_name: "output", value: "a" },
      { type: "output_update", node_id: "out1", output_name: "output", value: "b" },
      { type: "chunk", node_id: "out1", content: "c" },
      { type: "job_update", status: "completed" }
    ]);
    const rt = runtime(run);
    await rt.dispatch({ kind: "run", operationId: "main" });
    expect(rt.read(OUT_RESULT)).toBe("abc");
    expect(rt.runCount).toBe(1);
    expect(rt.invocations[0]).toMatchObject({
      operationId: "main",
      decision: "start",
      runIndex: 0,
      timedOutMs: null
    });
  });

  it("clears the previous run's output before folding the new one", async () => {
    const run = vi.fn(async (params: Record<string, unknown>) => {
      expect(params).toEqual({ prompt: "hello" });
      return [
        { type: "output_update", node_id: "out1", output_name: "output", value: "fresh" }
      ];
    });
    const rt = runtime(run);
    rt.write(IN_PROMPT, "hello");
    await rt.dispatch({ kind: "run", operationId: "main" });
    await rt.dispatch({ kind: "run", operationId: "main" });
    expect(run).toHaveBeenCalledTimes(2);
    expect(rt.read(OUT_RESULT)).toBe("fresh");
  });

  it("captures node and job errors against the invocation", async () => {
    const rt = runtime(async () => [
      { type: "node_update", node_id: "x", status: "error", error: "kaboom" },
      { type: "job_update", status: "failed", error: "job died" }
    ]);
    await rt.dispatch({ kind: "run", operationId: "main" });
    expect(rt.error).toBe("job died");
  });

  it("folds messages the kernel stamped with the server's own job id", async () => {
    // The kernel stamps `job_update` (and `edge_update`) with the job id the
    // server minted, which never matches the harness's invocation id. Dropping
    // those loses every job-level failure, so they are re-stamped before the
    // fold.
    const rt = runtime(async () => [
      { type: "output_update", node_id: "out1", value: "partial" },
      { type: "job_update", job_id: "debug-1730000000", status: "failed", error: "bad params" }
    ]);
    await rt.dispatch({ kind: "run", operationId: "main" });
    expect(rt.state.invocations["headless-1"].status).toBe("failed");
    expect(rt.error).toBe("bad params");
  });

  it("refuses to write a value into an output slot", () => {
    const rt = runtime();
    expect(() => rt.write(OUT_RESULT, "typed by hand")).toThrow(
      /resolves to an output/
    );
    expect(rt.read(OUT_RESULT)).toBeUndefined();
    expect(rt.state.inputs["main:out1"]).toBeUndefined();
  });

  it("leaves a settled invocation alone when a cancel names it", async () => {
    const rt = runtime(async () => [{ type: "job_update", status: "completed" }]);
    await rt.dispatch({ kind: "run", operationId: "main" });
    expect(rt.cancel("main", "headless-1")).toEqual([]);
    expect(rt.state.invocations["headless-1"].status).toBe("completed");
  });

  it("mutates variables without running", async () => {
    const run = vi.fn(async () => []);
    const rt = runtime(run);
    await rt.dispatch({ kind: "setVariable", variableId: "dark", value: "yes" });
    await rt.dispatch({ kind: "toggleVariable", variableId: "dark" });
    expect(rt.state.variables.dark).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("keeps an unbound write widget's value out of the run params", () => {
    const rt = runtime();
    rt.write({ kind: "view", componentId: "Slider-9", prop: "value" }, 42);
    expect(rt.collectParams("main")).toEqual({ prompt: "hi" });
    expect(rt.state.view["Slider-9:value"]).toBe(42);
  });

  it("fans an output mapped to a variable into both the slot and the variable", async () => {
    const rt = runtime(
      async () => [
        { type: "chunk", node_id: "out1", content: "half " },
        { type: "chunk", node_id: "out1", content: "and half", done: true },
        { type: "job_update", status: "completed" }
      ],
      { outputs: { out1: { to: "variable", variableId: "draft" } } }
    );
    await rt.dispatch({ kind: "run", operationId: "main" });
    expect(rt.read(OUT_RESULT)).toBe("half and half");
    expect(rt.state.variables.draft).toBe("half and half");
  });

  it("resolves input mappings from variables and constants", async () => {
    const run = vi.fn(async () => []);
    const rt = runtime(run, {
      inputs: {
        in1: { from: "variable", variableId: "tone" },
        in2: { from: "constant", value: 7 }
      }
    });
    await rt.dispatch({ kind: "setVariable", variableId: "tone", value: "terse" });
    expect(rt.collectParams("main")).toEqual({ prompt: "terse", count: 7 });
  });

  it("records every activity label the run reports, in order", async () => {
    const rt = runtime(async () => [
      { type: "tool_call_update", name: "search", message: "searching the web" },
      { type: "planning_update", phase: "plan", status: "done" },
      { type: "job_update", status: "completed" }
    ]);
    await rt.dispatch({ kind: "run", operationId: "main" });
    expect(rt.invocations[0].activity).toEqual([
      "searching the web",
      "plan: done"
    ]);
    expect(rt.activity.map((a) => a.operationId)).toEqual(["main", "main"]);
    expect(rt.read({ kind: "execution", operationId: "main", field: "activity" })).toBe(
      "plan: done"
    );
  });

  it("gives up on a run that outlives its timeoutMs and leaves it live", async () => {
    const rt = runtime(hangs, { timeoutMs: 5 });
    await rt.dispatch({ kind: "run", operationId: "main" });
    expect(rt.invocations[0].timedOutMs).toBe(5);
    expect(rt.state.invocations["headless-1"].status).toBe("running");
    expect(rt.error).toMatch(/timed out after 5ms/);
  });

  it("replaces a live invocation when the policy says so", async () => {
    const rt = new HeadlessAppRuntime({
      operations: [
        operation(hangs, { policy: "replace", timeoutMs: 5 }),
        // Second call resolves, so the replacement run settles normally.
        operation(async () => [{ type: "job_update", status: "completed" }], {
          id: "other"
        })
      ],
      defaultOperationId: "main"
    });
    await rt.dispatch({ kind: "run", operationId: "main" });
    await rt.dispatch({ kind: "run", operationId: "main" });
    expect(rt.invocations[1]).toMatchObject({
      decision: "replace",
      decisionTargets: ["headless-1"]
    });
    expect(rt.state.invocations["headless-1"].status).toBe("cancelled");
  });

  it("queues behind a live invocation when the policy says so", async () => {
    const rt = runtime(hangs, { policy: "queue", timeoutMs: 5 });
    await rt.dispatch({ kind: "run", operationId: "main" });
    await rt.dispatch({ kind: "run", operationId: "main" });
    expect(rt.invocations[1]).toMatchObject({
      decision: "queue",
      decisionTargets: ["headless-1"]
    });
  });

  it("starts immediately under the parallel policy", async () => {
    const rt = runtime(hangs, { policy: "parallel", timeoutMs: 5 });
    await rt.dispatch({ kind: "run", operationId: "main" });
    await rt.dispatch({ kind: "run", operationId: "main" });
    expect(rt.invocations.map((i) => i.decision)).toEqual(["start", "start"]);
    expect(rt.state.invocations["headless-1"].status).toBe("running");
  });

  it("cancels an operation's live invocations", async () => {
    const rt = runtime(hangs, { timeoutMs: 5 });
    await rt.dispatch({ kind: "run", operationId: "main" });
    expect(rt.cancel("main")).toEqual(["headless-1"]);
    expect(rt.state.invocations["headless-1"].status).toBe("cancelled");
    expect(rt.cancel("main")).toEqual([]);
  });

  it("runs a second operation with its own inputs, outputs, and defaults", async () => {
    const first = vi.fn(async () => []);
    const second = vi.fn(async () => [
      { type: "output_update", node_id: "out1", value: "from other" },
      { type: "job_update", status: "completed" }
    ]);
    const rt = new HeadlessAppRuntime({
      operations: [operation(first), operation(second, { id: "other" }, 1)],
      defaultOperationId: "main"
    });
    await rt.dispatch({ kind: "run", operationId: "other" });
    expect(first).not.toHaveBeenCalled();
    expect(rt.read({ kind: "output", operationId: "other", nodeId: "out1" })).toBe(
      "from other"
    );
    expect(rt.read(OUT_RESULT)).toBeUndefined();
  });

  it("throws for an operation the app never declared", async () => {
    const rt = runtime();
    await expect(rt.dispatch({ kind: "run", operationId: "ghost" })).rejects.toThrow(
      /No operation "ghost"/
    );
  });
});

describe("effectiveTimeoutMs", () => {
  it("takes the shorter of the operation's timeout and the harness ceiling", () => {
    expect(effectiveTimeoutMs(5000, 1000)).toBe(1000);
    expect(effectiveTimeoutMs(500, 1000)).toBe(500);
    expect(effectiveTimeoutMs(null, 1000)).toBe(1000);
    expect(effectiveTimeoutMs(2000, undefined)).toBe(2000);
    expect(effectiveTimeoutMs(null, null)).toBeNull();
  });
});
