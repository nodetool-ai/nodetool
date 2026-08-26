/**
 * Kernel `strict` flag (docs/RELIABILITY_ARCHITECTURE.md §12: "strict mode
 * is a kernel flag, not a fork"; task C3).
 *
 * `WorkflowRunnerOptions.strict` turns three advisory-only checks into
 * thrown `Error`s instead of `log.warn` calls: `_checkPendingInboxWork`,
 * unresolved `sendControlEvent` waiters ("pending control responses"), and
 * `_drainActiveEdges` finding an edge still buffered/open after an
 * otherwise-clean completion. One test per gated path proves strict mode
 * throws where non-strict logs — see each `describe` block for how the
 * triggering scenario was constructed and, where the real end-to-end path is
 * impractical to reach deterministically, why.
 */
import { describe, it, expect, vi } from "vitest";
import { WorkflowRunner } from "../src/runner.js";
import type { Edge, NodeDescriptor } from "@nodetool-ai/protocol";
import type { NodeExecutor } from "../src/actor.js";

// ---------------------------------------------------------------------------
// Gate 1: _checkPendingInboxWork
// ---------------------------------------------------------------------------
//
// A streaming producer feeds a bufferLimit'd consumer whose actor dies on its
// first read. `NodeInbox.releaseBackpressure()` lets the producer finish
// instead of hanging, but the values it already pushed stay buffered in the
// dead consumer's inbox — exactly the "possible data loss" case
// `_checkPendingInboxWork` exists to catch (mirrors
// execution-reliability.test.ts's "a dead consumer does not deadlock its
// producer").

function deadConsumerGraph(): { nodes: NodeDescriptor[]; edges: Edge[] } {
  return {
    nodes: [
      { id: "trig", type: "test.Input", name: "trig" },
      { id: "producer", type: "test.Streamer", is_streaming_output: true },
      { id: "consumer", type: "test.Consumer", is_streaming_input: true }
    ],
    edges: [
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
    ]
  };
}

