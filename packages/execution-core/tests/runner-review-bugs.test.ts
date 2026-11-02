/**
 * Regressions from the workflow runner review: cancellation, controlled-node
 * response matching, fan-out output collection, input-node finalize.
 */
import { describe, it, expect } from "vitest";
import { WorkflowRunner } from "../src/runner.js";
import type { NodeDescriptor, Edge } from "@nodetool-ai/protocol";
import type { NodeExecutor } from "../src/actor.js";
import type { SupervisorHandle } from "../src/supervisor.js";

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

describe("cancel() before run()", () => {
  it("does not execute any node", async () => {
    const calls: string[] = [];
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "work", type: "test.Work" },
      { id: "src", type: "test.Source", outputs: { output: "any" } }
    ];
    const edges: Edge[] = [
      { id: "e1", source: "in", sourceHandle: "value", target: "work", targetHandle: "a" }
    ];
    const runner = new WorkflowRunner("j", {
      resolveExecutor: (node) => ({
        async process(inputs) {
          calls.push(node.id);
          return node.id === "in" ? { value: inputs.value } : { output: 1 };
        }
      })
    });
    runner.cancel();
    const result = await runner.run({ job_id: "j", params: { x: 1 } }, { nodes, edges });
    expect(result.status).toBe("cancelled");
    expect(calls.filter((c) => c !== "in")).toEqual([]);
  });
});

describe("cancel() mid-run", () => {
  it("does not fire a waiting node with partial input after cancel", async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    let cancelledAt = 0;
    const lateCalls: string[] = [];
    const nodes: NodeDescriptor[] = [
      { id: "gen", type: "test.Gen", is_streaming_output: true, outputs: { output: "any" } },
      { id: "sink", type: "test.Sink" }
    ];
    const edges: Edge[] = [
      { id: "e1", source: "gen", sourceHandle: "output", target: "sink", targetHandle: "a" }
    ];
    const gen: NodeExecutor = {
      async process() {
        return {};
      },
      async *genProcess() {
        yield { output: "chunk-1" };
        await hold;
      }
    };
    const sink: NodeExecutor = {
      async process() {
        if (cancelledAt) lateCalls.push("sink");
        return { output: 1 };
      }
    };
    const runner = new WorkflowRunner("j", {
      resolveExecutor: (node) => (node.id === "gen" ? gen : sink)
    });
    const p = runner.run({ job_id: "j" }, { nodes, edges });
    await tick(30);
    cancelledAt = Date.now();
    runner.cancel();
    release();
    const result = await p;
    expect(result.status).toBe("cancelled");
    expect(lateCalls).toEqual([]);
  });
});

describe("controlled node with a supervisor skip", () => {
  it("each sendControlEvent resolves with its own invocation", async () => {
    let releaseCtl!: () => void;
    const ctlHold = new Promise<void>((r) => (releaseCtl = r));
    let n = 0;
    const nodes: NodeDescriptor[] = [
      { id: "ctl", type: "test.Ctl" },
      { id: "tgt", type: "test.Tgt", is_controlled: true, outputs: { output: "any" } }
    ];
    const edges: Edge[] = [
      { id: "c1", source: "ctl", sourceHandle: "__control__", target: "tgt", targetHandle: "__control__", edge_type: "control" }
    ];
    const supervisor: SupervisorHandle = {
      async decide() {
        return { verdict: { action: "skip" }, decidedBy: "agent" };
      },
      close() {}
    };
    const runner = new WorkflowRunner("j", {
      supervisor,
      resolveExecutor: (node) =>
        node.id === "ctl"
          ? { async process() { await ctlHold; return {}; } }
          : {
              async process() {
                n += 1;
                if (n === 1) throw new Error("first call fails");
                return { output: `call-${n}` };
              }
            }
    });
    const p = runner.run({ job_id: "j" }, { nodes, edges });
    await tick(20);
    const first = runner.sendControlEvent("tgt", {}).then(
      (v) => ({ ok: v }),
      (e: Error) => ({ err: e.message })
    );
    await tick(20);
    const second = runner.sendControlEvent("tgt", {}).then(
      (v) => ({ ok: v }),
      (e: Error) => ({ err: e.message })
    );
    await tick(20);
    releaseCtl();
    await p;
    const r1 = await first;
    const r2 = await second;
    // The second call ran and produced call-2; it must be the second waiter's answer.
    expect(r2).toEqual({ ok: { output: "call-2" } });
    expect(r1).toEqual({
      err: "Controlled node tgt skipped this invocation without output"
    });
  });
});

describe("RunResult.outputs for a fan-out into an Output node", () => {
  it("collects every item, not only the last", async () => {
    const nodes: NodeDescriptor[] = [
      {
        id: "each",
        type: "test.ForEach",
        is_streaming_output: true,
        outputs: { output: "any" },
        output_correlation: { output: { kind: "iteration", source: "__execution__", group: "items" } }
      },
      { id: "out", type: "nodetool.output.Output", name: "result", outputs: { output: "any" } }
    ];
    const edges: Edge[] = [
      { id: "e1", source: "each", sourceHandle: "output", target: "out", targetHandle: "value" }
    ];
    const runner = new WorkflowRunner("j", {
      resolveExecutor: (node) =>
        node.id === "each"
          ? {
              async process() { return {}; },
              async *genProcess() {
                yield { output: 1 };
                yield { output: 2 };
                yield { output: 3 };
              }
            }
          : { async process(inputs) { return { output: inputs.value }; } }
    });
    const result = await runner.run({ job_id: "j" }, { nodes, edges });
    expect(result.status).toBe("completed");
    const updates = result.messages.filter((m) => m.type === "output_update");
    expect(updates.length).toBe(3);
    expect(result.outputs.result).toEqual([1, 2, 3]);
  });
});

describe("input-node executors", () => {
  it("are finalized after the run", async () => {
    const finalized: string[] = [];
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "out", type: "test.Output", name: "result" }
    ];
    const edges: Edge[] = [
      { id: "e1", source: "in", sourceHandle: "value", target: "out", targetHandle: "value" }
    ];
    const runner = new WorkflowRunner("j", {
      resolveExecutor: (node) => ({
        async initialize() {},
        async finalize() {
          finalized.push(node.id);
        },
        async process(inputs) {
          return { value: inputs.value };
        }
      })
    });
    const result = await runner.run({ job_id: "j", params: { x: 1 } }, { nodes, edges });
    expect(result.status).toBe("completed");
    expect(finalized.sort()).toEqual(["in", "out"]);
  });
});
