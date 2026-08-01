/**
 * The pieces that hold whoever wrote the handle: bounds, stickiness,
 * cancellation, the allowed-set rules, redaction, and the substitute validator.
 *
 * See docs/workflow-supervisor-design.md §5.3, §5.4, §5.5, §6, §6.1.
 */

import { describe, it, expect, vi } from "vitest";
import type { Escalation, Verdict } from "@nodetool-ai/protocol";
import {
  BoundedHandle,
  FailClosedHandle,
  computeAllowedActions,
  failureSignature,
  redactRecord,
  redactValue,
  type DecisionOutcome,
  type SupervisorHandle
} from "../src/supervisor.js";
import {
  validateSubstituteOutputs,
  hasFullValidatorCoverage
} from "../src/substitute-validator.js";
import { Graph } from "../src/graph.js";

function escalation(over: Partial<Escalation> = {}): Escalation {
  return {
    nodeId: "n1",
    nodeType: "test.Work",
    correlationLineage: [],
    invocationKey: "",
    allowedActions: ["retry", "skip", "fail"],
    detail: "boom",
    inputs: {},
    attempt: 1,
    spentCostUsd: 0,
    createdAssets: false,
    retrySafe: true,
    emitted: false,
    ...over
  };
}

function handleReturning(
  verdict: Verdict | (() => Promise<Verdict>)
): SupervisorHandle & { calls: number } {
  return {
    calls: 0,
    async decide(): Promise<DecisionOutcome> {
      this.calls++;
      const v = typeof verdict === "function" ? await verdict() : verdict;
      return { verdict: v, decidedBy: "agent" };
    },
    close() {}
  };
}

const never = new AbortController().signal;

describe("BoundedHandle — decisions and retries are capped", () => {
  it("degrades to a deterministic fail past maxDecisions", async () => {
    const inner = handleReturning({ action: "skip" });
    const bounded = new BoundedHandle(inner, { maxDecisions: 2 });

    expect((await bounded.decide(escalation(), never)).verdict.action).toBe(
      "skip"
    );
    expect((await bounded.decide(escalation(), never)).verdict.action).toBe(
      "skip"
    );

    const third = await bounded.decide(escalation(), never);
    expect(third.verdict.action).toBe("fail");
    expect(third.decidedBy).toBe("bounds");
    expect(inner.calls).toBe(2);
  });

  it("counts retries per invocation, not per node", async () => {
    const inner = handleReturning({ action: "retry" });
    const bounded = new BoundedHandle(inner, { maxRetriesPerNode: 1 });

    const a = escalation({ invocationKey: "fe:items=0" });
    const b = escalation({ invocationKey: "fe:items=1" });

    expect((await bounded.decide(a, never)).verdict.action).toBe("retry");
    expect((await bounded.decide(b, never)).verdict.action).toBe("retry");

    const exhausted = await bounded.decide(a, never);
    expect(exhausted.verdict.action).toBe("fail");
    expect(exhausted.decidedBy).toBe("bounds");
  });

  it("resolves a supervisor exception as fail", async () => {
    const bounded = new BoundedHandle({
      async decide(): Promise<DecisionOutcome> {
        throw new Error("provider down");
      },
      close() {}
    });
    const decision = await bounded.decide(escalation(), never);
    expect(decision.verdict.action).toBe("fail");
    expect(decision.decidedBy).toBe("bounds");
  });

  it("fails a decision that outlives its timeout", async () => {
    vi.useFakeTimers();
    try {
      const bounded = new BoundedHandle(
        handleReturning(
          () =>
            new Promise<Verdict>((r) =>
              setTimeout(() => r({ action: "skip" }), 5_000)
            )
        ),
        { decisionTimeoutMs: 1_000 }
      );
      const pending = bounded.decide(escalation(), never);
      await vi.advanceTimersByTimeAsync(5_000);
      const decision = await pending;
      expect(decision.verdict.action).toBe("fail");
      expect(decision.decidedBy).toBe("bounds");
    } finally {
      vi.useRealTimers();
    }
  });

  it("passes an already-aborted run signal straight through to the handle", async () => {
    const seen: AbortSignal[] = [];
    const bounded = new BoundedHandle({
      async decide(_e, signal): Promise<DecisionOutcome> {
        seen.push(signal);
        return { verdict: { action: "skip" }, decidedBy: "agent" };
      },
      close() {}
    });
    const cancelled = AbortSignal.abort();
    const decision = await bounded.decide(escalation(), cancelled);
    expect(seen[0].aborted).toBe(true);
    // A verdict decided against a run that is already over is not applied.
    expect(decision.verdict.action).toBe("fail");
  });

  it("serializes decisions", async () => {
    const order: string[] = [];
    let resolveFirst: (() => void) | undefined;
    const bounded = new BoundedHandle({
      async decide(e): Promise<DecisionOutcome> {
        order.push(`start:${e.nodeId}`);
        if (e.nodeId === "slow") {
          await new Promise<void>((r) => (resolveFirst = r));
        }
        order.push(`end:${e.nodeId}`);
        return { verdict: { action: "skip" }, decidedBy: "agent" };
      },
      close() {}
    });

    const first = bounded.decide(escalation({ nodeId: "slow" }), never);
    const second = bounded.decide(escalation({ nodeId: "fast" }), never);
    await vi.waitFor(() => expect(resolveFirst).toBeDefined());
    resolveFirst!();
    await Promise.all([first, second]);

    expect(order).toEqual(["start:slow", "end:slow", "start:fast", "end:fast"]);
  });
});

