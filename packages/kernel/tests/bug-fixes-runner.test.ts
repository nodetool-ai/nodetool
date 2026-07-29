/**
 * Regression tests for five confirmed WorkflowRunner bugs
 * (docs/KERNEL_RUNNER_ANALYSIS.md findings #1, #6, #3, #16, #17).
 */

import { describe, it, expect } from "vitest";
import { WorkflowRunner } from "../src/runner.js";
import type {
  NodeDescriptor,
  Edge,
  EdgeUpdate,
  JobUpdate
} from "@nodetool-ai/protocol";
import type { NodeExecutor } from "../src/actor.js";

function simpleExecutor(
  fn: (inputs: Record<string, unknown>) => Record<string, unknown>
): NodeExecutor {
  return {
    async process(inputs) {
      return fn(inputs);
    }
  };
}

// ---------------------------------------------------------------------------
// #1 — edge status must not regress from "completed" back to "active"
// ---------------------------------------------------------------------------

describe("bug #1: edge status does not regress to active after completed", () => {
  it("last edge_update on a throttled edge is completed, not active", async () => {
    // A streaming-output node emits two values back-to-back (well inside the
    // 1s throttle window), so the edge's counter advances to 2 with only the
    // first update emitted — the edge is left dirty. When the node finishes,
    // _sendEOS emits "completed" (counter 2); the run-end flush must NOT
    // re-emit "active" for that already-completed edge.
    const nodes: NodeDescriptor[] = [
      { id: "trig", type: "test.Input", name: "trig" },
      { id: "streamer", type: "test.Streamer", is_streaming_output: true },
      { id: "sink", type: "test.Sink", name: "sink" }
    ];
    const edges: Edge[] = [
      {
        id: "e-trig",
        source: "trig",
        sourceHandle: "value",
        target: "streamer",
        targetHandle: "start"
      },
      {
        id: "e-stream",
        source: "streamer",
        sourceHandle: "value",
        target: "sink",
        targetHandle: "value"
      }
    ];

    const runner = new WorkflowRunner("job-edge-status", {
      resolveExecutor: (node) => {
        if (node.type === "test.Streamer") {
          return {
            async *genProcess() {
              yield { value: 1 };
              yield { value: 2 };
            }
          };
        }
        return simpleExecutor((inputs) => ({ value: inputs.value }));
      }
    });

    const result = await runner.run(
      { job_id: "job-edge-status", params: { trig: 0 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");

    const streamEdge = result.messages.filter(
      (m) => m.type === "edge_update" && (m as EdgeUpdate).edge_id === "e-stream"
    ) as EdgeUpdate[];
    expect(streamEdge.length).toBeGreaterThanOrEqual(1);
    const last = streamEdge[streamEdge.length - 1];
    expect(last.status).toBe("completed");
    expect(last.counter).toBe(2);
    // And no "active" update appears after the "completed" one.
    const completedIdx = streamEdge.findIndex((m) => m.status === "completed");
    expect(
      streamEdge.slice(completedIdx + 1).some((m) => m.status === "active")
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// #6 — _dispatchInputs must not leak the raw value onto omitted handles
// ---------------------------------------------------------------------------

describe("bug #6: dispatch fallback does not leak raw value per handle", () => {
  it("an input that emits only handle 'a' leaves handle 'b' silent", async () => {
    const received: Record<string, Array<Record<string, unknown>>> = {
      targetA: [],
      targetB: []
    };
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "targetA", type: "test.Sink", name: "a" },
      { id: "targetB", type: "test.Sink", name: "b" }
    ];
    const edges: Edge[] = [
      {
        id: "ea",
        source: "in",
        sourceHandle: "a",
        target: "targetA",
        targetHandle: "in"
      },
      {
        id: "eb",
        source: "in",
        sourceHandle: "b",
        target: "targetB",
        targetHandle: "in"
      }
    ];

    const runner = new WorkflowRunner("job-dispatch-leak", {
      resolveExecutor: (node) => {
        if (node.type === "test.Input") {
          // Emits only handle "a"; "b" is legitimately omitted.
          return simpleExecutor(() => ({ a: 1 }));
        }
        return {
          async process(inputs) {
            received[node.id].push({ ...inputs });
            return {};
          }
        };
      }
    });

    const result = await runner.run(
      { job_id: "job-dispatch-leak", params: { x: 99 } },
      { nodes, edges }
    );

    // The run still completes: handle "b" closes (EOS) even though no value
    // was delivered, so targetB does not hang.
    expect(result.status).toBe("completed");
    // targetA received the real handle value.
    expect(received.targetA.some((r) => r.in === 1)).toBe(true);
    // targetB never received the raw input value (99) or anything on "in".
    expect(received.targetB.some((r) => r.in !== undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// #3 — pushInputValue runs the input node's process()
// ---------------------------------------------------------------------------

describe("bug #3: pushInputValue routes through the node's process()", () => {
  it("delivers the transformed value, not the raw streamed value", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "stream_in", type: "test.Input", name: "stream_in" },
      { id: "sink", type: "test.Sink", name: "result" }
    ];
    const edges: Edge[] = [
      {
        id: "e1",
        source: "stream_in",
        sourceHandle: "output",
        target: "sink",
        targetHandle: "value"
      }
    ];

    const runner = new WorkflowRunner("job-push-transform", {
      resolveExecutor: (node) => {
        if (node.type === "test.Input") {
          // Transform: double the value and emit it on the "output" handle.
          return simpleExecutor((inputs) => ({
            output: (inputs.value as number) * 2
          }));
        }
        return simpleExecutor((inputs) => ({ value: inputs.value }));
      }
    });

    const runPromise = runner.run(
      { job_id: "job-push-transform", params: {} },
      { nodes, edges }
    );
    await new Promise((r) => setTimeout(r, 10));
    await runner.pushInputValue("stream_in", 5);
    runner.finishInputStream("stream_in");

    const result = await runPromise;
    expect(result.status).toBe("completed");
    // 5 → process() doubles → 10 (not the raw 5).
    expect(result.outputs.result).toContain(10);
    expect(result.outputs.result).not.toContain(5);
  });

  it("does not leak the raw value onto handles the process() omits", async () => {
    const received: Record<string, Array<Record<string, unknown>>> = {
      sinkA: [],
      sinkB: []
    };
    const nodes: NodeDescriptor[] = [
      { id: "stream_in", type: "test.Input", name: "stream_in" },
      { id: "sinkA", type: "test.Sink", name: "a" },
      { id: "sinkB", type: "test.Sink", name: "b" }
    ];
    const edges: Edge[] = [
      {
        id: "ea",
        source: "stream_in",
        sourceHandle: "a",
        target: "sinkA",
        targetHandle: "in"
      },
      {
        id: "eb",
        source: "stream_in",
        sourceHandle: "b",
        target: "sinkB",
        targetHandle: "in"
      }
    ];

    const runner = new WorkflowRunner("job-push-omit", {
      resolveExecutor: (node) => {
        if (node.type === "test.Input") {
          return simpleExecutor((inputs) => ({ a: inputs.value }));
        }
        return {
          async process(inputs) {
            received[node.id].push({ ...inputs });
            return {};
          }
        };
      }
    });

    const runPromise = runner.run(
      { job_id: "job-push-omit", params: {} },
      { nodes, edges }
    );
    await new Promise((r) => setTimeout(r, 10));
    await runner.pushInputValue("stream_in", 7);
    runner.finishInputStream("stream_in");

    const result = await runPromise;
    expect(result.status).toBe("completed");
    expect(received.sinkA.some((r) => r.in === 7)).toBe(true);
    expect(received.sinkB.some((r) => r.in !== undefined)).toBe(false);
  });

  it("throws a wrapped error when the input node's process() fails", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "stream_in", type: "test.Input", name: "stream_in" },
      { id: "sink", type: "test.Sink", name: "sink" }
    ];
    const edges: Edge[] = [
      {
        id: "e1",
        source: "stream_in",
        sourceHandle: "output",
        target: "sink",
        targetHandle: "value"
      }
    ];

    const runner = new WorkflowRunner("job-push-error", {
      resolveExecutor: (node) => {
        if (node.type === "test.Input") {
          return {
            async process() {
              throw new Error("boom in input");
            }
          };
        }
        return simpleExecutor((inputs) => ({ value: inputs.value }));
      }
    });

    const runPromise = runner.run(
      { job_id: "job-push-error", params: {} },
      { nodes, edges }
    );
    await new Promise((r) => setTimeout(r, 10));

    await expect(runner.pushInputValue("stream_in", 1)).rejects.toThrow(
      /stream_in.*test\.Input.*boom in input/
    );

    // Close the stream so the still-running graph terminates.
    runner.finishInputStream("stream_in");
    const result = await runPromise;
    expect(result.status).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// #16 — edge_update and job_update carry the same (request) job id
// ---------------------------------------------------------------------------

describe("bug #16: one job id per run for both message kinds", () => {
  it("edge_update messages use request.job_id, not the constructor id", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "proc", type: "test.Proc" },
      { id: "out", type: "test.Output", name: "result" }
    ];
    const edges: Edge[] = [
      {
        id: "e1",
        source: "in",
        sourceHandle: "value",
        target: "proc",
        targetHandle: "a"
      },
      {
        id: "e2",
        source: "proc",
        sourceHandle: "result",
        target: "out",
        targetHandle: "value"
      }
    ];

    // Constructor id differs from the request id on purpose.
    const runner = new WorkflowRunner("ctor-job-id", {
      resolveExecutor: (node) =>
        node.type === "test.Proc"
          ? simpleExecutor((inputs) => ({ result: inputs.a }))
          : simpleExecutor((inputs) => ({ value: inputs.value }))
    });

    const result = await runner.run(
      { job_id: "request-job-id", params: { x: 1 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");

    const edgeUpdates = result.messages.filter(
      (m) => m.type === "edge_update"
    ) as EdgeUpdate[];
    const jobUpdates = result.messages.filter(
      (m) => m.type === "job_update"
    ) as JobUpdate[];

    expect(edgeUpdates.length).toBeGreaterThanOrEqual(1);
    // Every edge_update carries the request job id — the same one job_update
    // uses — so clients can associate them.
    expect(edgeUpdates.every((m) => m.job_id === "request-job-id")).toBe(true);
    expect(jobUpdates.every((m) => m.job_id === "request-job-id")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// #17 — runner lifecycle: cancel-before-run + concurrent-run guard
// ---------------------------------------------------------------------------

describe("bug #17: runner lifecycle races", () => {
  it("a cancel() before run() still terminates the run as cancelled", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "out", type: "test.Output", name: "result" }
    ];
    const edges: Edge[] = [
      {
        id: "e1",
        source: "in",
        sourceHandle: "value",
        target: "out",
        targetHandle: "value"
      }
    ];

    const runner = new WorkflowRunner("job-cancel-early", {
      resolveExecutor: () => simpleExecutor((inputs) => ({ value: inputs.value }))
    });

    // Cancel lands between construction and run().
    runner.cancel();

    const result = await runner.run(
      { job_id: "job-cancel-early", params: { x: 1 } },
      { nodes, edges }
    );
    expect(result.status).toBe("cancelled");
  });

  it("a second concurrent run() is rejected", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "slow", type: "test.Slow" }
    ];
    const edges: Edge[] = [
      {
        id: "e1",
        source: "in",
        sourceHandle: "value",
        target: "slow",
        targetHandle: "a"
      }
    ];

    const runner = new WorkflowRunner("job-concurrent", {
      resolveExecutor: (node) =>
        node.type === "test.Slow"
          ? {
              async process() {
                await new Promise((r) => setTimeout(r, 150));
                return { result: 1 };
              }
            }
          : simpleExecutor((inputs) => ({ value: inputs.value }))
    });

    const first = runner.run(
      { job_id: "job-concurrent-1", params: { x: 1 } },
      { nodes, edges }
    );
    // Let the first run enter _runImpl and mark itself in-flight.
    await new Promise((r) => setTimeout(r, 20));

    await expect(
      runner.run({ job_id: "job-concurrent-2", params: { x: 2 } }, { nodes, edges })
    ).rejects.toThrow(/already running/);

    const result = await first;
    expect(result.status).toBe("completed");
  });
});
