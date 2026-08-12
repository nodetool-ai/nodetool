/**
 * The guest input contract: `stream` reads a node's input handles as the values
 * arrive, the mirror of `emit` on the way out. The host owns the inbox and
 * answers one take at a time; the guest pulls, so an item nobody asked for is
 * never delivered.
 *
 * Every case runs real QuickJS through `runInSandbox`, with a scripted
 * `onTakeInput` standing in for the kernel's `NodeInputs`.
 */

import { describe, expect, it } from "vitest";

import {
  NO_INPUT_STREAM_MESSAGE,
  runInSandbox,
  type SandboxEmittedValue,
  type SandboxInputTake,
  type SandboxTakeInputCallback
} from "../src/js-sandbox.js";

const TIMEOUT_MS = 30_000;

/**
 * A take source over per-handle queues, the way the kernel's inbox behaves: a
 * named take pops that handle's queue, `null` (`stream.any()`) pops whatever
 * arrives first, and an exhausted queue reports end-of-stream.
 */
function scriptedInput(
  streams: Record<string, unknown[]>,
  arrival?: string[]
): { onTakeInput: SandboxTakeInputCallback; takes: (string | null)[] } {
  const queues = new Map<string, unknown[]>(
    Object.entries(streams).map(([handle, values]) => [handle, [...values]])
  );
  const order = arrival ? [...arrival] : undefined;
  const takes: (string | null)[] = [];
  const onTakeInput: SandboxTakeInputCallback = async (handle) => {
    takes.push(handle);
    if (handle !== null) {
      const queue = queues.get(handle);
      if (!queue || queue.length === 0) return { done: true };
      return { done: false, handle, value: queue.shift() };
    }
    const next = order
      ? order.shift()
      : [...queues.entries()].find(([, q]) => q.length > 0)?.[0];
    if (next === undefined) return { done: true };
    const queue = queues.get(next);
    if (!queue || queue.length === 0) return { done: true };
    return { done: false, handle: next, value: queue.shift() };
  };
  return { onTakeInput, takes };
}

