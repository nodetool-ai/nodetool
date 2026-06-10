/**
 * Regression tests for a batch of kernel bugs found by review:
 *
 *  1. Controlled-node livelock when a control event arrives before data.
 *  2. Node executor errors must fail the run, not report "completed".
 *  3. Concurrent sendControlEvent calls to the same node must all settle.
 *  4. Data self-loops must be rejected at validation, not hang the run.
 *  5. Control-edge EOS must decrement once per controller, not per edge.
 *  6. Runner reuse: _completedNodes must reset between runs.
 *  7. DurableInbox.append must serialize per handle (no duplicate seqs).
 *  8. TriggerManager must dedupe concurrent starts and retry failed restarts.
 * 10. Graph.fromDict/loadFromDict must not prune properties for dropped edges.
 * 11. Legacy streaming-input fallback must receive node properties.
 */
import { describe, it, expect, vi } from "vitest";
import { WorkflowRunner } from "../src/runner.js";
import { Graph, GraphValidationError } from "../src/graph.js";
import { DurableInbox, MemoryDurableInboxStore } from "../src/durable-inbox.js";
import {
  TriggerWorkflowManager,
  type StartJobFn,
  type HasTriggerNodesFn
} from "../src/trigger-manager.js";
import type { NodeDescriptor, Edge } from "@nodetool-ai/protocol";

function ce(source: string, target: string, id?: string): Edge {
  return {
    id,
    source,
    sourceHandle: "__control__",
    target,
    targetHandle: "__control__",
    edge_type: "control"
  };
}

