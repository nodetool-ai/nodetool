/**
 * Coverage tests for tracing-helpers: the tracer-ENABLED span paths
 * (success, error, generator cancel), attribute building/truncation, the
 * request-payload slot API, and modality capture.
 *
 * `getTracer` is mocked so we can drive both the "no tracer" and
 * "tracer active" branches deterministically without a real OTel SDK.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ tracer: null as unknown }));

vi.mock("../src/telemetry.js", () => ({
  getTracer: () => h.tracer
}));

import {
  withAgentSpan,
  withWorkflowSpan,
  withNodeSpan,
  withSpanGen,
  withAgentSpanGen,
  withUsageCapture,
  setLastUsage,
  setLastRequest,
  peekLastUsage,
  peekLastRequest,
  consumeLastUsage,
  createUsageSlot,
  withModalityCapture
} from "../src/tracing-helpers.js";

interface FakeSpan {
  name: string;
  attributes: Record<string, unknown>;
  status?: { code: number; message?: string };
  exceptions: unknown[];
  ended: boolean;
  setAttribute(k: string, v: unknown): void;
  setStatus(s: { code: number; message?: string }): void;
  recordException(e: unknown): void;
  end(): void;
  spanContext(): { traceId: string; spanId: string; traceFlags: number };
  isRecording(): boolean;
}

function makeSpan(name: string): FakeSpan {
  return {
    name,
    attributes: {},
    exceptions: [],
    ended: false,
    setAttribute(k, v) {
      this.attributes[k] = v;
    },
    setStatus(s) {
      this.status = s;
    },
    recordException(e) {
      this.exceptions.push(e);
    },
    end() {
      this.ended = true;
    },
    spanContext() {
      return { traceId: "0".repeat(32), spanId: "0".repeat(16), traceFlags: 1 };
    },
    isRecording() {
      return true;
    }
  };
}

function makeTracer(spans: FakeSpan[]) {
  return {
    // startActiveSpan(name, [options], [context], fn)
    startActiveSpan(name: string, ...rest: unknown[]) {
      const fn = rest[rest.length - 1] as (span: FakeSpan) => unknown;
      const span = makeSpan(name);
      spans.push(span);
      return fn(span);
    },
    startSpan(name: string) {
      const span = makeSpan(name);
      spans.push(span);
      return span;
    }
  };
}

beforeEach(() => {
  h.tracer = null;
});

describe("withSpan (tracer active)", () => {
  it("wraps a successful node span: attributes set, status OK, span ended", async () => {
    const spans: FakeSpan[] = [];
    h.tracer = makeTracer(spans);

    const result = await withNodeSpan(
      {
        nodeId: "n1",
        nodeType: "Constant",
        workflowId: "wf-9",
        extra: { "custom.attr": 7, skipped: undefined }
      },
      async (span) => {
        expect(span).not.toBeNull();
        return "ok";
      }
    );

    expect(result).toBe("ok");
    expect(spans).toHaveLength(1);
    const s = spans[0];
    expect(s.name).toBe("node.process");
    expect(s.attributes["node.id"]).toBe("n1");
    expect(s.attributes["node.type"]).toBe("Constant");
    expect(s.attributes["workflow.id"]).toBe("wf-9");
    expect(s.attributes["custom.attr"]).toBe(7);
    // undefined attribute values are filtered out by setAttributes
    expect("skipped" in s.attributes).toBe(false);
    expect(s.status).toEqual({ code: 1 /* OK */ });
    expect(s.ended).toBe(true);
  });

  it("records exception and ERROR status then rethrows on failure", async () => {
    const spans: FakeSpan[] = [];
    h.tracer = makeTracer(spans);

    const boom = new Error("kaboom");
    await expect(
      withWorkflowSpan(
        { workflowId: "wf-1", workflowName: "W", nodeCount: 3 },
        async () => {
          throw boom;
        }
      )
    ).rejects.toThrow("kaboom");

    const s = spans[0];
    expect(s.name).toBe("workflow.run");
    expect(s.attributes["workflow.id"]).toBe("wf-1");
    expect(s.attributes["workflow.name"]).toBe("W");
    expect(s.attributes["workflow.node_count"]).toBe(3);
    expect(s.status?.code).toBe(2 /* ERROR */);
    expect(s.status?.message).toContain("kaboom");
    expect(s.exceptions).toContain(boom);
    expect(s.ended).toBe(true);
  });

  it("builds agent attributes, truncating long objective/task to 1000 chars", async () => {
    const spans: FakeSpan[] = [];
    h.tracer = makeTracer(spans);

    const longObjective = "x".repeat(1500);
    await withAgentSpan(
      "plan",
      {
        objective: longObjective,
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        task: "y".repeat(2000),
        toolsCount: 4,
        extra: { "agent.custom": "z" }
      },
      async () => undefined
    );

    const s = spans[0];
    expect(s.name).toBe("agent.plan");
    expect(s.attributes["agent.kind"]).toBe("plan");
    expect(s.attributes["agent.provider"]).toBe("anthropic");
    expect(s.attributes["agent.model"]).toBe("claude-sonnet-4-6");
    expect(s.attributes["agent.tools_count"]).toBe(4);
    expect(s.attributes["agent.custom"]).toBe("z");
    const obj = s.attributes["agent.objective"] as string;
    expect(obj).toHaveLength(1000);
    expect(obj.endsWith("…")).toBe(true);
    const task = s.attributes["agent.task"] as string;
    expect(task).toHaveLength(1000);
    expect(task.endsWith("…")).toBe(true);
  });

  it("does not truncate short strings", async () => {
    const spans: FakeSpan[] = [];
    h.tracer = makeTracer(spans);
    await withAgentSpan("step", { objective: "short" }, async () => undefined);
    expect(spans[0].attributes["agent.objective"]).toBe("short");
  });
});

