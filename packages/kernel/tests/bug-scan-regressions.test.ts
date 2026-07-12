/**
 * Regression tests for bugs found in the kernel bug scan.
 *
 * Each describe block pins the fixed behavior of one finding:
 *  - controlled-mode livelock when a control event precedes data inputs
 *  - sendControlEvent resolver overwrite on concurrent control events
 *  - DurableInbox.append read-modify-write race
 *  - correlated scheduler dropping queued repeating-driver envelopes
 *  - root-scope chunk streams collapsing to "last value only"
 *  - Graph.fromDict deleting defaults for dropped edges
 *  - Graph.topologicalSort ordering on control edges
 *  - getDownstreamSubgraph duplicating edges for shared seed targets
 *  - watchdog dropping a workflow after a failed restart
 *  - runner initializing a different executor instance than the one that runs
 *  - runner reuse rejecting control events for nodes completed in a prior run
 *  - NodeInbox.drainHandle releasing producer backpressure
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NodeActor, type NodeExecutor } from "../src/actor.js";
import { NodeInbox } from "../src/inbox.js";
import { WorkflowRunner } from "../src/runner.js";
import { DurableInbox } from "../src/durable-inbox.js";
import { Graph } from "../src/graph.js";
import { getDownstreamSubgraph } from "../src/graph-utils.js";
import {
  TriggerWorkflowManager,
  type StartJobFn,
  type HasTriggerNodesFn
} from "../src/trigger-manager.js";
import type { NodeAnalysis } from "../src/correlation-analysis.js";
import type { NodeDescriptor, Edge } from "@nodetool-ai/protocol";

const EMPTY_ANALYSIS: NodeAnalysis = {
  invocationScope: [],
  inputs: new Map(),
  outputs: new Map()
};

function makeActor(
  node: NodeDescriptor,
  inbox: NodeInbox,
  executor: NodeExecutor,
  correlation: NodeAnalysis = EMPTY_ANALYSIS
): { actor: NodeActor; sentOutputs: Array<Record<string, unknown>> } {
  const sentOutputs: Array<Record<string, unknown>> = [];
  const actor = new NodeActor({
    node,
    inbox,
    executor,
    correlation,
    sendOutputs: async (_nodeId, outputs) => {
      sentOutputs.push(outputs);
    },
    emitMessage: () => {}
  });
  return { actor, sentOutputs };
}

// ---------------------------------------------------------------------------
// Controlled mode: control event arriving before data must not livelock
// ---------------------------------------------------------------------------

describe("controlled mode — control event before data inputs", () => {
  it("processes the event once data arrives instead of spinning forever", async () => {
    const node: NodeDescriptor = {
      id: "worker",
      type: "test.Worker",
      is_controlled: true
    };
    const inbox = new NodeInbox();
    inbox.addUpstream("x", 1);
    inbox.addUpstream("__control__", 1);

    const calls: Array<Record<string, unknown>> = [];
    const executor: NodeExecutor = {
      async process(inputs) {
        calls.push(inputs);
        return { result: (inputs.x as number) + 1 };
      }
    };
    const { actor, sentOutputs } = makeActor(node, inbox, executor);

    // Control event lands first; the data put only happens on a macrotask
    // (like a real upstream LLM call). The old prepend-and-retry loop spun
    // in microtasks and never let this timer fire.
    await inbox.put("__control__", { event_type: "run", properties: {} });
    setTimeout(() => {
      void inbox.put("x", 41).then(() => {
        inbox.markSourceDone("x");
        inbox.markSourceDone("__control__");
      });
    }, 10);

    const result = await actor.run();
    expect(result.error).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0].x).toBe(41);
    expect(sentOutputs[0]).toEqual({ result: 42 });
  }, 5000);
});

// ---------------------------------------------------------------------------
// Correlated scheduler: repeating driver backlog must drain fully
// ---------------------------------------------------------------------------

describe("correlated scheduler — repeating driver", () => {
  const input = (repeats: boolean) => ({
    scope: [] as const,
    repeatsPerKey: repeats,
    isMultiEdge: false,
    possibleChildRoots: new Set<string>()
  });

  it("fires once per chunk at root scope instead of only the last chunk", async () => {
    const analysis: NodeAnalysis = {
      invocationScope: [],
      inputs: new Map([["chunk", input(true)]]),
      outputs: new Map()
    };
    const inbox = new NodeInbox();
    inbox.addUpstream("chunk", 1);

    const calls: Array<Record<string, unknown>> = [];
    const executor: NodeExecutor = {
      async process(inputs) {
        calls.push(inputs);
        return {};
      }
    };
    const { actor } = makeActor(
      { id: "n", type: "test.Node" },
      inbox,
      executor,
      analysis
    );

    const run = actor.run();
    await inbox.put("chunk", "c1");
    await inbox.put("chunk", "c2");
    await inbox.put("chunk", "c3");
    inbox.markSourceDone("chunk");
    await run;

    expect(calls.map((c) => c.chunk)).toEqual(["c1", "c2", "c3"]);
  });

  it("drains the whole backlog when a blocking sticky input arrives late", async () => {
    const analysis: NodeAnalysis = {
      invocationScope: [],
      inputs: new Map([
        ["chunk", input(true)],
        ["config", input(false)]
      ]),
      outputs: new Map()
    };
    const inbox = new NodeInbox();
    inbox.addUpstream("chunk", 1);
    inbox.addUpstream("config", 1);

    const calls: Array<Record<string, unknown>> = [];
    const executor: NodeExecutor = {
      async process(inputs) {
        calls.push(inputs);
        return {};
      }
    };
    const { actor } = makeActor(
      { id: "n", type: "test.Node" },
      inbox,
      executor,
      analysis
    );

    const run = actor.run();
    // Chunks pile up while the config input is still pending; let the actor
    // consume them (none ready — config is open with no value yet).
    await inbox.put("chunk", "c1");
    await inbox.put("chunk", "c2");
    await inbox.put("chunk", "c3");
    await new Promise((r) => setTimeout(r, 0));
    // The sticky arrival must release the entire backlog.
    await inbox.put("config", "cfg");
    await new Promise((r) => setTimeout(r, 0));
    inbox.markSourceDone("chunk");
    inbox.markSourceDone("config");
    await run;

    // Before the fix only one chunk fired per notification; the rest were
    // stranded in the actor-local bucket and silently lost.
    expect(calls.map((c) => c.chunk)).toEqual(["c1", "c2", "c3"]);
    for (const c of calls) expect(c.config).toBe("cfg");
  });
});

// ---------------------------------------------------------------------------
// sendControlEvent: concurrent events to the same node must all settle
// ---------------------------------------------------------------------------

describe("sendControlEvent — concurrent events to one node", () => {
  it("resolves each caller with the matching output (FIFO)", async () => {
    const nodes: NodeDescriptor[] = [
      {
        id: "ctrl",
        type: "test.Controller",
        is_streaming_output: true,
        outputs: { __control__: "control" }
      },
      {
        id: "worker",
        type: "test.Worker",
        is_controlled: true,
        outputs: { result: "int" }
      }
    ];
    const edges: Edge[] = [
      {
        id: "ce1",
        source: "ctrl",
        sourceHandle: "__control__",
        target: "worker",
        targetHandle: "__control__",
        edge_type: "control"
      }
    ];

    let resolveCtrl!: () => void;
    const ctrlStarted = new Promise<void>((r) => {
      resolveCtrl = r;
    });
    const cancelledRef = { cancelled: false };

    const runner = new WorkflowRunner("job1", {
      resolveExecutor: (node) => {
        if (node.id === "ctrl") {
          return {
            async *genProcess() {
              resolveCtrl();
              while (!cancelledRef.cancelled) {
                await new Promise((r) => setTimeout(r, 10));
              }
              yield { __control__: { event_type: "stop" } };
            },
            process: async () => ({})
          } as unknown as NodeExecutor;
        }
        return {
          process: async (inputs) => ({ result: (inputs.x as number) + 1 })
        };
      }
    });

    const runPromise = runner.run({ job_id: "job1" }, { nodes, edges });
    await ctrlStarted;
    await new Promise((r) => setTimeout(r, 30));

    // Burst: dispatch both before either response arrives. With the old
    // single-slot resolver the first promise never settled.
    const [out1, out2] = await Promise.all([
      runner.sendControlEvent("worker", { x: 10 }),
      runner.sendControlEvent("worker", { x: 20 })
    ]);
    expect(out1.result).toBe(11);
    expect(out2.result).toBe(21);

    cancelledRef.cancelled = true;
    await runPromise;
  }, 10000);
});

// ---------------------------------------------------------------------------
// Runner: executor lifecycle and reuse
// ---------------------------------------------------------------------------

describe("WorkflowRunner — executor lifecycle", () => {
  it("runs process() on the same instance initialize() was called on", async () => {
    const runner = new WorkflowRunner("job1", {
      resolveExecutor: () => {
        const state = { initialized: false };
        return {
          async initialize() {
            state.initialized = true;
          },
          async process() {
            return { ok: state.initialized };
          }
        };
      }
    });

    const nodes: NodeDescriptor[] = [
      { id: "n1", type: "test.Node", outputs: { ok: "bool" }, name: "out" }
    ];
    const result = await runner.run({ job_id: "j" }, { nodes, edges: [] });
    expect(result.status).toBe("completed");
    expect(result.outputs.out).toEqual([true]);
  });

  it("accepts control events on a reused runner for nodes completed in a prior run", async () => {
    const nodes: NodeDescriptor[] = [
      {
        id: "ctrl",
        type: "test.Controller",
        is_streaming_output: true,
        outputs: { __control__: "control" }
      },
      {
        id: "worker",
        type: "test.Worker",
        is_controlled: true,
        outputs: { result: "int" }
      }
    ];
    const edges: Edge[] = [
      {
        id: "ce1",
        source: "ctrl",
        sourceHandle: "__control__",
        target: "worker",
        targetHandle: "__control__",
        edge_type: "control"
      }
    ];

    let resolveCtrl!: () => void;
    let cancelledRef = { cancelled: false };
    const runner = new WorkflowRunner("job1", {
      resolveExecutor: (node) => {
        if (node.id === "ctrl") {
          const cancelled = cancelledRef;
          return {
            async *genProcess() {
              resolveCtrl();
              while (!cancelled.cancelled) {
                await new Promise((r) => setTimeout(r, 10));
              }
              yield { __control__: { event_type: "stop" } };
            },
            process: async () => ({})
          } as unknown as NodeExecutor;
        }
        return {
          process: async (inputs) => ({ result: (inputs.x as number) + 1 })
        };
      }
    });

    // Run 1 to completion — marks "worker" completed.
    let started = new Promise<void>((r) => {
      resolveCtrl = r;
    });
    const run1 = runner.run({ job_id: "j1" }, { nodes, edges });
    await started;
    cancelledRef.cancelled = true;
    await run1;

    // Run 2 on the same runner: the stale completed-set must not block
    // control events to the fresh actor.
    cancelledRef = { cancelled: false };
    started = new Promise<void>((r) => {
      resolveCtrl = r;
    });
    const run2 = runner.run({ job_id: "j2" }, { nodes, edges });
    await started;
    await new Promise((r) => setTimeout(r, 30));

    const out = await runner.sendControlEvent("worker", { x: 1 });
    expect(out.result).toBe(2);

    cancelledRef.cancelled = true;
    await run2;
  }, 10000);
});

// ---------------------------------------------------------------------------
// DurableInbox: concurrent appends
// ---------------------------------------------------------------------------

describe("DurableInbox — concurrent appends", () => {
  it("assigns distinct seq and messageId to concurrent appends", async () => {
    const inbox = new DurableInbox("run-1", "node-1");
    const results = await Promise.all([
      inbox.append("h", "a"),
      inbox.append("h", "b"),
      inbox.append("h", "c")
    ]);

    const seqs = results.map((m) => m.seq).sort();
    expect(seqs).toEqual([1, 2, 3]);
    expect(new Set(results.map((m) => m.messageId)).size).toBe(3);

    const pending = await inbox.getPending("h");
    expect(pending).toHaveLength(3);
    expect(pending.map((m) => m.payload)).toEqual(["a", "b", "c"]);
  });
});

// ---------------------------------------------------------------------------
// Graph.fromDict: edge-fed defaults survive when the edge is dropped
// ---------------------------------------------------------------------------

describe("Graph.fromDict — property defaults vs dropped edges", () => {
  const nodeDict = (id: string, properties: Record<string, unknown> = {}) => ({
    id,
    type: "test.Node",
    properties
  });

  it("keeps a node's default when its incoming edge is dangling", () => {
    const graph = Graph.fromDict({
      nodes: [nodeDict("b", { x: 5 })],
      edges: [
        { source: "ghost", sourceHandle: "out", target: "b", targetHandle: "x" }
      ]
    });
    expect(graph.edges).toHaveLength(0);
    expect(graph.findNode("b")!.properties).toEqual({ x: 5 });
  });

  it("retains the default when the edge survives", () => {
    const graph = Graph.fromDict({
      nodes: [nodeDict("a"), nodeDict("b", { x: 5 })],
      edges: [
        { source: "a", sourceHandle: "out", target: "b", targetHandle: "x" }
      ]
    });
    expect(graph.edges).toHaveLength(1);
    expect(graph.findNode("b")!.properties).toEqual({ x: 5 });
  });

  it("loadFromDict keeps the default when the resolver drops the source node", async () => {
    const graph = await Graph.loadFromDict(
      {
        nodes: [
          { id: "a", type: "missing.Type", properties: {} },
          nodeDict("b", { x: 5 })
        ],
        edges: [
          { source: "a", sourceHandle: "out", target: "b", targetHandle: "x" }
        ]
      },
      {
        resolver: (nodeType: string) =>
          nodeType === "test.Node" ? { nodeType } : null
      }
    );
    expect(graph.findNode("a")).toBeUndefined();
    expect(graph.edges).toHaveLength(0);
    expect(graph.findNode("b")!.properties).toEqual({ x: 5 });
  });
});

// ---------------------------------------------------------------------------
// Graph.topologicalSort: control edges must not define the ordering
// ---------------------------------------------------------------------------

describe("Graph.topologicalSort — control edges excluded", () => {
  it("keeps both nodes of a data-forward/control-back pair in the levels", () => {
    const graph = new Graph({
      nodes: [
        { id: "a", type: "t" },
        { id: "b", type: "t" }
      ],
      edges: [
        { source: "a", sourceHandle: "out", target: "b", targetHandle: "in" },
        {
          source: "b",
          sourceHandle: "__control__",
          target: "a",
          targetHandle: "__control__",
          edge_type: "control"
        }
      ]
    });
    const levels = graph.topologicalSort();
    expect(levels.map((l) => l.map((n) => n.id))).toEqual([["a"], ["b"]]);
  });
});

// ---------------------------------------------------------------------------
// getDownstreamSubgraph: shared seed target must not duplicate edges
// ---------------------------------------------------------------------------

describe("getDownstreamSubgraph — shared seed target", () => {
  it("includes downstream edges exactly once when two initial edges share a target", () => {
    const graph = new Graph({
      nodes: [
        { id: "A", type: "t" },
        { id: "B", type: "t" },
        { id: "C", type: "t" }
      ],
      edges: [
        { source: "A", sourceHandle: "out", target: "B", targetHandle: "in1" },
        { source: "A", sourceHandle: "out", target: "B", targetHandle: "in2" },
        { source: "B", sourceHandle: "out", target: "C", targetHandle: "in" }
      ]
    });
    const result = getDownstreamSubgraph(graph, "A", "out");
    const tailEdges = result.edges.filter((e) => e.source === "B");
    expect(tailEdges).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Watchdog: failed restart must keep the workflow tracked for retry
// ---------------------------------------------------------------------------

describe("TriggerWorkflowManager — watchdog retry after failed restart", () => {
  let startJob: ReturnType<typeof vi.fn<StartJobFn>>;
  let hasTriggerNodes: ReturnType<typeof vi.fn<HasTriggerNodesFn>>;

  beforeEach(() => {
    TriggerWorkflowManager.resetInstance();
    vi.useFakeTimers();
    startJob = vi.fn(async () => ({
      jobId: "job",
      completion: new Promise<void>(() => {})
    }));
    hasTriggerNodes = vi.fn(async () => true);
  });

  afterEach(() => {
    vi.useRealTimers();
    TriggerWorkflowManager.resetInstance();
  });

  it("retries on the next tick instead of permanently dropping the workflow", async () => {
    const mgr = TriggerWorkflowManager.getInstance({
      startJob,
      hasTriggerNodes,
      watchdogInterval: 1000
    });
    const job = await mgr.startTriggerWorkflow("wf-1", "u");
    job!.status = "failed";

    // First restart attempt fails transiently.
    startJob.mockRejectedValueOnce(new Error("transient"));
    mgr.startWatchdog();
    await vi.advanceTimersByTimeAsync(1000);
    expect(startJob).toHaveBeenCalledTimes(2);
    expect(mgr.getRunningWorkflow("wf-1")).toBeDefined();
    expect(mgr.isWorkflowRunning("wf-1")).toBe(false);

    // Next tick succeeds.
    await vi.advanceTimersByTimeAsync(1000);
    expect(startJob).toHaveBeenCalledTimes(3);
    expect(mgr.isWorkflowRunning("wf-1")).toBe(true);
    mgr.stopWatchdog();
  });
});

// ---------------------------------------------------------------------------
// NodeInbox.drainHandle: backpressure release
// ---------------------------------------------------------------------------

describe("NodeInbox.drainHandle — releases producer backpressure", () => {
  it("wakes a producer blocked on a full buffer", async () => {
    const inbox = new NodeInbox(1);
    inbox.addUpstream("x", 1);

    await inbox.put("x", 1);
    let secondPutDone = false;
    const secondPut = inbox.put("x", 2).then(() => {
      secondPutDone = true;
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(secondPutDone).toBe(false);

    const drained = inbox.drainHandle("x");
    expect(drained.map((e) => e.data)).toEqual([1]);

    await secondPut;
    expect(secondPutDone).toBe(true);
    expect(inbox.drainHandle("x").map((e) => e.data)).toEqual([2]);
  });
});
