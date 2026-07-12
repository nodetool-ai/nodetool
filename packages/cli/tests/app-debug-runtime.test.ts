/**
 * Tests for the headless app runtime (src/app-debug/runtime.ts): value
 * seeding, message folding (mirrors the web `useAppRuntime` rules), and action
 * dispatch.
 */
import { describe, expect, it, vi } from "vitest";
import { HeadlessAppRuntime, eventToAction } from "../src/app-debug/runtime.js";
import type { AppIO } from "../src/app-debug/types.js";

const io: AppIO = {
  inputs: [
    { nodeId: "in1", nodeType: "nodetool.input.StringInput", name: "prompt", defaultValue: "hi" },
    { nodeId: "in2", nodeType: "nodetool.input.IntegerInput", name: "count" }
  ],
  outputs: [{ nodeId: "out1", nodeType: "nodetool.output.StringOutput", name: "result" }],
  variables: ["dark"]
};

const runtime = (
  runWorkflow: (params: Record<string, unknown>) => Promise<ReadonlyArray<Record<string, unknown>>> = async () => []
) => new HeadlessAppRuntime({ io, runWorkflow });

describe("HeadlessAppRuntime", () => {
  it("seeds values from input defaults and collects only defined params", () => {
    const rt = runtime();
    expect(rt.values).toEqual({ prompt: "hi" });
    expect(rt.collectParams()).toEqual({ prompt: "hi" });
    rt.setValue("count", 3);
    expect(rt.collectParams()).toEqual({ prompt: "hi", count: 3 });
  });

  it("folds output_update by node id, appending streamed text and replacing structured values", () => {
    const rt = runtime();
    rt.applyMessages([
      { type: "output_update", node_id: "out1", output_name: "output", value: "a", disposition: "append" },
      { type: "output_update", node_id: "out1", output_name: "output", value: "b", disposition: "append" },
      { type: "chunk", node_id: "out1", content: "c" }
    ]);
    expect(rt.values.result).toBe("abc");
    rt.applyMessages([
      { type: "output_update", node_id: "out1", output_name: "output", value: { uri: "x.png" } }
    ]);
    expect(rt.values.result).toEqual({ uri: "x.png" });
  });

  it("ignores non-text chunks and messages for unknown nodes", () => {
    const rt = runtime();
    rt.applyMessages([
      { type: "chunk", node_id: "out1", content_type: "audio", content: "zzz" },
      { type: "chunk", node_id: "mystery", content: "zzz" }
    ]);
    expect(rt.values.result).toBeUndefined();
  });

  it("captures node and job errors", () => {
    const rt = runtime();
    rt.applyMessages([{ type: "node_update", node_id: "x", status: "error", error: "kaboom" }]);
    expect(rt.error).toBe("kaboom");
    rt.applyMessages([{ type: "job_update", status: "failed", error: "job died" }]);
    expect(rt.error).toBe("job died");
  });

  it("dispatch(run) clears outputs, runs with current params, and folds the stream", async () => {
    const runWorkflow = vi.fn(async (params: Record<string, unknown>) => {
      expect(params).toEqual({ prompt: "hello" });
      return [
        { type: "output_update", node_id: "out1", output_name: "output", value: "fresh" }
      ];
    });
    const rt = runtime(runWorkflow);
    rt.setValue("prompt", "hello");
    rt.setValue("result", "stale");
    await rt.dispatch({ kind: "run" });
    expect(runWorkflow).toHaveBeenCalledOnce();
    expect(rt.values.result).toBe("fresh");
    expect(rt.runCount).toBe(1);
  });

  it("dispatch(setState/toggleState) mutates values without running", async () => {
    const runWorkflow = vi.fn(async () => []);
    const rt = runtime(runWorkflow);
    await rt.dispatch({ kind: "setState", key: "dark", value: "yes" });
    await rt.dispatch({ kind: "toggleState", key: "dark" });
    expect(rt.values.dark).toBe(false);
    expect(runWorkflow).not.toHaveBeenCalled();
  });
});

describe("eventToAction", () => {
  it("maps stored events to actions, carrying the trigger origin for runs", () => {
    expect(eventToAction({ trigger: "change", kind: "run" }, "prompt")).toEqual({
      kind: "run",
      from: "prompt"
    });
    expect(eventToAction({ trigger: "click", kind: "toggleState", key: "dark" })).toEqual({
      kind: "toggleState",
      key: "dark"
    });
  });
});
