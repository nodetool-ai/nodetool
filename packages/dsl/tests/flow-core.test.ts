import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
  FlowClosedError,
  resetDefaultFlow,
  startFlow,
  type Flow,
  type FlowCallEvent
} from "../src/flow/core.js";
import { invoke } from "../src/flow/invoke.js";
import { buildTestRegistry, lifecycle } from "./flow-nodes.js";

const registry = buildTestRegistry();

let flow: Flow;

// The first startFlow() imports every builtin node pack, which takes longer
// than the default hook timeout on a cold transform cache.
beforeEach(async () => {
  lifecycle.reset();
  flow = await startFlow({ registry });
}, 120_000);

afterEach(async () => {
  await flow.close();
  await resetDefaultFlow();
});

describe("invoke", () => {
  test("one-shot call returns the node's outputs", async () => {
    const out = await invoke(
      "nodetool.text.Concat",
      { a: "Hello, ", b: "world" },
      { flow }
    );
    expect(out).toEqual({ output: "Hello, world" });
  });

  test("a registered node runs with initialize and finalize around it", async () => {
    const out = await invoke("nodetool.flowtest.Echo", { text: "hi" }, { flow });
    expect(out).toEqual({ output: "hi" });
    expect(lifecycle.initialized).toEqual(["nodetool.flowtest.Echo"]);
    expect(lifecycle.finalized).toEqual(["nodetool.flowtest.Echo"]);
  });

  test("multi-yield genProcess folds to the last value per slot", async () => {
    const out = await invoke(
      "nodetool.flowtest.Counter",
      { count: 3 },
      { flow }
    );
    expect(out).toEqual({ value: 2, done: true });
  });

  test("a fresh instance per call — no state carries over", async () => {
    const first = await invoke(
      "nodetool.flowtest.Echo",
      { text: "one" },
      { flow }
    );
    const second = await invoke("nodetool.flowtest.Echo", {}, { flow });
    expect(first).toEqual({ output: "one" });
    expect(second).toEqual({ output: "" });
  });

  test("unknown node types report the registry's error", async () => {
    await expect(
      invoke("nodetool.flowtest.NotAThing", {}, { flow })
    ).rejects.toThrow("Unknown node type: nodetool.flowtest.NotAThing");
  });

  test("an error from process() rejects unwrapped, and finalize still ran", async () => {
    await expect(
      invoke("nodetool.flowtest.Boom", {}, { flow })
    ).rejects.toThrow("boom");
    expect(lifecycle.finalized).toEqual(["nodetool.flowtest.Boom"]);
  });
});

describe("flow resolution", () => {
  test("the ambient flow serves calls inside flow.run()", async () => {
    const events: string[] = [];
    const ambient = await startFlow({
      registry,
      onCall: (e) => events.push(`${e.type}:${e.phase}`)
    });
    const out = await ambient.run(() =>
      invoke("nodetool.flowtest.Echo", { text: "ambient" })
    );
    expect(out).toEqual({ output: "ambient" });
    expect(events).toEqual([
      "nodetool.flowtest.Echo:start",
      "nodetool.flowtest.Echo:end"
    ]);
    await ambient.close();
  });

  test("an explicit flow wins over the ambient one", async () => {
    const seen: string[] = [];
    const explicit = await startFlow({
      registry,
      onCall: (e) => seen.push(`explicit:${e.phase}`)
    });
    const ambient = await startFlow({
      registry,
      onCall: (e) => seen.push(`ambient:${e.phase}`)
    });
    await ambient.run(() =>
      invoke("nodetool.flowtest.Echo", { text: "x" }, { flow: explicit })
    );
    expect(seen).toEqual(["explicit:start", "explicit:end"]);
    await explicit.close();
    await ambient.close();
  });

  test("two concurrent flow.run bodies do not cross", async () => {
    const seenA: string[] = [];
    const seenB: string[] = [];
    const flowA = await startFlow({
      registry,
      onCall: (e) => seenA.push(e.type)
    });
    const flowB = await startFlow({
      registry,
      onCall: (e) => seenB.push(e.type)
    });
    await Promise.all([
      flowA.run(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        await invoke("nodetool.flowtest.Echo", { text: "a" });
      }),
      flowB.run(async () => {
        await invoke("nodetool.flowtest.Counter", { count: 1 });
      })
    ]);
    expect(new Set(seenA)).toEqual(new Set(["nodetool.flowtest.Echo"]));
    expect(new Set(seenB)).toEqual(new Set(["nodetool.flowtest.Counter"]));
    await flowA.close();
    await flowB.close();
  });

  test("without a flow, the process default one serves the call", async () => {
    const out = await invoke("nodetool.text.Concat", {
      a: "no ",
      b: "ceremony"
    });
    expect(out).toEqual({ output: "no ceremony" });
  });
});

describe("lifecycle", () => {
  test("close() is idempotent and Symbol.asyncDispose closes too", async () => {
    const disposable = await startFlow({ registry });
    await disposable.close();
    await disposable.close();
    await disposable[Symbol.asyncDispose]();
    await expect(
      invoke("nodetool.flowtest.Echo", {}, { flow: disposable })
    ).rejects.toBeInstanceOf(FlowClosedError);
  });

  test("run() on a closed flow rejects", async () => {
    const closed = await startFlow({ registry });
    await closed.close();
    expect(() => closed.run(async () => 1)).toThrow(FlowClosedError);
  });

  test("the context carries the flow job id and the default user", async () => {
    expect(flow.context.jobId).toMatch(/^flow-/);
    expect(flow.context.userId).toBe("1");
    const custom = await startFlow({ registry, userId: "42" });
    expect(custom.context.userId).toBe("42");
    await custom.close();
  });
});

describe("onCall", () => {
  test("records start then end with a duration", async () => {
    const events: FlowCallEvent[] = [];
    const traced = await startFlow({
      registry,
      onCall: (e) => events.push(e)
    });
    await invoke("nodetool.flowtest.Echo", { text: "x" }, { flow: traced });
    expect(events.map((e) => e.phase)).toEqual(["start", "end"]);
    expect(events[0].durationMs).toBe(0);
    expect(events[1].durationMs).toBeGreaterThanOrEqual(0);
    await traced.close();
  });

  test("records the error phase with the node's error", async () => {
    const events: FlowCallEvent[] = [];
    const traced = await startFlow({
      registry,
      onCall: (e) => events.push(e)
    });
    await expect(
      invoke("nodetool.flowtest.Boom", {}, { flow: traced })
    ).rejects.toThrow("boom");
    expect(events.map((e) => e.phase)).toEqual(["start", "error"]);
    expect(events[1].error?.message).toBe("boom");
    await traced.close();
  });
});