describe("BoundedHandle — sticky verdicts", () => {
  it("resolves later matching failures without waking the agent", async () => {
    const inner = handleReturning({ action: "skip", applyTo: "signature" });
    const bounded = new BoundedHandle(inner);
    const e = () => escalation({ failureSignature: "http:403" });

    const first = await bounded.decide(e(), never);
    expect(first.decidedBy).toBe("agent");

    for (let i = 0; i < 6; i++) {
      const later = await bounded.decide(e(), never);
      expect(later.verdict.action).toBe("skip");
      expect(later.decidedBy).toBe("sticky");
    }
    // Seven identical failures, one decision.
    expect(inner.calls).toBe(1);
  });

  it("does not let one signature's verdict answer another's", async () => {
    const inner = handleReturning({ action: "skip", applyTo: "signature" });
    const bounded = new BoundedHandle(inner);
    await bounded.decide(escalation({ failureSignature: "http:403" }), never);
    await bounded.decide(escalation({ failureSignature: "http:504" }), never);
    expect(inner.calls).toBe(2);
  });

  it("never sticks a retry or a substitute", async () => {
    const inner = handleReturning({ action: "retry" });
    const bounded = new BoundedHandle(inner, { maxRetriesPerNode: 10 });
    const e = () => escalation({ failureSignature: "http:429" });
    await bounded.decide(e(), never);
    await bounded.decide(e(), never);
    expect(inner.calls).toBe(2);
  });

  it("has nothing to key on without a signature", async () => {
    const inner = handleReturning({ action: "skip", applyTo: "signature" });
    const bounded = new BoundedHandle(inner);
    await bounded.decide(escalation(), never);
    await bounded.decide(escalation(), never);
    expect(inner.calls).toBe(2);
  });
});

describe("FailClosedHandle", () => {
  it("is today's behavior", async () => {
    const decision = await new FailClosedHandle().decide();
    expect(decision).toEqual({
      verdict: { action: "fail" },
      decidedBy: "default"
    });
  });
});

describe("allowed actions", () => {
  const base = {
    retrySafe: true,
    spentCostUsd: 0,
    createdAssets: false,
    hasCandidateOutput: false,
    validatorCoverage: true,
    streamingOutput: false,
    streamingInput: false,
    emitted: false
  };

  it("offers retry only to a node that opted in, spent nothing, wrote nothing", () => {
    expect(computeAllowedActions(base)).toContain("retry");
    expect(computeAllowedActions({ ...base, retrySafe: false })).not.toContain(
      "retry"
    );
    expect(
      computeAllowedActions({ ...base, spentCostUsd: 0.01 })
    ).not.toContain("retry");
    expect(
      computeAllowedActions({ ...base, createdAssets: true })
    ).not.toContain("retry");
  });

  it("offers substitute only with the broken value in hand", () => {
    expect(computeAllowedActions(base)).not.toContain("substitute");
    expect(
      computeAllowedActions({ ...base, hasCandidateOutput: true })
    ).toContain("substitute");
  });

  it("withholds substitute when some declared output cannot be validated", () => {
    expect(
      computeAllowedActions({
        ...base,
        hasCandidateOutput: true,
        validatorCoverage: false
      })
    ).not.toContain("substitute");
  });

  it("never offers substitute for a stream", () => {
    expect(
      computeAllowedActions({
        ...base,
        streamingOutput: true,
        hasCandidateOutput: true
      })
    ).not.toContain("substitute");
  });

  it("gives a mid-stream failure end_stream, and a pre-emit one retry", () => {
    expect(
      computeAllowedActions({ ...base, streamingOutput: true, emitted: true })
    ).toEqual(["end_stream", "fail"]);
    expect(computeAllowedActions({ ...base, streamingOutput: true })).toEqual([
      "retry",
      "skip",
      "fail"
    ]);
  });

  it("gives a run() node exactly end_stream and fail", () => {
    expect(computeAllowedActions({ ...base, streamingInput: true })).toEqual([
      "end_stream",
      "fail"
    ]);
  });

  it("always leaves skip and fail reachable outside streaming", () => {
    const actions = computeAllowedActions({ ...base, retrySafe: false });
    expect(actions).toEqual(["skip", "fail"]);
  });
});

