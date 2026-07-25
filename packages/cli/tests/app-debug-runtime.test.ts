/**
 * Tests for the headless app runtime driver (src/app-debug/runtime.ts): value
 * seeding, param collection, and dispatch over the shared runtime core. The
 * fold rules themselves are tested in `@nodetool-ai/app-runtime`.
 */
import { describe, expect, it, vi } from "vitest";
import { HeadlessAppRuntime } from "../src/app-debug/runtime.js";

const IN_PROMPT = { kind: "input", operationId: "main", nodeId: "in1" } as const;
const IN_COUNT = { kind: "input", operationId: "main", nodeId: "in2" } as const;
const OUT_RESULT = { kind: "output", operationId: "main", nodeId: "out1" } as const;

const runtime = (
  runWorkflow: (
    params: Record<string, unknown>
  ) => Promise<ReadonlyArray<Record<string, unknown>>> = async () => []
) =>
  new HeadlessAppRuntime({
    operationId: "main",
    outputKeyByNodeId: new Map([["out1", "main:out1"]]),
    paramNameByInputKey: new Map([
      ["main:in1", "prompt"],
      ["main:in2", "count"]
    ]),
    defaults: { "main:in1": "hi" },
    runWorkflow
  });

describe("HeadlessAppRuntime", () => {
  it("seeds values from input defaults and collects only defined params", () => {
    const rt = runtime();
    expect(rt.read(IN_PROMPT)).toBe("hi");
    expect(rt.collectParams()).toEqual({ prompt: "hi" });
    rt.write(IN_COUNT, 3);
    expect(rt.collectParams()).toEqual({ prompt: "hi", count: 3 });
  });

  it("folds a run's stream into the output slot", async () => {
    const runWorkflow = vi.fn(async () => [
      { type: "output_update", node_id: "out1", output_name: "output", value: "a" },
      { type: "output_update", node_id: "out1", output_name: "output", value: "b" },
      { type: "chunk", node_id: "out1", content: "c" },
      { type: "job_update", status: "completed" }
    ]);
    const rt = runtime(runWorkflow);
    await rt.dispatch({ kind: "run", operationId: "main" });
    expect(rt.read(OUT_RESULT)).toBe("abc");
    expect(rt.runCount).toBe(1);
  });

  it("clears the previous run's output before folding the new one", async () => {
    const runWorkflow = vi.fn(async (params: Record<string, unknown>) => {
      expect(params).toEqual({ prompt: "hello" });
      return [
        { type: "output_update", node_id: "out1", output_name: "output", value: "fresh" }
      ];
    });
    const rt = runtime(runWorkflow);
    rt.write(IN_PROMPT, "hello");
    await rt.dispatch({ kind: "run", operationId: "main" });
    await rt.dispatch({ kind: "run", operationId: "main" });
    expect(runWorkflow).toHaveBeenCalledTimes(2);
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

  it("mutates variables without running", async () => {
    const runWorkflow = vi.fn(async () => []);
    const rt = runtime(runWorkflow);
    await rt.dispatch({ kind: "setVariable", variableId: "dark", value: "yes" });
    await rt.dispatch({ kind: "toggleVariable", variableId: "dark" });
    expect(rt.state.variables.dark).toBe(false);
    expect(runWorkflow).not.toHaveBeenCalled();
  });

  it("keeps an unbound write widget's value out of the run params", () => {
    const rt = runtime();
    rt.write({ kind: "view", componentId: "Slider-9", prop: "value" }, 42);
    expect(rt.collectParams()).toEqual({ prompt: "hi" });
    expect(rt.state.view["Slider-9:value"]).toBe(42);
  });
});
