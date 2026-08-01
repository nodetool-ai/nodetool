/**
 * The escalation hook, end to end through the runner.
 *
 * Every verdict is driven by a scripted `SupervisorHandle` — no LLM is
 * involved anywhere in this file. What is under test is the kernel's half of
 * the contract: that a verdict does what it says, that the kernel enforces its
 * own allowed set against a hostile handle, that a skip actually unblocks the
 * graph, and that an unsupervised run is untouched.
 *
 * See docs/workflow-supervisor-design.md §5.
 */

import { describe, it, expect } from "vitest";
import { isProcessingMessage } from "@nodetool-ai/protocol";
import type { Escalation, Verdict } from "@nodetool-ai/protocol";
import { WorkflowRunner, type RunResult } from "../src/runner.js";
import { NodeActor, type NodeExecutor } from "../src/actor.js";
import { NodeInbox } from "../src/inbox.js";
import type { DecisionOutcome, SupervisorHandle } from "../src/supervisor.js";
import { ProcessingContext } from "@nodetool-ai/runtime";
import type { Edge, NodeDescriptor } from "@nodetool-ai/protocol";

/** A handle that answers from a script and records what it was asked. */
class ScriptedHandle implements SupervisorHandle {
  readonly seen: Escalation[] = [];
  constructor(
    private readonly script: (e: Escalation, n: number) => Verdict | undefined
  ) {}
  async decide(e: Escalation): Promise<DecisionOutcome> {
    this.seen.push(e);
    const verdict = this.script(e, this.seen.length) ?? { action: "fail" };
    return { verdict, decidedBy: "agent", costUsd: 0.01 };
  }
  close(): void {}
}

function runGraph(opts: {
  nodes: NodeDescriptor[];
  edges: Edge[];
  executors: Record<string, NodeExecutor>;
  supervisor?: SupervisorHandle;
  params?: Record<string, unknown>;
  context?: ProcessingContext;
}): Promise<RunResult> {
  const runner = new WorkflowRunner("supervisor-test", {
    resolveExecutor: (node) =>
      opts.executors[node.id] ?? {
        // Default: echo inputs, so an Output node collects what reached it.
        async process(ins) {
          return ins;
        }
      },
    supervisor: opts.supervisor,
    executionContext: opts.context
  });
  return runner.run(
    { job_id: "supervisor-test", params: opts.params ?? {} },
    { nodes: opts.nodes, edges: opts.edges }
  );
}

/** input → work → output, where `work` is the node under test. */
function chain(work: Partial<NodeDescriptor> = {}): {
  nodes: NodeDescriptor[];
  edges: Edge[];
} {
  return {
    nodes: [
      { id: "input", type: "test.Input", name: "x" },
      { id: "work", type: "test.Work", outputs: { value: "str" }, ...work },
      { id: "out", type: "nodetool.output.Output", name: "result" }
    ],
    edges: [
      {
        source: "input",
        sourceHandle: "value",
        target: "work",
        targetHandle: "a"
      },
      {
        source: "work",
        sourceHandle: "value",
        target: "out",
        targetHandle: "value"
      }
    ]
  };
}

describe("supervisor — zero cost on clean runs", () => {
  it("an unsupervised failing run is unchanged", async () => {
    const graph = chain();
    const result = await runGraph({
      ...graph,
      params: { x: "hi" },
      executors: {
        work: {
          async process() {
            throw new Error("boom");
          }
        }
      }
    });
    expect(result.status).toBe("failed");
    expect(result.interventions).toBeUndefined();
  });

  it("a clean supervised run never wakes the supervisor", async () => {
    const handle = new ScriptedHandle(() => ({ action: "fail" }));
    const graph = chain();
    const result = await runGraph({
      ...graph,
      params: { x: "hi" },
      executors: {
        work: {
          async process(ins) {
            return { value: `${ins.a}!` };
          }
        }
      },
      supervisor: handle
    });
    expect(result.status).toBe("completed");
    expect(handle.seen).toHaveLength(0);
    expect(result.interventions).toBeUndefined();
    expect(
      result.messages.filter((m) => m.type.startsWith("supervisor_"))
    ).toHaveLength(0);
  });

  it("the message stream matches an unsupervised run message for message", async () => {
    const graph = chain();
    const executors = {
      work: {
        async process(ins: Record<string, unknown>) {
          return { value: `${ins.a}!` };
        }
      }
    };
    const bare = await runGraph({ ...graph, params: { x: "hi" }, executors });
    const supervised = await runGraph({
      ...graph,
      params: { x: "hi" },
      executors,
      supervisor: new ScriptedHandle(() => ({ action: "fail" }))
    });
    expect(supervised.messages.map((m) => m.type)).toEqual(
      bare.messages.map((m) => m.type)
    );
    expect(supervised.outputs).toEqual(bare.outputs);
  });
});