describe("withSpanGen (tracer active)", () => {
  it("yields all values, preserves TReturn, sets OK, ends span", async () => {
    const spans: FakeSpan[] = [];
    h.tracer = makeTracer(spans);

    async function* gen(): AsyncGenerator<number, string> {
      yield 1;
      yield 2;
      return "fin";
    }
    const yielded: number[] = [];
    const wrapped = withSpanGen<number, string>("test.gen", { a: 1 }, () =>
      gen()
    );
    let r = await wrapped.next();
    while (!r.done) {
      yielded.push(r.value);
      r = await wrapped.next();
    }
    expect(yielded).toEqual([1, 2]);
    expect(r.value).toBe("fin");
    const s = spans[0];
    expect(s.attributes["a"]).toBe(1);
    expect(s.status?.code).toBe(1 /* OK */);
    expect(s.ended).toBe(true);
  });

  it("records exception and ERROR status when the generator throws", async () => {
    const spans: FakeSpan[] = [];
    h.tracer = makeTracer(spans);

    async function* gen(): AsyncGenerator<number> {
      yield 1;
      throw new Error("gen-boom");
    }
    const wrapped = withAgentSpanGen("execute", { objective: "o" }, () => gen());
    await wrapped.next();
    await expect(wrapped.next()).rejects.toThrow("gen-boom");
    const s = spans[0];
    expect(s.status?.code).toBe(2 /* ERROR */);
    expect(s.exceptions).toHaveLength(1);
    expect(s.ended).toBe(true);
  });

  it("invokes the inner generator return() on early cancel and ends the span", async () => {
    const spans: FakeSpan[] = [];
    h.tracer = makeTracer(spans);

    let cleanup = false;
    async function* gen(): AsyncGenerator<number> {
      try {
        yield 1;
        yield 2;
      } finally {
        cleanup = true;
      }
    }
    for await (const _v of withSpanGen("test.cancel", {}, () => gen())) {
      break;
    }
    expect(cleanup).toBe(true);
    expect(spans[0].ended).toBe(true);
  });
});

describe("request-payload + usage slot API", () => {
  it("withUsageCapture: peek/consume usage and request inside the slot", async () => {
    await withUsageCapture(async () => {
      setLastUsage({ inputTokens: 5, outputTokens: 6, cost: 0.01 });
      setLastRequest({ model: "m", messages: [] });

      expect(peekLastUsage()).toEqual({
        inputTokens: 5,
        outputTokens: 6,
        cost: 0.01
      });
      expect(peekLastRequest()).toEqual({ model: "m", messages: [] });

      // consume clears usage but leaves the request payload intact
      expect(consumeLastUsage()).toEqual({
        inputTokens: 5,
        outputTokens: 6,
        cost: 0.01
      });
      expect(peekLastUsage()).toBeNull();
      expect(peekLastRequest()).toEqual({ model: "m", messages: [] });
    });
  });

  it("setLastRequest / peekLastRequest are no-ops outside any slot", () => {
    setLastRequest({ nope: true });
    expect(peekLastRequest()).toBeNull();
  });

  it("createUsageSlot.getRequest returns what was recorded via runInSlot", async () => {
    const { runInSlot, getRequest, getUsage } = createUsageSlot();
    expect(getRequest()).toBeNull();
    await runInSlot(async () => {
      setLastRequest({ prompt: "hi" });
      setLastUsage({ inputTokens: 1, outputTokens: 2 });
    });
    expect(getRequest()).toEqual({ prompt: "hi" });
    expect(getUsage()).toEqual({ inputTokens: 1, outputTokens: 2 });
  });
});

describe("withModalityCapture", () => {
  it("passes alreadyActive=false at the outermost call and true when nested", async () => {
    let outer: boolean | undefined;
    let inner: boolean | undefined;

    await withModalityCapture(async (a) => {
      outer = a;
      // request/usage hooks work inside a modality slot too
      setLastRequest({ image: "prompt" });
      expect(peekLastRequest()).toEqual({ image: "prompt" });
      await withModalityCapture(async (b) => {
        inner = b;
        // nested call reuses the parent slot
        expect(peekLastRequest()).toEqual({ image: "prompt" });
      });
    });

    expect(outer).toBe(false);
    expect(inner).toBe(true);
  });

  it("returns the callback's resolved value", async () => {
    const v = await withModalityCapture(async () => "done");
    expect(v).toBe("done");
  });
});