describe("stream(name)", () => {
  it("yields one handle's values in order and completes at end-of-stream", async () => {
    const { onTakeInput, takes } = scriptedInput({ numbers: [1, 2, 3] });
    const result = await runInSandbox({
      code: `
        const seen = [];
        for await (const n of stream("numbers")) {
          seen.push(n);
        }
        return seen;
      `,
      onTakeInput,
      timeoutMs: TIMEOUT_MS
    });

    expect(result.error).toBeUndefined();
    expect(result.result).toEqual([1, 2, 3]);
    // Three values plus the take that reported end-of-stream.
    expect(takes).toEqual(["numbers", "numbers", "numbers", "numbers"]);
  });

  it("carries objects and bytes across the boundary", async () => {
    const { onTakeInput } = scriptedInput({
      items: [{ label: "a" }, new Uint8Array([1, 2, 255])]
    });
    const result = await runInSandbox({
      code: `
        const seen = [];
        for await (const item of stream("items")) {
          seen.push(item instanceof Uint8Array ? Array.from(item) : item);
        }
        return seen;
      `,
      onTakeInput,
      timeoutMs: TIMEOUT_MS
    });

    expect(result.error).toBeUndefined();
    expect(result.result).toEqual([{ label: "a" }, [1, 2, 255]]);
  });

  it("throws a TypeError on a name that is not a string", async () => {
    const { onTakeInput } = scriptedInput({ a: [1] });
    const result = await runInSandbox({
      code: `stream(42);`,
      onTakeInput,
      timeoutMs: TIMEOUT_MS
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("stream: name must be a string");
  });
});

describe("stream.any()", () => {
  it("interleaves handles in arrival order as [handle, value] pairs", async () => {
    const { onTakeInput } = scriptedInput(
      { left: ["l1", "l2"], right: ["r1"] },
      ["left", "right", "left"]
    );
    const result = await runInSandbox({
      code: `
        const seen = [];
        for await (const [handle, value] of stream.any()) {
          seen.push(handle + ":" + value);
        }
        return seen;
      `,
      onTakeInput,
      timeoutMs: TIMEOUT_MS
    });

    expect(result.error).toBeUndefined();
    expect(result.result).toEqual(["left:l1", "right:r1", "left:l2"]);
  });
});

describe("stream.first(name)", () => {
  it("returns the next value, then undefined once the stream ended", async () => {
    const { onTakeInput } = scriptedInput({ config: ["only"] });
    const result = await runInSandbox({
      code: `
        const first = await stream.first("config");
        const second = await stream.first("config");
        return { first, second: second === undefined ? "undefined" : second };
      `,
      onTakeInput,
      timeoutMs: TIMEOUT_MS
    });

    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({ first: "only", second: "undefined" });
  });
});

describe("stream.open(name)", () => {
  it("answers the host's probe synchronously", async () => {
    const { onTakeInput } = scriptedInput({ live: [1] });
    const result = await runInSandbox({
      code: `return { live: stream.open("live"), done: stream.open("done") };`,
      onTakeInput,
      onStreamOpen: (handle) => handle === "live",
      timeoutMs: TIMEOUT_MS
    });

    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({ live: true, done: false });
  });

  it("reads every handle as closed when the host answers no probe", async () => {
    const { onTakeInput } = scriptedInput({ live: [1] });
    const result = await runInSandbox({
      code: `return stream.open("live");`,
      onTakeInput,
      timeoutMs: TIMEOUT_MS
    });

    expect(result.error).toBeUndefined();
    expect(result.result).toBe(false);
  });
});

describe("a run with no input stream", () => {
  it("has `stream`, and every verb on it throws", async () => {
    for (const call of [
      `stream("a")[Symbol.asyncIterator]().next()`,
      `stream.any()[Symbol.asyncIterator]().next()`,
      `stream.first("a")`,
      `stream.open("a")`
    ]) {
      const result = await runInSandbox({
        code: `await ${call};`,
        timeoutMs: TIMEOUT_MS
      });
      expect(result.success, call).toBe(false);
      expect(result.error, call).toContain(NO_INPUT_STREAM_MESSAGE);
    }
  }, 60_000);
});

describe("emit while streaming", () => {
  it("delivers each emit between takes, in call order", async () => {
    const { onTakeInput } = scriptedInput({ numbers: [1, 2, 3] });
    const seen: SandboxEmittedValue[] = [];
    const result = await runInSandbox({
      code: `
        let sum = 0;
        for await (const n of stream("numbers")) {
          sum += n;
          await emit("running", sum);
        }
        await output("total", sum);
      `,
      onTakeInput,
      onEmit: (name, value) => {
        seen.push({ name, value });
      },
      timeoutMs: TIMEOUT_MS
    });

    expect(result.error).toBeUndefined();
    expect(seen).toEqual([
      { name: "running", value: 1 },
      { name: "running", value: 3 },
      { name: "running", value: 6 }
    ]);
    expect(result.outputs).toEqual({ total: 6 });
  });
});

describe("the timeout meters guest execution only", () => {
  it("survives an upstream gap longer than the whole budget", async () => {
    let served = false;
    const onTakeInput: SandboxTakeInputCallback = async () => {
      if (served) return { done: true };
      served = true;
      // Longer than the run's whole timeout, spent waiting on upstream. The
      // margin is wide on purpose: engine startup and prelude evaluation are
      // charged to the budget, and on a loaded CI runner they alone have
      // eaten a 500ms one.
      await new Promise((resolve) => setTimeout(resolve, 4_500));
      return { done: false, handle: "slow", value: "late" };
    };
    const result = await runInSandbox({
      code: `
        const seen = [];
        for await (const item of stream("slow")) {
          seen.push(item);
        }
        // A little real work after the wait: the interrupt handler is polled
        // from inside the interpreter, so a body that only awaits would never
        // notice a budget the wait had spent.
        let n = 0;
        for (let i = 0; i < 2000000; i++) n += i;
        seen.push(n > 0);
        return seen;
      `,
      onTakeInput,
      timeoutMs: 3_000
    });

    expect(result.error).toBeUndefined();
    expect(result.result).toEqual(["late", true]);
  }, 30_000);

  it("still cuts a body that computes past its budget", async () => {
    const onTakeInput: SandboxTakeInputCallback = async () =>
      ({ done: true }) as SandboxInputTake;
    const result = await runInSandbox({
      code: `
        for await (const item of stream("nothing")) {
          void item;
        }
        // Nothing suspends the clock here, so this is charged in full.
        let n = 0;
        while (true) {
          n = (n + 1) % 1000000;
        }
      `,
      onTakeInput,
      timeoutMs: 500
    });

    expect(result.success).toBe(false);
  }, 30_000);
});

describe("cancellation", () => {
  it("unwinds a run parked on a take", async () => {
    const controller = new AbortController();
    const onTakeInput: SandboxTakeInputCallback = () =>
      new Promise<SandboxInputTake>(() => {
        // Never resolves: upstream has produced nothing and has not ended.
      });
    setTimeout(() => controller.abort(), 300);

    const result = await runInSandbox({
      code: `
        for await (const item of stream("never")) {
          void item;
        }
        return "finished";
      `,
      onTakeInput,
      signal: controller.signal,
      timeoutMs: TIMEOUT_MS
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Execution cancelled");
  }, 30_000);
});