describe("supervisor — retry", () => {
  it("re-invokes with identical inputs and properties", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const graph = chain({ retry_safe: true, properties: { mode: "strict" } });
    const result = await runGraph({
      ...graph,
      params: { x: "hi" },
      executors: {
        work: {
          async process(ins) {
            calls.push({ ...ins });
            if (calls.length === 1) throw new Error("transient");
            return { value: "ok" };
          }
        }
      },
      supervisor: new ScriptedHandle(() => ({ action: "retry" }))
    });

    expect(result.status).toBe("completed");
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
    expect(calls[1].mode).toBe("strict");
    expect(result.outputs.result).toEqual(["ok"]);
    expect(result.interventions).toHaveLength(1);
    expect(result.interventions![0].verdict.action).toBe("retry");
  });

  it("counts attempts per invocation", async () => {
    const handle = new ScriptedHandle((_, n) =>
      n < 3 ? { action: "retry" } : { action: "skip" }
    );
    const graph = chain({ retry_safe: true });
    await runGraph({
      ...graph,
      params: { x: "hi" },
      executors: {
        work: {
          async process() {
            throw new Error("always");
          }
        }
      },
      supervisor: handle
    });
    expect(handle.seen.map((e) => e.attempt)).toEqual([1, 2, 3]);
  });

  it("is not offered to a node that never declared itself retry-safe", async () => {
    const handle = new ScriptedHandle(() => ({ action: "retry" }));
    const graph = chain(); // no retry_safe
    let calls = 0;
    const result = await runGraph({
      ...graph,
      params: { x: "hi" },
      executors: {
        work: {
          async process() {
            calls++;
            throw new Error("boom");
          }
        }
      },
      supervisor: handle
    });

    expect(handle.seen[0].allowedActions).not.toContain("retry");
    // The hostile verdict is rejected by the kernel, not merely absent from a
    // schema: one invocation, and the run fails.
    expect(calls).toBe(1);
    expect(result.status).toBe("failed");
    expect(result.interventions![0].verdict.action).toBe("fail");
    // The record credits the kernel, not the handle. Crediting the handle
    // would hide the case worth finding: a supervisor that answered outside
    // the allowed set.
    expect(result.interventions![0].decidedBy).toBe("kernel");
  });

  it("is not offered once the invocation spent money", async () => {
    const handle = new ScriptedHandle(() => ({ action: "retry" }));
    const context = new ProcessingContext({ jobId: "supervisor-test" });
    const graph = chain({ retry_safe: true });
    await runGraph({
      ...graph,
      params: { x: "hi" },
      context,
      executors: {
        work: {
          async process(_ins, ctx) {
            (ctx as ProcessingContext).setProviderCost("fal", 0.42, "usd");
            throw new Error("after the charge");
          }
        }
      },
      supervisor: handle
    });
    expect(handle.seen[0].spentCostUsd).toBe(0.42);
    expect(handle.seen[0].allowedActions).not.toContain("retry");
  });

  it("attributes concurrent invocations that finish in reverse order", async () => {
    // Two independent branches: the slow one is charged first but completes
    // last. A stack on the shared context would credit its charge to the other.
    const seen = new Map<string, number>();
    const handle = new ScriptedHandle((e) => {
      seen.set(e.nodeId, e.spentCostUsd);
      return { action: "skip" };
    });
    const context = new ProcessingContext({ jobId: "supervisor-test" });
    const nodes: NodeDescriptor[] = [
      { id: "input", type: "test.Input", name: "x" },
      { id: "slow", type: "test.Work", retry_safe: true },
      { id: "fast", type: "test.Work", retry_safe: true },
      { id: "out", type: "nodetool.output.Output", name: "result" }
    ];
    const edges: Edge[] = [
      {
        source: "input",
        sourceHandle: "value",
        target: "slow",
        targetHandle: "a"
      },
      {
        source: "input",
        sourceHandle: "value",
        target: "fast",
        targetHandle: "a"
      },
      {
        source: "slow",
        sourceHandle: "value",
        target: "out",
        targetHandle: "value"
      }
    ];
    const charge = (amount: number, delayMs: number): NodeExecutor => ({
      async process(_ins, ctx) {
        (ctx as ProcessingContext).setProviderCost("fal", amount, "usd");
        await new Promise((r) => setTimeout(r, delayMs));
        throw new Error("late failure");
      }
    });

    await runGraph({
      nodes,
      edges,
      params: { x: "hi" },
      context,
      executors: { slow: charge(1, 20), fast: charge(2, 0) },
      supervisor: handle
    });

    expect(seen.get("slow")).toBe(1);
    expect(seen.get("fast")).toBe(2);
  });
});

