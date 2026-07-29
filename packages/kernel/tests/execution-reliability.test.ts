/**
 * Reliability regressions in workflow execution.
 *
 * Each case here is a way a run used to hang, silently leak, or return a
 * terminal status while actors were still executing.
 */

import { describe, it, expect } from "vitest";
import { WorkflowRunner } from "../src/runner.js";
import { NodeInbox } from "../src/inbox.js";
import type {
  NodeDescriptor,
  Edge,
  ProcessingMessage
} from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { NodeExecutor } from "../src/actor.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

// ---------------------------------------------------------------------------
// Backpressure release when the consumer is gone
// ---------------------------------------------------------------------------

describe("NodeInbox.releaseBackpressure", () => {
  it("unblocks a producer parked on a full buffer", async () => {
    const inbox = new NodeInbox(1);
    inbox.addUpstream("in", 1);
    await inbox.put("in", 1);

    let settled = false;
    const blocked = inbox.put("in", 2).then(() => {
      settled = true;
    });

    await tick();
    expect(settled).toBe(false);

    inbox.releaseBackpressure();
    await blocked;
    expect(settled).toBe(true);
  });

  it("still buffers the value, so pending work stays visible", async () => {
    const inbox = new NodeInbox(1);
    inbox.addUpstream("in", 1);
    await inbox.put("in", 1);
    inbox.releaseBackpressure();
    await inbox.put("in", 2);

    // Unlike closeAll(), the write is accepted — the runner's post-run
    // "pending inbox work" check must still see undelivered values.
    expect(inbox.hasBuffered("in")).toBe(true);
    expect(inbox.hasPendingWork()).toBe(true);
    expect(inbox.isClosed()).toBe(false);
  });

  it("does not apply to an inbox with no buffer limit", async () => {
    const inbox = new NodeInbox(null);
    inbox.addUpstream("in", 1);
    await inbox.put("in", 1);
    await inbox.put("in", 2);
    expect(inbox.hasBuffered("in")).toBe(true);
  });
});

