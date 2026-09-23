/**
 * Loop runtime: iteration, termination, and quiescence
 * (docs/workflow-loops.md, "Runtime").
 */

import { describe, expect, it } from "vitest";
import type { Edge, NodeDescriptor, ProcessingMessage } from "@nodetool-ai/protocol";
import { LOOP_NODE_TYPE } from "@nodetool-ai/protocol";
import { WorkflowRunner } from "../../src/runner.js";
import type { NodeExecutor } from "../../src/actor.js";

type Fn = (inputs: Record<string, unknown>) => Record<string, unknown>;

function exec(fn: Fn): NodeExecutor {
  return {
    async process(inputs) {
      return fn(inputs);
    }
  };
}

function node(
  id: string,
  type: string,
  outputs: Record<string, string>,
  properties?: Record<string, unknown>
): NodeDescriptor {
  return { id, type, outputs, properties };
}

const loop = (properties?: Record<string, unknown>) =>
  node("loop", LOOP_NODE_TYPE, { value: "any", index: "int", done: "any" }, properties);

function edge(source: string, sh: string, target: string, th: string): Edge {
  return { source, sourceHandle: sh, target, targetHandle: th };
}

async function run(
  nodes: NodeDescriptor[],
  edges: Edge[],
  executors: Record<string, NodeExecutor>
) {
  const runner = new WorkflowRunner("loop-job", {
    resolveExecutor: (n) => executors[n.id] ?? exec(() => ({}))
  });
  const result = await runner.run({ job_id: "loop-job" }, { nodes, edges });
  const messages: ProcessingMessage[] = result.messages;
  return { result, messages };
}

/** A sink that records every value it receives on `input`. */
function recorder(): { executor: NodeExecutor; seen: unknown[] } {
  const seen: unknown[] = [];
  return {
    seen,
    executor: exec((inputs) => {
      seen.push(inputs.input);
      return {};
    })
  };
}