describe("supervisor — substitute", () => {
  const recoverable = (candidate: unknown): NodeExecutor => ({
    async process() {
      const { RecoverableNodeError } = await import("@nodetool-ai/runtime");
      throw new RecoverableNodeError("malformed", {
        candidateOutput: candidate,
        code: "parse_error"
      });
    }
  });

  it("emits a validated repair through the normal output path", async () => {
    const graph = chain();
    const result = await runGraph({
      ...graph,
      params: { x: "hi" },
      executors: { work: recoverable('{"value": "broken') },
      supervisor: new ScriptedHandle(() => ({
        action: "substitute",
        outputs: { value: "repaired" }
      }))
    });
    expect(result.status).toBe("completed");
    expect(result.outputs.result).toEqual(["repaired"]);
  });

  it("rejects a repair that does not match the declared output type", async () => {
    const graph = chain();
    const result = await runGraph({
      ...graph,
      params: { x: "hi" },
      executors: { work: recoverable("nope") },
      supervisor: new ScriptedHandle(() => ({
        action: "substitute",
        outputs: { value: { not: "a string" } }
      }))
    });
    expect(result.status).toBe("failed");
  });

  it("is not offered without a candidate output — repair is not invention", async () => {
    const handle = new ScriptedHandle(() => ({ action: "skip" }));
    const graph = chain();
    await runGraph({
      ...graph,
      params: { x: "hi" },
      executors: {
        work: {
          async process() {
            throw new Error("plain");
          }
        }
      },
      supervisor: handle
    });
    expect(handle.seen[0].allowedActions).not.toContain("substitute");
    expect(handle.seen[0].candidateOutput).toBeUndefined();
  });

  it("carries a failure signature only when the error has a stable code", async () => {
    const withCode = new ScriptedHandle(() => ({ action: "skip" }));
    const graph = chain();
    await runGraph({
      ...graph,
      params: { x: "hi" },
      executors: { work: recoverable("x") },
      supervisor: withCode
    });
    expect(withCode.seen[0].failureSignature).toBe("parse_error");

    const plain = new ScriptedHandle(() => ({ action: "skip" }));
    await runGraph({
      ...graph,
      params: { x: "hi" },
      executors: {
        work: {
          async process() {
            throw new Error("item 147 timed out");
          }
        }
      },
      supervisor: plain
    });
    expect(plain.seen[0].failureSignature).toBeUndefined();
  });
});