describe("runner: a dead consumer does not deadlock its producer", () => {
  it("completes a bufferLimit run whose consumer errors immediately", async () => {
    // The consumer's actor dies on its first read while the streaming producer
    // still has values to push. With a buffer limit and no backpressure
    // release, the producer parks in put() forever waiting for a consumer that
    // is gone, and Promise.all over the actors never settles.
    const nodes: NodeDescriptor[] = [
      { id: "trig", type: "test.Input", name: "trig" },
      { id: "producer", type: "test.Streamer", is_streaming_output: true },
      { id: "consumer", type: "test.Consumer", is_streaming_input: true }
    ];
    const edges: Edge[] = [
      {
        id: "e-trig",
        source: "trig",
        sourceHandle: "value",
        target: "producer",
        targetHandle: "start"
      },
      {
        id: "e-data",
        source: "producer",
        sourceHandle: "value",
        target: "consumer",
        targetHandle: "value"
      }
    ];

    let produced = 0;
    const runner = new WorkflowRunner("job-backpressure", {
      bufferLimit: 1,
      resolveExecutor: (node) => {
        if (node.id === "producer") {
          return {
            async *genProcess() {
              for (let i = 0; i < 25; i++) {
                produced++;
                yield { value: i };
              }
            },
            process: async () => ({})
          } as unknown as NodeExecutor;
        }
        if (node.id === "consumer") {
          return {
            async run() {
              throw new Error("consumer died");
            },
            process: async () => ({})
          } as unknown as NodeExecutor;
        }
        return { process: async (i: Record<string, unknown>) => i };
      }
    });

    const result = await runner.run(
      { job_id: "job-backpressure", params: { trig: 0 } },
      { nodes, edges }
    );

    expect(result.status).toBe("failed");
    expect(result.error).toContain("consumer died");
    // The producer ran to completion rather than parking forever.
    expect(produced).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// A failing completion handler must not orphan sibling actors
// ---------------------------------------------------------------------------

describe("runner: actor post-completion failures", () => {
  it("waits for every actor when one completion handler throws", async () => {
    // markChannelWriterDone runs inside the actor completion handler. When it
    // throws, Promise.all used to reject and _runImpl returned immediately —
    // while the slow sibling actor kept running, emitting into a run that had
    // already reported a terminal status.
    const nodes: NodeDescriptor[] = [
      { id: "trig", type: "test.Input", name: "trig" },
      {
        id: "setvar",
        type: "nodetool.variable.SetVariable",
        properties: { name: "chan" }
      },
      { id: "slow", type: "test.Slow" }
    ];
    const edges: Edge[] = [
      {
        id: "e1",
        source: "trig",
        sourceHandle: "value",
        target: "setvar",
        targetHandle: "value"
      },
      {
        id: "e2",
        source: "trig",
        sourceHandle: "value",
        target: "slow",
        targetHandle: "value"
      }
    ];

    let slowFinished = false;
    const context = {
      emit() {},
      registerChannelWriters() {},
      markChannelWriterDone() {
        throw new Error("channel bookkeeping exploded");
      },
      closeAllChannels() {}
    } as unknown as ProcessingContext;

    const runner = new WorkflowRunner("job-settle", {
      executionContext: context,
      resolveExecutor: (node) => {
        if (node.id === "slow") {
          return {
            async process() {
              await new Promise((r) => setTimeout(r, 30));
              slowFinished = true;
              return { value: "done" };
            }
          };
        }
        return { process: async (i: Record<string, unknown>) => i };
      }
    });

    const result = await runner.run(
      { job_id: "job-settle", params: { trig: 1 } },
      { nodes, edges }
    );

    expect(slowFinished).toBe(true);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("channel bookkeeping exploded");
    // The failure is attributed to the node whose handler threw.
    expect(result.error).toContain("setvar");
  });

  it("a throwing message transport does not fail the run", async () => {
    // A WebSocket that closes mid-run makes emit() throw. Message delivery is
    // observation: it must not take down the workflow, which used to happen
    // because _emit is called from EOS routing inside the actor handlers.
    const nodes: NodeDescriptor[] = [
      { id: "trig", type: "test.Input", name: "trig" },
      { id: "sink", type: "test.Sink", name: "out" }
    ];
    const edges: Edge[] = [
      {
        id: "e1",
        source: "trig",
        sourceHandle: "value",
        target: "sink",
        targetHandle: "value"
      }
    ];

    let emitted = 0;
    const context = {
      emit(_msg: ProcessingMessage) {
        emitted++;
        throw new Error("socket closed");
      }
    } as unknown as ProcessingContext;

    const runner = new WorkflowRunner("job-emit", {
      executionContext: context,
      resolveExecutor: () => ({
        process: async (i: Record<string, unknown>) => i
      })
    });

    const result = await runner.run(
      { job_id: "job-emit", params: { trig: 7 } },
      { nodes, edges }
    );

    expect(emitted).toBeGreaterThan(0);
    expect(result.status).toBe("completed");
    expect(result.outputs.out).toEqual([7]);
  });
});

// ---------------------------------------------------------------------------
// Initialization failure must not leak initialized executors
// ---------------------------------------------------------------------------

describe("runner: initialize() failure", () => {
  it("finalizes already-initialized executors and names the failing node", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "a", type: "test.Resource", name: "a" },
      { id: "b", type: "test.Broken", name: "b" }
    ];
    const edges: Edge[] = [
      {
        id: "e1",
        source: "a",
        sourceHandle: "value",
        target: "b",
        targetHandle: "value"
      }
    ];

    // Nodes initialize in graph order, so "a" opens its resource before "b"
    // fails.
    const finalized: string[] = [];
    const runner = new WorkflowRunner("job-init", {
      resolveExecutor: (node) => ({
        async initialize() {
          if (node.id === "b") throw new Error("port already in use");
        },
        async finalize() {
          finalized.push(node.id);
        },
        process: async (i: Record<string, unknown>) => i
      })
    });

    const result = await runner.run({ job_id: "job-init" }, { nodes, edges });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("port already in use");
    expect(result.error).toContain("test.Broken");
    expect(result.error).toContain("b");
    // "a" initialized successfully and would otherwise hold its resource
    // forever: no actor ever ran to finalize it.
    expect(finalized).toEqual(["a"]);
  });

  it("a finalize failure during rollback does not mask the original error", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "a", type: "test.Resource", name: "a" },
      { id: "b", type: "test.Broken", name: "b" }
    ];

    const runner = new WorkflowRunner("job-init-2", {
      resolveExecutor: (node) => ({
        async initialize() {
          if (node.id === "b") throw new Error("original failure");
        },
        async finalize() {
          throw new Error("cleanup also failed");
        },
        process: async (i: Record<string, unknown>) => i
      })
    });

    const result = await runner.run(
      { job_id: "job-init-2" },
      { nodes, edges: [] }
    );

    expect(result.status).toBe("failed");
    expect(result.error).toContain("original failure");
    expect(result.error).not.toContain("cleanup also failed");
  });
});

// ---------------------------------------------------------------------------
// sendControlEvent races the target's completion
// ---------------------------------------------------------------------------

describe("runner: sendControlEvent completion race", () => {
  it("rejects when the target completes while the event is in flight", async () => {
    const runner = new WorkflowRunner("job-race", {
      resolveExecutor: () => ({ process: async () => ({ result: 1 }) })
    });

    const internals = runner as unknown as {
      _inboxes: Map<string, NodeInbox>;
      _completedNodes: Set<string>;
    };
    const inbox = new NodeInbox(null);
    inbox.addUpstream("__control__", 1);
    internals._inboxes = new Map([["worker", inbox]]);
    internals._completedNodes = new Set();

    // Model the race precisely: the target's actor finishes *during* the
    // awaited put(), after sendControlEvent's up-front completed check passed
    // but before its waiter joined the pending queue. The completion handler
    // has already drained that queue, so nothing will ever settle this waiter.
    const realPut = inbox.put.bind(inbox);
    inbox.put = async (handle, item, opts) => {
      internals._completedNodes.add("worker");
      await realPut(handle, item, opts);
    };

    await expect(runner.sendControlEvent("worker", { x: 1 })).rejects.toThrow(
      /already completed/
    );
  });

  it("rejects up front for an already-completed target", async () => {
    const runner = new WorkflowRunner("job-race-2", {
      resolveExecutor: () => ({ process: async () => ({}) })
    });
    const internals = runner as unknown as {
      _inboxes: Map<string, NodeInbox>;
      _completedNodes: Set<string>;
    };
    internals._inboxes = new Map([["worker", new NodeInbox(null)]]);
    internals._completedNodes = new Set(["worker"]);

    await expect(runner.sendControlEvent("worker", {})).rejects.toThrow(
      /already completed/
    );
  });
});
