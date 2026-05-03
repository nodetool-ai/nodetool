/**
 * Tracing-helper tests: verify pass-through behavior when telemetry is off,
 * and async-generator-aware span wrapping.
 */

import { describe, it, expect } from "vitest";
import {
  withAgentSpan,
  withAgentSpanGen,
  withWorkflowSpan,
  withNodeSpan,
  withSpanGen,
  createUsageSlot,
  setLastUsage,
  consumeLastUsage,
  peekLastUsage
} from "../src/tracing-helpers.js";

describe("with*Span (no tracer configured)", () => {
  it("withAgentSpan calls the function with null span", async () => {
    let received: unknown = "untouched";
    const result = await withAgentSpan(
      "execute",
      { objective: "test" },
      async (span) => {
        received = span;
        return 42;
      }
    );
    expect(result).toBe(42);
    expect(received).toBeNull();
  });

  it("withWorkflowSpan / withNodeSpan are pass-through when telemetry is off", async () => {
    const wf = await withWorkflowSpan({ workflowId: "wf-1" }, async () => "wf");
    const node = await withNodeSpan(
      { nodeId: "n1", nodeType: "Constant" },
      async () => "node"
    );
    expect(wf).toBe("wf");
    expect(node).toBe("node");
  });

  it("withSpanGen yields all values and preserves TReturn", async () => {
    async function* gen(): AsyncGenerator<number, string> {
      yield 1;
      yield 2;
      yield 3;
      return "done";
    }
    const yielded: number[] = [];
    const wrapped = withSpanGen<number, string>("test", {}, () => gen());
    let result = await wrapped.next();
    while (!result.done) {
      yielded.push(result.value);
      result = await wrapped.next();
    }
    expect(yielded).toEqual([1, 2, 3]);
    expect(result.value).toBe("done");
  });

  it("withAgentSpanGen forwards yields and TReturn", async () => {
    async function* gen(): AsyncGenerator<string, number> {
      yield "a";
      return 99;
    }
    const wrapped = withAgentSpanGen<string, number>(
      "plan",
      { objective: "x" },
      () => gen()
    );
    const first = await wrapped.next();
    expect(first.done).toBe(false);
    expect(first.value).toBe("a");
    const second = await wrapped.next();
    expect(second.done).toBe(true);
    expect(second.value).toBe(99);
  });

  it("propagates errors through generator span", async () => {
    async function* gen(): AsyncGenerator<number> {
      yield 1;
      throw new Error("boom");
    }
    const wrapped = withSpanGen("test", {}, () => gen());
    await wrapped.next();
    await expect(wrapped.next()).rejects.toThrow("boom");
  });

  it("closes the inner generator's finally block on early consumer cancel", async () => {
    let cleanup = false;
    async function* gen(): AsyncGenerator<number> {
      try {
        yield 1;
        yield 2;
        yield 3;
      } finally {
        cleanup = true;
      }
    }
    // Consume one value, then break out (mirrors `for await { break }`).
    for await (const _v of withSpanGen("test", {}, () => gen())) {
      break;
    }
    expect(cleanup).toBe(true);
  });
});

describe("usage slot capture", () => {
  it("createUsageSlot captures setLastUsage writes via runInSlot", async () => {
    const { runInSlot, getUsage } = createUsageSlot();
    expect(getUsage()).toBeNull();

    await runInSlot(async () => {
      setLastUsage({ inputTokens: 100, outputTokens: 50, cost: 0.5 });
    });

    const u = getUsage();
    expect(u).not.toBeNull();
    expect(u?.inputTokens).toBe(100);
    expect(u?.outputTokens).toBe(50);
    expect(u?.cost).toBe(0.5);
  });

  it("setLastUsage outside any slot is silently dropped", async () => {
    setLastUsage({ inputTokens: 1, outputTokens: 1 });
    expect(peekLastUsage()).toBeNull();
    expect(consumeLastUsage()).toBeNull();
  });

  it("nested slots: each slot only sees writes inside its own scope", async () => {
    const outer = createUsageSlot();
    const inner = createUsageSlot();

    await outer.runInSlot(async () => {
      setLastUsage({ inputTokens: 10, outputTokens: 5 });
      await inner.runInSlot(async () => {
        setLastUsage({ inputTokens: 99, outputTokens: 99 });
      });
    });

    expect(outer.getUsage()?.inputTokens).toBe(10);
    expect(inner.getUsage()?.inputTokens).toBe(99);
  });

  it("concurrent slots don't interfere", async () => {
    const a = createUsageSlot();
    const b = createUsageSlot();

    await Promise.all([
      a.runInSlot(async () => {
        await new Promise((r) => setTimeout(r, 5));
        setLastUsage({ inputTokens: 1, outputTokens: 2 });
      }),
      b.runInSlot(async () => {
        await new Promise((r) => setTimeout(r, 1));
        setLastUsage({ inputTokens: 100, outputTokens: 200 });
      })
    ]);

    expect(a.getUsage()?.inputTokens).toBe(1);
    expect(b.getUsage()?.inputTokens).toBe(100);
  });
});