describe("supervisor — skip", () => {
  it("finishes the run and records what was given up", async () => {
    const graph = chain();
    const result = await runGraph({
      ...graph,
      params: { x: "hi" },
      executors: {
        work: {
          async process() {
            throw new Error("page requires login");
          }
        }
      },
      supervisor: new ScriptedHandle(() => ({ action: "skip" }))
    });
    expect(result.status).toBe("completed");
    expect(result.interventions).toHaveLength(1);
    expect(result.interventions![0].verdict.action).toBe("skip");
    expect(result.interventions![0].escalation.detail).toContain("login");

    // Interventions are data: both halves travel as validatable messages, so
    // audit, replay, and the UI consume one record rather than three features.
    const supervisorMessages = result.messages.filter((m) =>
      m.type.startsWith("supervisor_")
    );
    expect(supervisorMessages.map((m) => m.type)).toEqual([
      "supervisor_escalation",
      "supervisor_decision"
    ]);
    for (const message of supervisorMessages) {
      expect(isProcessingMessage(message)).toBe(true);
    }
  });

  it("unblocks a downstream join whose other input already arrived", async () => {
    // `join` needs both handles. Without the skip's `lineage_done` it would
    // sit on the buffered `left` value forever.
    const nodes: NodeDescriptor[] = [
      { id: "input", type: "test.Input", name: "x" },
      { id: "left", type: "test.Work", outputs: { value: "str" } },
      { id: "right", type: "test.Work", outputs: { value: "str" } },
      { id: "join", type: "test.Join", outputs: { value: "str" } },
      { id: "out", type: "nodetool.output.Output", name: "result" }
    ];
    const edges: Edge[] = [
      {
        source: "input",
        sourceHandle: "value",
        target: "left",
        targetHandle: "a"
      },
      {
        source: "input",
        sourceHandle: "value",
        target: "right",
        targetHandle: "a"
      },
      {
        source: "left",
        sourceHandle: "value",
        target: "join",
        targetHandle: "l"
      },
      {
        source: "right",
        sourceHandle: "value",
        target: "join",
        targetHandle: "r"
      },
      {
        source: "join",
        sourceHandle: "value",
        target: "out",
        targetHandle: "value"
      }
    ];
    const joinInputs: Array<Record<string, unknown>> = [];
    const result = await runGraph({
      nodes,
      edges,
      params: { x: "hi" },
      executors: {
        left: {
          async process(ins) {
            return { value: `L:${ins.a}` };
          }
        },
        right: {
          async process() {
            throw new Error("right is gone");
          }
        },
        join: {
          async process(ins) {
            joinInputs.push({ ...ins });
            return { value: `${ins.l}+${ins.r}` };
          }
        }
      },
      supervisor: new ScriptedHandle(() => ({ action: "skip" }))
    });

    // The run terminates instead of parking on an input that will never come,
    // and the join sees the skipped handle as absent rather than as a value.
    expect(result.status).toBe("completed");
    expect(joinInputs).toHaveLength(1);
    expect(joinInputs[0].l).toBe("L:hi");
    expect(joinInputs[0].r).toBeUndefined();
  });
});

describe("supervisor — the kernel enforces its own allowed set", () => {
  it("rejects a verdict the escalation never offered", async () => {
    const hostile: SupervisorHandle = {
      async decide(): Promise<DecisionOutcome> {
        return {
          verdict: { action: "retry" },
          decidedBy: "agent"
        };
      },
      close() {}
    };
    let calls = 0;
    const graph = chain(); // not retry-safe
    const result = await runGraph({
      ...graph,
      params: { x: "hi" },
      executors: {
        work: {
          async process() {
            calls++;
            throw new Error("boom");
          }
        }
      },
      supervisor: hostile
    });
    expect(calls).toBe(1);
    expect(result.status).toBe("failed");
  });

  it("resolves a throwing supervisor as fail", async () => {
    const broken: SupervisorHandle = {
      async decide(): Promise<DecisionOutcome> {
        throw new Error("supervisor is down");
      },
      close() {}
    };
    const graph = chain({ retry_safe: true });
    const result = await runGraph({
      ...graph,
      params: { x: "hi" },
      executors: {
        work: {
          async process() {
            throw new Error("boom");
          }
        }
      },
      supervisor: broken
    });
    expect(result.status).toBe("failed");
    expect(result.error).toContain("boom");
  });
});