function de(
  source: string,
  sh: string,
  target: string,
  th: string,
  id?: string
): Edge {
  return { id, source, sourceHandle: sh, target, targetHandle: th };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 1. Controlled-node livelock (control event before data input)
// ---------------------------------------------------------------------------

describe("controlled node: control event arriving before data input", () => {
  it("completes instead of spinning forever", { timeout: 5000 }, async () => {
    const nodes: NodeDescriptor[] = [
      { id: "agent", type: "test.Controller" },
      { id: "slow", type: "test.Slow" },
      { id: "proc", type: "test.Processor", is_controlled: true, name: "proc" }
    ];
    const edges: Edge[] = [
      ce("agent", "proc"),
      de("slow", "value", "proc", "value")
    ];

    const calls: Array<Record<string, unknown>> = [];
    const runner = new WorkflowRunner("livelock", {
      resolveExecutor: (node) => {
        if (node.id === "agent") {
          return {
            async process() {
              // Control event fires immediately, before slow's data exists.
              return { __control_output__: { brightness: 0.8 } };
            }
          };
        }
        if (node.id === "slow") {
          return {
            async process() {
              // Macrotask delay — under the old prepend/iterAny spin this
              // timer never fired because the microtask queue never drained.
              await sleep(50);
              return { value: 42 };
            }
          };
        }
        return {
          async process(inputs) {
            calls.push({ ...inputs });
            return { result: inputs.value };
          }
        };
      }
    });

    const result = await runner.run({ job_id: "livelock" }, { nodes, edges });
    expect(result.status).toBe("completed");
    // The held-back control event was processed after data arrived.
    expect(calls.length).toBe(1);
    expect(calls[0].value).toBe(42);
    expect(calls[0].brightness).toBe(0.8);
  });
});

// ---------------------------------------------------------------------------
// 2. Node executor error fails the run
// ---------------------------------------------------------------------------

describe("node executor error", () => {
  it("reports status failed with the node error", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "boom", type: "test.Boom" },
      { id: "sink", type: "test.Sink", name: "sink" }
    ];
    const edges: Edge[] = [de("boom", "value", "sink", "value")];

    const runner = new WorkflowRunner("err", {
      resolveExecutor: (node) => {
        if (node.id === "boom") {
          return {
            async process(): Promise<Record<string, unknown>> {
              throw new Error("kaboom");
            }
          };
        }
        return {
          async process(inputs) {
            return inputs;
          }
        };
      }
    });

    const result = await runner.run({ job_id: "err" }, { nodes, edges });
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/boom.*kaboom/);
    const failedUpdate = result.messages.find(
      (m) =>
        m.type === "job_update" &&
        (m as { status: string }).status === "failed"
    );
    expect(failedUpdate).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Concurrent sendControlEvent to the same node
// ---------------------------------------------------------------------------

describe("concurrent sendControlEvent", () => {
  it("settles every in-flight control response in FIFO order", {
    timeout: 5000
  }, async () => {
    const nodes: NodeDescriptor[] = [
      { id: "agent", type: "test.Controller" },
      { id: "proc", type: "test.Processor", is_controlled: true }
    ];
    const edges: Edge[] = [ce("agent", "proc")];

    let runnerRef!: WorkflowRunner;
    const responses: Array<Record<string, unknown>> = [];
    const runner = new WorkflowRunner("ctrl-burst", {
      resolveExecutor: (node) => {
        if (node.id === "agent") {
          return {
            async process() {
              // Fire two control events without awaiting in between.
              const p1 = runnerRef.sendControlEvent("proc", { a: 1 });
              const p2 = runnerRef.sendControlEvent("proc", { a: 2 });
              responses.push(await p1, await p2);
              return {};
            }
          };
        }
        return {
          async process(inputs) {
            return { result: inputs.a };
          }
        };
      }
    });
    runnerRef = runner;

    const result = await runner.run({ job_id: "ctrl-burst" }, { nodes, edges });
    expect(result.status).toBe("completed");
    expect(responses.length).toBe(2);
    expect(responses[0].result).toBe(1);
    expect(responses[1].result).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 4. Data self-loop rejected at validation
// ---------------------------------------------------------------------------

describe("self-loop edges", () => {
  it("Graph.validate() rejects a data self-loop", () => {
    const g = new Graph({
      nodes: [{ id: "a", type: "t" }],
      edges: [de("a", "out", "a", "in")]
    });
    expect(() => g.validate()).toThrow(/self-loop/i);
    expect(() => g.validate()).toThrow(GraphValidationError);
  });

  it("runner fails fast instead of hanging on a self-loop", async () => {
    const runner = new WorkflowRunner("selfloop", {
      resolveExecutor: () => ({
        async process(inputs) {
          return inputs;
        }
      })
    });
    const result = await runner.run(
      { job_id: "selfloop" },
      {
        nodes: [{ id: "a", type: "t" }],
        edges: [de("a", "out", "a", "in")]
      }
    );
    expect(result.status).toBe("failed");
    // The correlation analyzer (which runs before Graph.validate) reports
    // self-loops as one-node cycles; either rejection message is fine.
    expect(result.error).toMatch(/self-loop|cycle detected/i);
  });
});

// ---------------------------------------------------------------------------
// 5. Control-edge EOS decrements once per controller
// ---------------------------------------------------------------------------

describe("control EOS accounting", () => {
  it("a controller with duplicate control edges closes __control__ once", {
    timeout: 5000
  }, async () => {
    const nodes: NodeDescriptor[] = [
      { id: "a", type: "test.CtrlA" },
      { id: "b", type: "test.CtrlB" },
      { id: "proc", type: "test.Processor", is_controlled: true }
    ];
    // A holds two control edges to proc; upstream counting is per unique
    // controller, so A finishing must decrement proc's __control__ once.
    const edges: Edge[] = [
      ce("a", "proc", "ca1"),
      ce("a", "proc", "ca2"),
      ce("b", "proc", "cb")
    ];

    const calls: Array<Record<string, unknown>> = [];
    const runner = new WorkflowRunner("ctrl-eos", {
      resolveExecutor: (node) => {
        if (node.id === "a") {
          return {
            async process() {
              return {}; // finishes immediately, no events
            }
          };
        }
        if (node.id === "b") {
          return {
            async process() {
              await sleep(50);
              return { __control_output__: { x: 1 } };
            }
          };
        }
        return {
          async process(inputs) {
            calls.push({ ...inputs });
            return { result: inputs.x };
          }
        };
      }
    });

    const result = await runner.run({ job_id: "ctrl-eos" }, { nodes, edges });
    expect(result.status).toBe("completed");
    // Without per-controller dedup, A's double decrement closed __control__
    // before B's event arrived and proc never executed.
    expect(calls.length).toBe(1);
    expect(calls[0].x).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 6. Runner reuse across runs
// ---------------------------------------------------------------------------

describe("runner reuse", () => {
  it("sendControlEvent works on a second run() of the same runner", {
    timeout: 5000
  }, async () => {
    const nodes: NodeDescriptor[] = [
      { id: "agent", type: "test.Controller" },
      { id: "proc", type: "test.Processor", is_controlled: true }
    ];
    const edges: Edge[] = [ce("agent", "proc")];

    let runnerRef!: WorkflowRunner;
    const results: unknown[] = [];
    const runner = new WorkflowRunner("reuse", {
      resolveExecutor: (node) => {
        if (node.id === "agent") {
          return {
            async process() {
              // Without _completedNodes reset, the second run rejects here
              // because proc completed during the FIRST run.
              const res = await runnerRef.sendControlEvent("proc", { a: 7 });
              results.push(res.result);
              return {};
            }
          };
        }
        return {
          async process(inputs) {
            return { result: inputs.a };
          }
        };
      }
    });
    runnerRef = runner;

    const r1 = await runner.run({ job_id: "reuse-1" }, { nodes, edges });
    const r2 = await runner.run({ job_id: "reuse-2" }, { nodes, edges });
    expect(r1.status).toBe("completed");
    expect(r2.status).toBe("completed");
    expect(results).toEqual([7, 7]);
  });
});

// ---------------------------------------------------------------------------
// 7. DurableInbox append serialization
// ---------------------------------------------------------------------------

describe("DurableInbox.append concurrency", () => {
  it("concurrent appends on one handle get distinct seqs and ids", async () => {
    const store = new MemoryDurableInboxStore();
    const inbox = new DurableInbox("r1", "n1", store);

    const messages = await Promise.all([
      inbox.append("in", { v: 1 }),
      inbox.append("in", { v: 2 }),
      inbox.append("in", { v: 3 }),
      inbox.append("in", { v: 4 }),
      inbox.append("in", { v: 5 })
    ]);

    const seqs = messages.map((m) => m.seq).sort((a, b) => a - b);
    expect(seqs).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(messages.map((m) => m.messageId)).size).toBe(5);

    const pending = await inbox.getPending("in", 100);
    expect(pending).toHaveLength(5);
  });

  it("stays idempotent for caller-supplied message ids", async () => {
    const inbox = new DurableInbox("r1", "n1");
    const [a, b] = await Promise.all([
      inbox.append("in", { v: 1 }, "external-1"),
      inbox.append("in", { v: 1 }, "external-1")
    ]);
    expect(a.messageId).toBe("external-1");
    expect(b.messageId).toBe("external-1");
    expect(a.seq).toBe(b.seq);
    const pending = await inbox.getPending("in", 100);
    expect(pending).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 8. TriggerManager start races and watchdog retries
// ---------------------------------------------------------------------------

describe("TriggerWorkflowManager races", () => {
  it("dedupes concurrent startTriggerWorkflow calls", async () => {
    TriggerWorkflowManager.resetInstance();
    const startJob = vi.fn<StartJobFn>(async () => {
      await sleep(10);
      return { jobId: "job-1", completion: new Promise<void>(() => {}) };
    });
    const hasTriggerNodes = vi.fn<HasTriggerNodesFn>(async () => true);
    const mgr = new TriggerWorkflowManager({ startJob, hasTriggerNodes });

    const [a, b] = await Promise.all([
      mgr.startTriggerWorkflow("wf", "u"),
      mgr.startTriggerWorkflow("wf", "u")
    ]);

    expect(startJob).toHaveBeenCalledTimes(1);
    expect(a).not.toBeNull();
    expect(b).toBe(a);
    expect(mgr.listRunningWorkflows().size).toBe(1);
  });

  it("watchdog keeps retrying after a failed restart attempt", async () => {
    vi.useFakeTimers();
    try {
      TriggerWorkflowManager.resetInstance();
      let failStarts = false;
      let counter = 0;
      const startJob = vi.fn<StartJobFn>(async () => {
        if (failStarts) throw new Error("transient db error");
        counter++;
        return {
          jobId: `job-${counter}`,
          completion: new Promise<void>(() => {})
        };
      });
      const hasTriggerNodes = vi.fn<HasTriggerNodesFn>(async () => true);
      const mgr = new TriggerWorkflowManager({ startJob, hasTriggerNodes });

      const job = await mgr.startTriggerWorkflow("wf", "u");
      job!.status = "failed";

      // First watchdog tick: restart attempt fails transiently.
      failStarts = true;
      mgr.startWatchdog(1000);
      await vi.advanceTimersByTimeAsync(1000);
      // The stale entry must survive the failed attempt.
      expect(mgr.getRunningWorkflow("wf")).toBeDefined();

      // Second tick: restart succeeds.
      failStarts = false;
      await vi.advanceTimersByTimeAsync(1000);
      expect(mgr.isWorkflowRunning("wf")).toBe(true);
      expect(mgr.getRunningWorkflow("wf")!.jobId).toBe("job-2");

      mgr.stopWatchdog();
    } finally {
      vi.useRealTimers();
      TriggerWorkflowManager.resetInstance();
    }
  });
});

// ---------------------------------------------------------------------------
// 10. fromDict/loadFromDict property pruning
// ---------------------------------------------------------------------------

describe("edge-fed property pruning", () => {
  it("fromDict keeps saved values for handles fed only by dropped edges", () => {
    const graph = Graph.fromDict({
      nodes: [{ id: "b", type: "t", data: { keep: 1, extra: "saved" } }],
      edges: [de("ghost", "out", "b", "extra")]
    });
    expect(graph.edges).toHaveLength(0);
    expect(graph.nodes[0].properties).toEqual({ keep: 1, extra: "saved" });
  });

  it("fromDict still prunes values for handles fed by surviving edges", () => {
    const graph = Graph.fromDict({
      nodes: [
        { id: "a", type: "t" },
        { id: "b", type: "t", data: { fed: "stale", keep: 2 } }
      ],
      edges: [de("a", "out", "b", "fed")]
    });
    expect(graph.edges).toHaveLength(1);
    expect(graph.nodes.find((n) => n.id === "b")!.properties).toEqual({
      keep: 2
    });
  });

  it("loadFromDict keeps saved values when the feeding node is unresolvable", async () => {
    const graph = await Graph.loadFromDict(
      {
        nodes: [
          { id: "ghost", type: "uninstalled.Package" },
          { id: "b", type: "t", data: { extra: "saved" } }
        ],
        edges: [de("ghost", "out", "b", "extra")]
      },
      {
        resolver: (nodeType: string) =>
          nodeType === "t" ? { nodeType } : null
      }
    );
    expect(graph.nodes).toHaveLength(1);
    expect(graph.edges).toHaveLength(0);
    expect(graph.nodes[0].properties).toEqual({ extra: "saved" });
  });
});

// ---------------------------------------------------------------------------
// 11. Legacy streaming-input fallback receives node properties
// ---------------------------------------------------------------------------

describe("streaming-input legacy fallback", () => {
  it("passes node properties to process()", async () => {
    const nodes: NodeDescriptor[] = [
      {
        id: "s",
        type: "test.StreamIn",
        is_streaming_input: true,
        properties: { greeting: "hi" },
        dynamic_properties: { extra: 42 }
      }
    ];

    let received: Record<string, unknown> | null = null;
    const runner = new WorkflowRunner("legacy", {
      resolveExecutor: () => ({
        async process(inputs) {
          received = { ...inputs };
          return {};
        }
      })
    });

    const result = await runner.run({ job_id: "legacy" }, { nodes, edges: [] });
    expect(result.status).toBe("completed");
    expect(received).not.toBeNull();
    expect(received!.greeting).toBe("hi");
    expect(received!.extra).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// topologicalSort orders by data edges only (per its contract)
// ---------------------------------------------------------------------------

describe("topologicalSort", () => {
  it("ignores control edges when computing levels", () => {
    const g = new Graph({
      nodes: [
        { id: "a", type: "t" },
        { id: "b", type: "t" }
      ],
      // Mixed cycle: control a→b plus data b→a. Data-only ordering is b, a.
      edges: [ce("a", "b"), de("b", "out", "a", "in")]
    });
    const levels = g.topologicalSort();
    const flat = levels.flat().map((n) => n.id);
    expect(flat).toEqual(["b", "a"]);
  });
});
