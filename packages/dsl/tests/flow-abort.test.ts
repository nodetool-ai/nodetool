import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { resetDefaultFlow, startFlow, type Flow } from "../src/flow/core.js";
import { invoke } from "../src/flow/invoke.js";
import { invokeStream } from "../src/flow/streaming.js";
import { buildTestRegistry, lifecycle } from "./flow-nodes.js";

const registry = buildTestRegistry();

let flow: Flow;

beforeEach(async () => {
  lifecycle.reset();
  flow = await startFlow({ registry });
}, 120_000);

afterEach(async () => {
  await flow.close();
  await resetDefaultFlow();
});

describe("per-call abort", () => {
  test("a pre-aborted signal rejects before the node runs", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      invoke(
        "nodetool.flowtest.Echo",
        { text: "never" },
        { flow, signal: controller.signal }
      )
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(lifecycle.processed).toEqual([]);
    expect(lifecycle.initialized).toEqual([]);
  });

  test("aborting mid-call rejects the pending call", async () => {
    const controller = new AbortController();
    const pending = invoke(
      "nodetool.flowtest.Forever",
      { delayMs: 5 },
      { flow, signal: controller.signal }
    );
    setTimeout(() => controller.abort(), 10);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  test("the call signal reaches the node's ProcessingContext", async () => {
    const controller = new AbortController();
    const pending = invoke(
      "nodetool.flowtest.Forever",
      { delayMs: 5 },
      { flow, signal: controller.signal }
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    // The flow's own context is untouched — the per-call signal was scoped.
    expect(flow.context.signal.aborted).toBe(false);
  });
});

describe("flow-level abort", () => {
  test("rejects two concurrent in-flight calls", async () => {
    const controller = new AbortController();
    const aborting = await startFlow({ registry, signal: controller.signal });
    const calls = [
      invoke("nodetool.flowtest.Forever", { delayMs: 5 }, { flow: aborting }),
      invoke("nodetool.flowtest.Forever", { delayMs: 5 }, { flow: aborting })
    ];
    setTimeout(() => controller.abort(), 15);
    const results = await Promise.allSettled(calls);
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    for (const result of results) {
      expect(result.status === "rejected" && result.reason.name).toBe(
        "AbortError"
      );
    }
    await aborting.close();
  });

  test("the flow signal is forwarded to the ProcessingContext", async () => {
    const controller = new AbortController();
    const aborting = await startFlow({ registry, signal: controller.signal });
    expect(aborting.context.signal).toBe(controller.signal);
    controller.abort();
    expect(aborting.context.signal.aborted).toBe(true);
    await aborting.close();
  });

  test("a new call on an aborted flow rejects before the node runs", async () => {
    const controller = new AbortController();
    controller.abort();
    const aborting = await startFlow({ registry, signal: controller.signal });
    await expect(
      invoke("nodetool.flowtest.Echo", { text: "x" }, { flow: aborting })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(lifecycle.processed).toEqual([]);
    await aborting.close();
  });
});

describe("streaming abort", () => {
  test("a pending next() settles with the abort rejection and cleans up", async () => {
    const controller = new AbortController();
    const stream = invokeStream(
      "nodetool.flowtest.Forever",
      { delayMs: 5 },
      { flow, signal: controller.signal }
    );
    const first = await stream.next();
    expect(first.done).toBe(false);
    setTimeout(() => controller.abort(), 5);
    await expect(stream.next()).rejects.toMatchObject({ name: "AbortError" });
    expect(lifecycle.cleanedUp).toContain("nodetool.flowtest.Forever");
  });

  test("aborting a run-contract stream ends it and stops the node", async () => {
    const controller = new AbortController();
    async function* endless(): AsyncGenerator<string> {
      for (let i = 0; ; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2));
        yield `item-${i}`;
      }
    }
    const stream = invokeStream(
      "nodetool.flowtest.UppercaseStream",
      { items: endless() },
      { flow, signal: controller.signal }
    );
    await stream.next();
    setTimeout(() => controller.abort(), 5);
    await expect(
      (async () => {
        for await (const _item of stream) {
          // drain until the abort surfaces
        }
      })()
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(lifecycle.cleanedUp).toContain("nodetool.flowtest.UppercaseStream");
  });

  test("a pre-aborted signal rejects the stream on the first next()", async () => {
    const controller = new AbortController();
    controller.abort();
    const stream = invokeStream(
      "nodetool.flowtest.Counter",
      { count: 3 },
      { flow, signal: controller.signal }
    );
    await expect(stream.next()).rejects.toMatchObject({ name: "AbortError" });
    // The node's generator never started, so its cleanup never ran.
    expect(lifecycle.cleanedUp).toEqual([]);
  });
});