describe("supervisor — routing failures are not recoverable", () => {
  it("never re-invokes when delivery throws after a partial send", async () => {
    // The recovery loop wraps node execution only. If edge 1 delivered and
    // edge 2 threw, a retry would duplicate edge 1's delivery.
    const nodes: NodeDescriptor[] = [
      { id: "input", type: "test.Input", name: "x" },
      {
        id: "work",
        type: "test.Work",
        retry_safe: true,
        outputs: { value: "str" }
      },
      { id: "first", type: "test.Sink" },
      { id: "second", type: "test.Sink" }
    ];
    const edges: Edge[] = [
      {
        source: "input",
        sourceHandle: "value",
        target: "work",
        targetHandle: "a"
      },
      {
        source: "work",
        sourceHandle: "value",
        target: "first",
        targetHandle: "v"
      },
      {
        source: "work",
        sourceHandle: "value",
        target: "second",
        targetHandle: "v"
      }
    ];
    let invocations = 0;
    let delivered = 0;
    const handle = new ScriptedHandle(() => ({ action: "retry" }));
    const result = await runGraph({
      nodes,
      edges,
      params: { x: "hi" },
      executors: {
        work: {
          async process() {
            invocations++;
            return { value: "v" };
          }
        },
        first: {
          async process() {
            delivered++;
            return {};
          }
        },
        second: {
          async process() {
            throw new Error("downstream exploded");
          }
        }
      },
      supervisor: handle
    });

    expect(invocations).toBe(1);
    expect(delivered).toBe(1);
    // The downstream node's own failure escalates as itself; `work` never
    // re-runs on its behalf, so `first` is not delivered to twice.
    expect(handle.seen.every((e) => e.nodeId !== "work")).toBe(true);
    expect(result.status).toBe("failed");
  });
});

describe("supervisor — the escalation is a redacted record", () => {
  it("never carries a resolved secret, in any emitted message or result", async () => {
    const SECRET = "sk-live-01234567890abcdef";
    const context = new ProcessingContext({ jobId: "supervisor-test" });
    context.setSecretResolver(() => SECRET);

    const graph = chain();
    const handle = new ScriptedHandle(() => ({ action: "skip" }));
    const result = await runGraph({
      ...graph,
      params: { x: "hi" },
      context,
      executors: {
        work: {
          async process(_ins, ctx) {
            const key = await (ctx as ProcessingContext).getSecret("API_KEY");
            throw new Error(
              `request to https://api.example.com?key=${key} failed`
            );
          }
        }
      },
      supervisor: handle
    });

    const serialized = JSON.stringify({
      messages: result.messages,
      interventions: result.interventions,
      seen: handle.seen
    });
    expect(serialized).not.toContain(SECRET);
    expect(handle.seen[0].detail).toContain("«redacted»");
  });

  it("drops sensitive-named inputs whatever they contain", async () => {
    const graph = chain();
    const handle = new ScriptedHandle(() => ({ action: "skip" }));
    await runGraph({
      nodes: graph.nodes.map((n) =>
        n.id === "work"
          ? { ...n, properties: { password: "hunter2", prompt: "summarize" } }
          : n
      ),
      edges: graph.edges,
      params: { x: "hi" },
      executors: {
        work: {
          async process() {
            throw new Error("boom");
          }
        }
      },
      supervisor: handle
    });
    expect(handle.seen[0].inputs.password).toBe("«redacted»");
    expect(handle.seen[0].inputs.prompt).toBe("summarize");
  });
});

