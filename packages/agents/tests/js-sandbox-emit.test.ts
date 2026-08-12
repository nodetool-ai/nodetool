/**
 * The guest output contract: `emit(name, value)` streams a value out while the
 * body still runs, `output(name, value)` records a handle's final value. Both
 * are awaitable host bridges — unlike `progress`, nothing here may be dropped,
 * reordered, or rate-limited, and a slow host sink has to reach the producer as
 * backpressure.
 *
 * Every case runs real QuickJS through `runInSandbox`.
 */

import { describe, expect, it } from "vitest";

import {
  MAX_EMIT_CALLS,
  runInSandbox,
  type SandboxEmittedValue
} from "../src/js-sandbox.js";

const TIMEOUT_MS = 30_000;

describe("emit", () => {
  it("delivers every value to the sink in call order", async () => {
    const seen: SandboxEmittedValue[] = [];
    const result = await runInSandbox({
      code: `
        await emit("items", 1);
        await emit("log", "two");
        await emit("items", { n: 3 });
      `,
      onEmit: (name, value) => {
        seen.push({ name, value });
      },
      timeoutMs: TIMEOUT_MS
    });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(seen).toEqual([
      { name: "items", value: 1 },
      { name: "log", value: "two" },
      { name: "items", value: { n: 3 } }
    ]);
    // With a sink, nothing is buffered on the result.
    expect(result.emitted).toBeUndefined();
  });

  it("applies backpressure: the guest's next emit waits for the sink", async () => {
    // One ordering log written from both sides. The guest marks its own
    // progress through an injected global, so guest and host events interleave
    // in one array instead of two lists nobody can align.
    const events: string[] = [];
    const result = await runInSandbox({
      code: `
        await mark("guest:before-1");
        await emit("out", 1);
        await mark("guest:after-1");
        await emit("out", 2);
        await mark("guest:after-2");
      `,
      globals: {
        mark: async (label: unknown): Promise<void> => {
          events.push(String(label));
        }
      },
      onEmit: async (name, value) => {
        events.push(`sink:start:${name}=${String(value)}`);
        await new Promise((resolve) => setTimeout(resolve, 25));
        events.push(`sink:end:${name}=${String(value)}`);
      },
      timeoutMs: TIMEOUT_MS
    });

    expect(result.error).toBeUndefined();
    expect(events).toEqual([
      "guest:before-1",
      "sink:start:out=1",
      "sink:end:out=1",
      "guest:after-1",
      "sink:start:out=2",
      "sink:end:out=2",
      "guest:after-2"
    ]);
  });

  it("collects values on the result when no sink is set", async () => {
    const result = await runInSandbox({
      code: `
        await emit("a", "first");
        await emit("b", [1, 2]);
        await emit("a", "second");
      `,
      timeoutMs: TIMEOUT_MS
    });

    expect(result.error).toBeUndefined();
    expect(result.emitted).toEqual([
      { name: "a", value: "first" },
      { name: "b", value: [1, 2] },
      { name: "a", value: "second" }
    ]);
    // `output` was never called, so the result carries no output bag.
    expect(result.outputs).toBeUndefined();
  });

  it("propagates a throwing sink into the guest", async () => {
    const caught = await runInSandbox({
      code: `
        try {
          await emit("out", 1);
          return "no error";
        } catch (e) {
          return "caught: " + e.message;
        }
      `,
      onEmit: () => {
        throw new Error("sink refused the value");
      },
      timeoutMs: TIMEOUT_MS
    });
    expect(caught.success).toBe(true);
    expect(caught.result).toBe("caught: sink refused the value");

    const uncaught = await runInSandbox({
      code: `await emit("out", 1); return "unreachable";`,
      onEmit: async () => {
        throw new Error("sink refused the value");
      },
      timeoutMs: TIMEOUT_MS
    });
    expect(uncaught.success).toBe(false);
    expect(uncaught.error).toContain("sink refused the value");
  });

  it("throws in the guest past the emit cap, naming it", async () => {
    const result = await runInSandbox({
      code: `
        for (let i = 0; i <= ${MAX_EMIT_CALLS}; i++) {
          await emit("out", i);
        }
        return "no cap";
      `,
      // A sink keeps the run from buffering 10k values on the result; the cap
      // is counted in the bridge either way.
      onEmit: () => {},
      timeoutMs: TIMEOUT_MS
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("MAX_EMIT_CALLS");
    expect(result.error).toContain(String(MAX_EMIT_CALLS));
  });

  it("rejects a non-string name", async () => {
    const result = await runInSandbox({
      code: `await emit(1, "x");`,
      timeoutMs: TIMEOUT_MS
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("emit: name must be a string");
  });
});

describe("output", () => {
  it("records each handle's final value, independent of the return value", async () => {
    const result = await runInSandbox({
      code: `
        await output("sum", 7);
        await output("label", "done");
        return { sum: "IGNORED", extra: true };
      `,
      timeoutMs: TIMEOUT_MS
    });

    expect(result.error).toBeUndefined();
    expect(result.outputs).toEqual({ sum: 7, label: "done" });
    // The return value is still reported as the run's result — it just has no
    // say over the outputs.
    expect(result.result).toEqual({ sum: "IGNORED", extra: true });
    expect(result.emitted).toBeUndefined();
  });

  it("throws when one handle is set twice", async () => {
    const result = await runInSandbox({
      code: `
        await output("sum", 1);
        await output("sum", 2);
      `,
      timeoutMs: TIMEOUT_MS
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('output "sum" was already set');
    // A failed run posts no finals.
    expect(result.outputs).toBeUndefined();
  });

  it("rejects a non-string name", async () => {
    const result = await runInSandbox({
      code: `await output({ name: "sum" }, 1);`,
      timeoutMs: TIMEOUT_MS
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("output: name must be a string");
  });
});