describe("failure signatures", () => {
  it("reads a stable categorical code", () => {
    expect(
      failureSignature(Object.assign(new Error("x"), { status: 429 }))
    ).toBe("http:429");
    expect(
      failureSignature(Object.assign(new Error("x"), { code: "rate_limited" }))
    ).toBe("code:rate_limited");
    expect(
      failureSignature(
        Object.assign(new Error("x"), { response: { status: 503 } })
      )
    ).toBe("http:503");
  });

  it("gives a plain Error none — error class is not a category", () => {
    expect(failureSignature(new Error("item 147 timed out"))).toBeUndefined();
    expect(failureSignature(new TypeError("nope"))).toBeUndefined();
    expect(failureSignature("a string")).toBeUndefined();
  });
});

describe("redaction", () => {
  const secrets = new Set(["sk-live-0123456789"]);

  it("masks a secret wherever it appears", () => {
    expect(
      redactValue("GET https://api.test?key=sk-live-0123456789", secrets)
    ).toBe("GET https://api.test?key=«redacted»");
    expect(
      redactValue(
        { headers: { "x-custom": "Bearer sk-live-0123456789" } },
        secrets
      )
    ).toEqual({ headers: { "x-custom": "Bearer «redacted»" } });
  });

  it("drops sensitive-named fields whatever they hold", () => {
    expect(
      redactRecord(
        {
          password: "hunter2",
          api_key: "abc",
          Authorization: "x",
          prompt: "hi"
        },
        new Set()
      )
    ).toEqual({
      password: "«redacted»",
      api_key: "«redacted»",
      Authorization: "«redacted»",
      prompt: "hi"
    });
  });

  it("drops actor-internal fields", () => {
    expect(redactRecord({ _control_context: {}, a: 1 }, new Set())).toEqual({
      a: 1
    });
  });

  it("truncates instead of carrying a payload", () => {
    const long = redactValue("x".repeat(5000), new Set()) as string;
    expect(long.length).toBeLessThan(2100);
    expect(long.endsWith("…[truncated]")).toBe(true);
  });

  it("summarizes binary rather than stringifying it", () => {
    expect(redactValue(new Uint8Array(1024), new Set())).toBe("«1024 bytes»");
  });
});

describe("substitute validator", () => {
  it("checks values, not declared type compatibility", async () => {
    const ok = await validateSubstituteOutputs(
      { text: "hello", count: 3 },
      { declaredOutputs: { text: "str", count: "int" } }
    );
    expect(ok.ok).toBe(true);

    const bad = await validateSubstituteOutputs(
      { count: 3.5 },
      { declaredOutputs: { count: "int" } }
    );
    expect(bad.ok).toBe(false);
    expect(bad.issues[0]).toContain("integer");
  });

  it("rejects a fabricated reference whose uri does not resolve", async () => {
    const result = await validateSubstituteOutputs(
      { img: { type: "image", uri: "https://invented.example/x.png" } },
      {
        declaredOutputs: { img: "image" },
        resolveRef: async () => false
      }
    );
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toContain("does not resolve");
  });

  it("accepts a reference that resolves against run storage", async () => {
    const result = await validateSubstituteOutputs(
      { img: { type: "image", uri: "asset://real" } },
      { declaredOutputs: { img: "image" }, resolveRef: async () => true }
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a reference when the run cannot resolve references at all", async () => {
    const result = await validateSubstituteOutputs(
      { img: { type: "image", uri: "asset://real" } },
      { declaredOutputs: { img: "image" } }
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an output the node never declared", async () => {
    const result = await validateSubstituteOutputs(
      { surprise: 1 },
      { declaredOutputs: { value: "str" } }
    );
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toContain("not declared");
  });

  it("reports coverage so an unvalidatable node is never offered substitute", () => {
    expect(hasFullValidatorCoverage({ a: "str", b: "list[int]" }, false)).toBe(
      true
    );
    expect(hasFullValidatorCoverage({ a: "image" }, false)).toBe(false);
    expect(hasFullValidatorCoverage({ a: "image" }, true)).toBe(true);
    expect(hasFullValidatorCoverage({ a: "custom.Thing" }, true)).toBe(false);
    expect(hasFullValidatorCoverage({}, true)).toBe(false);
  });
});

describe("graph hydration — retry safety comes from the registry", () => {
  it("ignores a saved retry_safe a node's class never declared", async () => {
    // Graph JSON is data. Whether re-running a node duplicates a payment is a
    // property of its implementation, so a file claiming redo-safety must not
    // be able to grant it.
    const graph = await Graph.loadFromDict(
      {
        nodes: [{ id: "n1", type: "test.Writer", retry_safe: true }],
        edges: []
      },
      {
        resolver: async () => ({
          nodeType: "test.Writer",
          descriptorDefaults: {}
        })
      }
    );
    expect(graph.nodes[0].retry_safe).toBe(false);
  });

  it("takes retry_safe from the registry when the class declares it", async () => {
    const graph = await Graph.loadFromDict(
      { nodes: [{ id: "n1", type: "test.Pure" }], edges: [] },
      {
        resolver: async () => ({
          nodeType: "test.Pure",
          descriptorDefaults: { retry_safe: true }
        })
      }
    );
    expect(graph.nodes[0].retry_safe).toBe(true);
  });
});