describe("supervisor — streaming", () => {
  const streamingNode = (frames: number, throwAfter: number): NodeExecutor => ({
    async process() {
      return {};
    },
    async *genProcess() {
      for (let i = 0; i < frames; i++) {
        if (i === throwAfter) throw new Error("mid-stream");
        yield { value: `chunk-${i}` };
      }
      if (throwAfter >= frames) throw new Error("at end");
    }
  });

  function streamGraph(): { nodes: NodeDescriptor[]; edges: Edge[] } {
    return {
      nodes: [
        { id: "input", type: "test.Input", name: "x" },
        {
          id: "work",
          type: "test.Stream",
          is_streaming_output: true,
          retry_safe: true,
          outputs: { value: "str" }
        },
        { id: "sink", type: "test.Sink", is_streaming_input: true }
      ],
      edges: [
        {
          source: "input",
          sourceHandle: "value",
          target: "work",
          targetHandle: "a"
        },
        {
          source: "work",
          sourceHandle: "value",
          target: "sink",
          targetHandle: "value"
        }
      ]
    };
  }

  /** Streaming sink that records every chunk that actually arrived. */
  function recordingSink(into: unknown[]): NodeExecutor {
    return {
      async process() {
        return {};
      },
      async run(inputs) {
        for await (const value of inputs.stream("value")) {
          into.push(value);
        }
      }
    };
  }

  it("offers retry before the first emit and never a repair", async () => {
    const handle = new ScriptedHandle(() => ({ action: "skip" }));
    await runGraph({
      ...streamGraph(),
      params: { x: "hi" },
      executors: { work: streamingNode(3, 0) },
      supervisor: handle
    });
    expect(handle.seen[0].emitted).toBe(false);
    expect(handle.seen[0].allowedActions).toContain("retry");
    expect(handle.seen[0].allowedActions).not.toContain("substitute");
  });

  it("offers only end_stream and fail once something was emitted", async () => {
    const handle = new ScriptedHandle(() => ({ action: "end_stream" }));
    const received: unknown[] = [];
    const result = await runGraph({
      ...streamGraph(),
      params: { x: "hi" },
      executors: {
        work: streamingNode(5, 2),
        sink: recordingSink(received)
      },
      supervisor: handle
    });
    expect(handle.seen[0].emitted).toBe(true);
    expect(handle.seen[0].allowedActions).toEqual(["end_stream", "fail"]);
    // end_stream keeps what was produced — this is Skip's boundary case, the
    // one the PRD reports as "kept the chunks it had finished".
    expect(result.status).toBe("completed");
    expect(received).toEqual(["chunk-0", "chunk-1"]);
  });

  it("fails the node when routing a frame throws, without escalating", async () => {
    // Straight at the actor, because only the routing callback can fail this
    // way: `sendOutputs` delivers to each outgoing edge in turn, so a retry
    // after a partial send would deliver to the earlier edges twice.
    const handle = new ScriptedHandle(() => ({ action: "retry" }));
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    let streamStarts = 0;

    const actor = new NodeActor({
      node: {
        id: "work",
        type: "test.Stream",
        is_streaming_output: true,
        retry_safe: true,
        outputs: { value: "str" }
      },
      inbox,
      executor: {
        async process() {
          return {};
        },
        async *genProcess() {
          streamStarts++;
          yield { value: "chunk-0" };
        }
      },
      sendOutputs: async () => {
        throw new Error("inbox refused the value");
      },
      emitMessage: () => {},
      correlation: {
        invocationScope: [],
        inputs: new Map(),
        outputs: new Map()
      },
      supervisor: handle
    });

    inbox.put("a", "go");
    inbox.markSourceDone("a");
    const result = await actor.run();

    expect(result.error).toBe("inbox refused the value");
    expect(streamStarts).toBe(1);
    expect(handle.seen).toHaveLength(0);
  });

  it("does not escalate a delivery failure as a node failure", async () => {
    // Frames are routed inside the generator loop, so a downstream delivery
    // error surfaces on the same stack as a genProcess throw. It must still
    // fail the node: re-running the stream would re-deliver earlier frames.
    const handle = new ScriptedHandle(() => ({ action: "retry" }));
    let streamStarts = 0;
    const result = await runGraph({
      ...streamGraph(),
      params: { x: "hi" },
      executors: {
        work: {
          async process() {
            return {};
          },
          async *genProcess() {
            streamStarts++;
            yield { value: "chunk-0" };
            yield { value: "chunk-1" };
          }
        },
        sink: {
          async process() {
            return {};
          },
          async run() {
            throw new Error("sink exploded");
          }
        }
      },
      supervisor: handle
    });

    expect(streamStarts).toBe(1);
    expect(handle.seen.every((e) => e.nodeId !== "work")).toBe(true);
    expect(result.status).toBe("failed");
  });

  it("gives a run() node exactly end_stream and fail", async () => {
    const handle = new ScriptedHandle(() => ({ action: "end_stream" }));
    const nodes: NodeDescriptor[] = [
      { id: "input", type: "test.Input", name: "x" },
      {
        id: "work",
        type: "test.Drain",
        is_streaming_input: true,
        retry_safe: true,
        outputs: { value: "str" }
      }
    ];
    const edges: Edge[] = [
      {
        source: "input",
        sourceHandle: "value",
        target: "work",
        targetHandle: "a"
      }
    ];
    const result = await runGraph({
      nodes,
      edges,
      params: { x: "hi" },
      executors: {
        work: {
          async process() {
            return {};
          },
          async run(inputs) {
            for await (const _ of inputs.stream("a")) {
              throw new Error("drain failed");
            }
          }
        }
      },
      supervisor: handle
    });
    expect(handle.seen[0].allowedActions).toEqual(["end_stream", "fail"]);
    expect(result.status).toBe("completed");
  });
});
