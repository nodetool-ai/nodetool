import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { resetDefaultFlow, startFlow, type Flow } from "../src/flow/core.js";
import { invoke } from "../src/flow/invoke.js";
import {
  invokeGenStream,
  invokeRunStream,
  invokeStream,
  type StreamEmission
} from "../src/flow/streaming.js";
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

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of source) {
    items.push(item);
  }
  return items;
}

describe("streaming output", () => {
  test("yields one item per genProcess yield, in order", async () => {
    const items = await collect(
      invokeGenStream("nodetool.flowtest.Counter", { count: 3 }, { flow })
    );
    expect(items).toEqual([
      { value: 0 },
      { value: 1 },
      { value: 2 },
      { done: true }
    ]);
  });

  test("early break runs the node's own cleanup", async () => {
    const stream = invokeStream(
      "nodetool.flowtest.Counter",
      { count: 100 },
      { flow }
    );
    const seen: unknown[] = [];
    for await (const item of stream) {
      seen.push(item);
      if (seen.length === 2) break;
    }
    expect(seen).toHaveLength(2);
    expect(lifecycle.cleanedUp).toContain("nodetool.flowtest.Counter");
  });

  test("a throw into the iterator propagates and still cleans up", async () => {
    const stream = invokeGenStream(
      "nodetool.flowtest.Counter",
      { count: 100 },
      { flow }
    );
    await stream.next();
    await expect(stream.throw(new Error("caller gave up"))).rejects.toThrow(
      "caller gave up"
    );
    expect(lifecycle.cleanedUp).toContain("nodetool.flowtest.Counter");
  });

  test("invokeStream picks the run() contract when the node has one", async () => {
    const items = await collect(
      invokeStream(
        "nodetool.flowtest.UppercaseStream",
        { items: ["a", "b"] },
        { flow }
      )
    );
    expect(items).toEqual([
      { slot: "line", value: "A" },
      { slot: "line", value: "B" },
      { slot: "count", value: 2 }
    ]);
  });
});

describe("streaming input", () => {
  test("an array input is wrapped into a stream, one item at a time", async () => {
    const items = await collect(
      invokeRunStream(
        "nodetool.flowtest.UppercaseStream",
        { items: ["x", "y", "z"] },
        { flow }
      )
    );
    expect(items.filter((e) => e.slot === "line").map((e) => e.value)).toEqual([
      "X",
      "Y",
      "Z"
    ]);
  });

  test("an async iterable input streams and its end is EOS", async () => {
    async function* source(): AsyncGenerator<string> {
      yield "one";
      await new Promise((resolve) => setTimeout(resolve, 1));
      yield "two";
    }
    const items = await collect(
      invokeRunStream(
        "nodetool.flowtest.UppercaseStream",
        { items: source() },
        { flow }
      )
    );
    // The trailing `count` emission proves run() returned — EOS ended the loop.
    expect(items.at(-1)).toEqual({ slot: "count", value: 2 });
  });

  test("a plain value becomes a one-item stream", async () => {
    const items = await collect(
      invokeRunStream(
        "nodetool.flowtest.UppercaseStream",
        { items: "solo" },
        { flow }
      )
    );
    expect(items[0]).toEqual({ slot: "line", value: "SOLO" });
  });

  test("any() yields two handles in arrival order", async () => {
    async function* slow(): AsyncGenerator<string> {
      await new Promise((resolve) => setTimeout(resolve, 10));
      yield "late";
    }
    const items = await collect(
      invokeRunStream(
        "nodetool.flowtest.Interleave",
        { fast: ["early"], slow: slow() },
        { flow }
      )
    );
    expect(items.map((e) => e.value)).toEqual(["fast:early", "slow:late"]);
  });

  test("the awaited form folds emissions to last value per slot", async () => {
    const out = await invoke(
      "nodetool.flowtest.UppercaseStream",
      { items: ["a", "b"] },
      { flow }
    );
    expect(out).toEqual({ line: "B", count: 2 });
  });

  test("emitGroup flattens to its member emissions", async () => {
    const items = await collect(
      invokeRunStream("nodetool.flowtest.GroupEmit", { items: ["g"] }, { flow })
    );
    expect(items).toEqual([
      { slot: "left", value: "g" },
      { slot: "right", value: "g" },
      { slot: "index", value: 0 }
    ]);
  });
});

describe("backpressure", () => {
  test("emit waits for a slow consumer past the queue cap", async () => {
    const stream = invokeRunStream(
      "nodetool.flowtest.Flood",
      { count: 20 },
      { flow, maxQueuedEmissions: 2 }
    );
    const received: StreamEmission[] = [];
    for await (const item of stream) {
      received.push(item);
      // The producer can be at most cap + 1 ahead of what we have read.
      expect(lifecycle.emitted).toBeLessThanOrEqual(received.length + 3);
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    expect(received).toHaveLength(20);
  });

  test("the default cap does not stall a fast consumer", async () => {
    const items = await collect(
      invokeRunStream("nodetool.flowtest.Flood", { count: 50 }, { flow })
    );
    expect(items).toHaveLength(50);
  });
});