function deadConsumerExecutor(node: NodeDescriptor): NodeExecutor {
  if (node.id === "producer") {
    return {
      async *genProcess() {
        for (let i = 0; i < 10; i++) {
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

describe("strict mode: _checkPendingInboxWork", () => {
  it("non-strict: logs a warning and reports the original node error", async () => {
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    try {
      const { nodes, edges } = deadConsumerGraph();
      const runner = new WorkflowRunner("job-pending-warn", {
        bufferLimit: 1,
        resolveExecutor: deadConsumerExecutor
      });

      const result = await runner.run(
        { job_id: "job-pending-warn", params: { trig: 0 } },
        { nodes, edges }
      );

      expect(result.status).toBe("failed");
      expect(result.error).toContain("consumer died");
      const logged = stderrSpy.mock.calls
        .map((c) => String(c[0]))
        .join("\n");
      expect(logged).toContain("Pending inbox work detected");
      expect(logged).toContain("consumer");
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("strict: throws instead, naming the pending node", async () => {
    const { nodes, edges } = deadConsumerGraph();
    const runner = new WorkflowRunner("job-pending-strict", {
      bufferLimit: 1,
      strict: true,
      resolveExecutor: deadConsumerExecutor
    });

    const result = await runner.run(
      { job_id: "job-pending-strict", params: { trig: 0 } },
      { nodes, edges }
    );

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Strict mode");
    expect(result.error).toContain("pending inbox work");
    expect(result.error).toContain("consumer");
  });

  it("strict: a cancelled run terminates as cancelled, not failed, despite pending inbox work", async () => {
    const { nodes, edges } = deadConsumerGraph();
    let runner!: WorkflowRunner;
    runner = new WorkflowRunner("job-pending-cancel", {
      bufferLimit: 1,
      strict: true,
      resolveExecutor: (node) => {
        if (node.id === "producer") {
          return {
            async *genProcess() {
              for (let i = 0; i < 10; i++) {
                yield { value: i };
              }
            },
            process: async () => ({})
          } as unknown as NodeExecutor;
        }
        if (node.id === "consumer") {
          return {
            async run() {
              // Cancel the run before the consumer actor dies, so the
              // pending-inbox-work gate observes a cancelled run rather
              // than an ordinary node error.
              runner.cancel();
              throw new Error("consumer died");
            },
            process: async () => ({})
          } as unknown as NodeExecutor;
        }
        return { process: async (i: Record<string, unknown>) => i };
      }
    });

    const result = await runner.run(
      { job_id: "job-pending-cancel", params: { trig: 0 } },
      { nodes, edges }
    );

    expect(result.status).toBe("cancelled");
  });
});

// ---------------------------------------------------------------------------
// Gate 2: pending control-event responses
// ---------------------------------------------------------------------------
//
// Every real completion path drains its own node's `_pendingControlResponses`
// queue, so the queue is never observably non-empty at the post-run check
// under normal operation. To exercise the gate deterministically we inject a
// queue entry for a node id that never runs an actor at all ("ghost-node") —
// simulating the bookkeeping gap the gate defends against — from inside a
// real node's `process()`, so the check runs through the actual `run()` path.

function ghostControlResponseGraph(): { nodes: NodeDescriptor[]; edges: Edge[] } {
  return {
    nodes: [{ id: "src", type: "test.Source", name: "src" }],
    edges: []
  };
}

describe("strict mode: pending control-event responses", () => {
  it("non-strict: logs a warning and still completes", async () => {
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    try {
      let runner!: WorkflowRunner;
      runner = new WorkflowRunner("job-control-warn", {
        resolveExecutor: () => ({
          async process() {
            (
              runner as unknown as {
                _pendingControlResponses: Map<
                  string,
                  Array<{ resolve: () => void; reject: (e: Error) => void }>
                >;
              }
            )._pendingControlResponses.set("ghost-node", [
              { resolve: () => {}, reject: () => {} }
            ]);
            return { value: 1 };
          }
        })
      });

      const { nodes, edges } = ghostControlResponseGraph();
      const result = await runner.run({ job_id: "job-control-warn" }, { nodes, edges });

      expect(result.status).toBe("completed");
      const logged = stderrSpy.mock.calls
        .map((c) => String(c[0]))
        .join("\n");
      expect(logged).toContain("Pending control-event responses");
      expect(logged).toContain("ghost-node");
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("strict: throws instead, naming the pending node", async () => {
    let runner!: WorkflowRunner;
    runner = new WorkflowRunner("job-control-strict", {
      strict: true,
      resolveExecutor: () => ({
        async process() {
          (
            runner as unknown as {
              _pendingControlResponses: Map<
                string,
                Array<{ resolve: () => void; reject: (e: Error) => void }>
              >;
            }
          )._pendingControlResponses.set("ghost-node", [
            { resolve: () => {}, reject: () => {} }
          ]);
          return { value: 1 };
        }
      })
    });

    const { nodes, edges } = ghostControlResponseGraph();
    const result = await runner.run({ job_id: "job-control-strict" }, { nodes, edges });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Strict mode");
    expect(result.error).toContain("pending control-event responses");
    expect(result.error).toContain("ghost-node");
  });

  it("strict: a cancelled run terminates as cancelled despite an unresolved control response", async () => {
    let runner!: WorkflowRunner;
    runner = new WorkflowRunner("job-control-cancel", {
      strict: true,
      resolveExecutor: () => ({
        async process() {
          (
            runner as unknown as {
              _pendingControlResponses: Map<
                string,
                Array<{ resolve: () => void; reject: (e: Error) => void }>
              >;
            }
          )._pendingControlResponses.set("ghost-node", [
            { resolve: () => {}, reject: () => {} }
          ]);
          runner.cancel();
          return { value: 1 };
        }
      })
    });

    const { nodes, edges } = ghostControlResponseGraph();
    const result = await runner.run({ job_id: "job-control-cancel" }, { nodes, edges });

    expect(result.status).toBe("cancelled");
  });
});

// ---------------------------------------------------------------------------
// Gate 3: _drainActiveEdges (active-edge drain)
// ---------------------------------------------------------------------------
//
// In a real run, any state `_drainActiveEdges` would find is a subset of what
// `_checkPendingInboxWork` already inspects (an inbox's `hasPendingWork()`
// covers every handle, including edge-targeted ones), and that check runs —
// and, in strict mode, throws — earlier in `_processGraph`. So the natural
// end-to-end trigger for *this* gate specifically is not practical to
// construct deterministically without also tripping gate 1 first (§ note in
// `_enforceCleanEdgeDrain`'s doc comment). It is unit-tested directly instead:
// `_enforceCleanEdgeDrain` is the private helper the runner calls with
// `_drainActiveEdges`'s findings, and is independently exercised here with a
// fabricated leftover-edge list against both strict settings, plus the
// "legitimately mid-flight" exemptions (cancelled/node-errored).

describe("strict mode: _drainActiveEdges", () => {
  function makeBareRunner(strict: boolean): WorkflowRunner {
    return new WorkflowRunner("job-edge-drain", {
      strict,
      resolveExecutor: () => ({ process: async (i) => i })
    });
  }

  function internals(runner: WorkflowRunner): {
    _enforceCleanEdgeDrain: (ids: string[]) => void;
    _cancelled: boolean;
    _nodeErrors: Map<string, string>;
  } {
    return runner as unknown as {
      _enforceCleanEdgeDrain: (ids: string[]) => void;
      _cancelled: boolean;
        _nodeErrors: Map<string, string>;
    };
  }

  it("non-strict: does not throw when edges are left buffered/open", () => {
    const runner = makeBareRunner(false);
    expect(() => internals(runner)._enforceCleanEdgeDrain(["e1"])).not.toThrow();
  });

  it("strict: throws, naming the leftover edge", () => {
    const runner = makeBareRunner(true);
    expect(() => internals(runner)._enforceCleanEdgeDrain(["e1", "e2"])).toThrow(
      /Strict mode.*e1.*e2/s
    );
  });

  it("strict: does not throw when nothing was left over", () => {
    const runner = makeBareRunner(true);
    expect(() => internals(runner)._enforceCleanEdgeDrain([])).not.toThrow();
  });

  it("strict: does not throw for a cancelled run (legitimately mid-flight)", () => {
    const runner = makeBareRunner(true);
    const i = internals(runner);
    i._cancelled = true;
    expect(() => i._enforceCleanEdgeDrain(["e1"])).not.toThrow();
  });

  it("strict: does not throw when a node already errored (already reported)", () => {
    const runner = makeBareRunner(true);
    const i = internals(runner);
    i._nodeErrors.set("n", "boom");
    expect(() => i._enforceCleanEdgeDrain(["e1"])).not.toThrow();
  });
});