describe("Loop runtime", () => {
  it("iterates until the condition turns false and emits done", async () => {
    const bodySeen: Array<[unknown, unknown]> = [];
    const out = recorder();
    const nodes = [
      node("start", "test.Const", { output: "int" }, { value: 0 }),
      loop(),
      node("inc", "test.Inc", { output: "int" }),
      node("less", "test.Less", { output: "bool" }),
      node("out", "test.Sink", {})
    ];
    const edges = [
      edge("start", "output", "loop", "initial"),
      edge("loop", "value", "inc", "input"),
      edge("loop", "index", "inc", "index"),
      edge("inc", "output", "loop", "next"),
      edge("inc", "output", "less", "a"),
      edge("less", "output", "loop", "condition"),
      edge("loop", "done", "out", "input")
    ];
    const { result } = await run(nodes, edges, {
      start: exec(() => ({ output: 0 })),
      inc: exec((i) => {
        bodySeen.push([i.input, i.index]);
        return { output: Number(i.input) + 1 };
      }),
      less: exec((i) => ({ output: Number(i.a) < 5 })),
      out: out.executor
    });
    expect(result.status).toBe("completed");
    expect(bodySeen).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4]
    ]);
    expect(out.seen).toEqual([5]);
  });

  it("stops at max_iterations and warns when the condition is still true", async () => {
    const out = recorder();
    const nodes = [
      loop({ initial: 10, max_iterations: 3 }),
      node("inc", "test.Inc", { output: "int", ok: "bool" }),
      node("out", "test.Sink", {})
    ];
    const edges = [
      edge("loop", "value", "inc", "input"),
      edge("inc", "output", "loop", "next"),
      edge("inc", "ok", "loop", "condition"),
      edge("loop", "done", "out", "input")
    ];
    const { result, messages } = await run(nodes, edges, {
      inc: exec((i) => ({ output: Number(i.input) + 1, ok: true })),
      out: out.executor
    });
    expect(result.status).toBe("completed");
    expect(out.seen).toEqual([13]);
    const warning = messages.find(
      (m) => m.type === "node_update" && m.node_id === "loop" && m.status === "warning"
    );
    expect(warning && "error" in warning ? warning.error : "").toMatch(
      /max_iterations \(3\)/
    );
  });

  it("runs exactly max_iterations times when condition is unwired", async () => {
    const out = recorder();
    const nodes = [
      loop({ initial: "", max_iterations: 4 }),
      node("grow", "test.Grow", { output: "str" }),
      node("out", "test.Sink", {})
    ];
    const edges = [
      edge("loop", "value", "grow", "input"),
      edge("grow", "output", "loop", "next"),
      edge("loop", "done", "out", "input")
    ];
    const { result } = await run(nodes, edges, {
      grow: exec((i) => ({ output: `${String(i.input)}a` })),
      out: out.executor
    });
    expect(result.status).toBe("completed");
    expect(out.seen).toEqual(["aaaa"]);
  });

  it("ends without done when the body stops feeding back (exit through an If)", async () => {
    const out = recorder();
    const accepted = recorder();
    const nodes = [
      loop({ initial: 0, max_iterations: 50 }),
      node("inc", "test.Inc", { output: "int" }),
      node("gate", "test.Gate", { retry: "int", accept: "int" }),
      node("accepted", "test.Sink", {}),
      node("out", "test.Sink", {})
    ];
    const edges = [
      edge("loop", "value", "inc", "input"),
      edge("inc", "output", "gate", "input"),
      edge("gate", "retry", "loop", "next"),
      edge("gate", "accept", "accepted", "input"),
      edge("loop", "done", "out", "input")
    ];
    const { result } = await run(nodes, edges, {
      inc: exec((i) => ({ output: Number(i.input) + 1 })),
      // Only the taken branch is emitted, like nodetool.control.If.
      gate: exec((i) =>
        Number(i.input) >= 3 ? { accept: i.input } : { retry: i.input }
      ),
      accepted: accepted.executor,
      out: out.executor
    });
    expect(result.status).toBe("completed");
    expect(accepted.seen).toEqual([3]);
    expect(out.seen).toEqual([]);
  }, 5000);

  it("detects quiescence when the last busy actor exits instead of parking", async () => {
    const accepted = recorder();
    const nodes = [
      loop({ initial: 0, max_iterations: 50 }),
      node("inc", "test.Inc", { output: "int" }),
      node("gate", "test.Gate", { retry: "int", accept: "int" }),
      node("accepted", "test.Sink", {}),
      node("seed", "test.Const", { output: "int" }),
      node("slow", "test.Sink", {})
    ];
    const edges = [
      edge("loop", "value", "inc", "input"),
      edge("inc", "output", "gate", "input"),
      edge("gate", "retry", "loop", "next"),
      edge("gate", "accept", "accepted", "input"),
      edge("seed", "output", "slow", "input")
    ];
    const { result } = await run(nodes, edges, {
      inc: exec((i) => ({ output: Number(i.input) + 1 })),
      gate: exec((i) =>
        Number(i.input) >= 2 ? { accept: i.input } : { retry: i.input }
      ),
      accepted: accepted.executor,
      seed: exec(() => ({ output: 1 })),
      // Busy while the loop stalls, then exits: its only input has closed
      // and it has no outgoing edges, so it never parks again.
      slow: {
        async process() {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return {};
        }
      }
    });
    expect(result.status).toBe("completed");
    expect(accepted.seen).toEqual([2]);
  }, 5000);

  it("ends the run when the body fails instead of hanging", async () => {
    const nodes = [
      loop({ initial: 0, max_iterations: 50 }),
      node("inc", "test.Inc", { output: "int" })
    ];
    const edges = [
      edge("loop", "value", "inc", "input"),
      edge("inc", "output", "loop", "next")
    ];
    const { result } = await run(nodes, edges, {
      inc: exec((i) => {
        if (Number(i.input) === 2) throw new Error("boom");
        return { output: Number(i.input) + 1 };
      })
    });
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/boom/);
  }, 5000);

  it("reuses a value wired into the body from outside on every iteration", async () => {
    const out = recorder();
    const nodes = [
      node("step", "test.Const", { output: "int" }),
      loop({ initial: 1, max_iterations: 4 }),
      node("mul", "test.Mul", { output: "int" }),
      node("out", "test.Sink", {})
    ];
    const edges = [
      edge("step", "output", "mul", "b"),
      edge("loop", "value", "mul", "a"),
      edge("mul", "output", "loop", "next"),
      edge("loop", "done", "out", "input")
    ];
    const { result } = await run(nodes, edges, {
      step: exec(() => ({ output: 3 })),
      mul: exec((i) => ({ output: Number(i.a) * Number(i.b) })),
      out: out.executor
    });
    expect(result.status).toBe("completed");
    expect(out.seen).toEqual([81]);
  });
});
