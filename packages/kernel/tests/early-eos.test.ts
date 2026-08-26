/**
 * FEATURE A2 integration tests.
 *
 * `outputs.complete(slot)` (early per-slot EOS): a streaming node that calls
 * `outputs.complete("output")` must close its downstream handle's edges
 * immediately, before the producing actor returns — without double-decrementing
 * a handle that still has another open upstream.
 */

import { describe, it, expect } from "vitest";
import { WorkflowRunner } from "../src/runner.js";
import type { NodeExecutor } from "../src/actor.js";
import type {
  NodeDescriptor,
  Edge,
  NodeUpdate
} from "@nodetool-ai/protocol";

function makeRunner(executorMap: Record<string, NodeExecutor>): WorkflowRunner {
  return new WorkflowRunner("test-job", {
    resolveExecutor: (node) => {
      const exec = executorMap[node.id] ?? executorMap[node.type];
      if (!exec) {
        return { async process() { return {}; } };
      }
      return exec;
    }
  });
}

/** A resolvable promise for cross-actor ordering assertions. */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
} {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// ---------------------------------------------------------------------------
// A2 — early per-slot EOS
// ---------------------------------------------------------------------------

describe("A2: outputs.complete(slot) wires early per-slot EOS", () => {
  it("closes the downstream handle before the producing actor returns", async () => {
    const downstreamSawEos = deferred<number>();
    let producerReturnedAt = -1;
    let consumerSawEosAt = -1;
    let tick = 0;

    const producer: NodeExecutor = {
      async process() {
        return {};
      },
      async run(_inputs, outputs) {
        await outputs.emit("output", 1);
        // Early per-slot EOS: should close the consumer's handle now.
        outputs.complete("output");
        // Block until the consumer confirms it observed EOS. If the wiring
        // were a no-op the consumer would only see EOS after _sendEOS runs
        // post-return, and this await would deadlock the run.
        await downstreamSawEos.promise;
        producerReturnedAt = ++tick;
      }
    };

    const consumer: NodeExecutor = {
      async process() {
        return {};
      },
      async run(inputs, outputs) {
        // Drain to completion: the generator ends when the handle closes.
        const seen: unknown[] = [];
        for await (const v of inputs.stream("value")) {
          seen.push(v);
        }
        consumerSawEosAt = ++tick;
        downstreamSawEos.resolve(consumerSawEosAt);
        await outputs.emit("output", seen);
      }
    };

    const nodes: NodeDescriptor[] = [
      { id: "producer", type: "test.Producer", is_streaming_input: true },
      {
        id: "consumer",
        type: "test.Consumer",
        is_streaming_input: true,
        name: "consumer"
      }
    ];
    const edges: Edge[] = [
      {
        source: "producer",
        sourceHandle: "output",
        target: "consumer",
        targetHandle: "value"
      }
    ];

    const runner = makeRunner({ producer, consumer });
    const result = await runner.run({ job_id: "a2-1" }, { nodes, edges });

    expect(result.status).toBe("completed");
    // The consumer observed EOS strictly before the producer returned —
    // proving early completion, not the post-return _sendEOS.
    expect(consumerSawEosAt).toBeGreaterThan(0);
    expect(producerReturnedAt).toBeGreaterThan(consumerSawEosAt);
    // The single emitted value made it through before EOS.
    expect(result.outputs["consumer"]).toBeDefined();
    expect(result.outputs["consumer"]?.[0]).toEqual([1]);
  });

  it("does not over-decrement a handle that still has another open upstream", async () => {
    // Two producers feed the SAME consumer handle (a list-typed handle, so
    // two incoming edges are valid under correlation analysis). The early
    // producer emits, calls complete("output"), AND returns — so both its
    // early per-slot EOS and its post-return _sendEOS run for the same edge.
    // If those double-decremented the handle's upstream count (2 → 0), the
    // handle would close while the late producer is still open. Correct
    // single-marking drops it 2 → 1, keeping the handle open.
    const earlyFinished = deferred<void>();
    const releaseLate = deferred<void>();
    let openAfterEarlyComplete: boolean | undefined;

    const earlyProducer: NodeExecutor = {
      async process() {
        return {};
      },
      async run(_inputs, outputs) {
        await outputs.emit("output", "early");
        outputs.complete("output");
        // Returning here triggers the runner's _sendEOS for this edge too;
        // the early-EOS guard must keep it from marking the edge twice.
      }
    };

    const lateProducer: NodeExecutor = {
      async process() {
        return {};
      },
      async run(_inputs, outputs) {
        // Keep the handle's second upstream open until released.
        await releaseLate.promise;
        await outputs.emit("output", "late");
      }
    };

    const consumer: NodeExecutor = {
      async process() {
        return {};
      },
      async run(inputs, _outputs) {
        // Wait until the early producer has fully finished (complete + EOS),
        // then probe the handle: it must still be open via the late upstream.
        await earlyFinished.promise;
        openAfterEarlyComplete = inputs.hasStream("value");
        releaseLate.resolve();
        for await (const _v of inputs.stream("value")) {
          void _v;
        }
      }
    };

    const nodes: NodeDescriptor[] = [
      { id: "early", type: "test.Early", is_streaming_input: true },
      { id: "late", type: "test.Late", is_streaming_input: true },
      {
        id: "consumer",
        type: "test.Consumer",
        is_streaming_input: true,
        name: "consumer",
        propertyTypes: { value: "list[str]" }
      }
    ];
    const edges: Edge[] = [
      {
        source: "early",
        sourceHandle: "output",
        target: "consumer",
        targetHandle: "value"
      },
      {
        source: "late",
        sourceHandle: "output",
        target: "consumer",
        targetHandle: "value"
      }
    ];

    // Signal once the early actor's run() + EOS have settled. We approximate
    // "early fully finished" by resolving after a microtask/macrotask gap so
    // the runner's post-return _sendEOS for the early edge has executed.
    const wrappedEarly: NodeExecutor = {
      async process() {
        return {};
      },
      async run(inputs, outputs, ctx) {
        await earlyProducer.run!(inputs, outputs, ctx);
        // Defer so the runner finishes its _sendEOS bookkeeping for the
        // early edge before the consumer probes the handle.
        setTimeout(() => earlyFinished.resolve(), 20);
      }
    };
    const runner2 = makeRunner({
      early: wrappedEarly,
      late: lateProducer,
      consumer
    });
    const result = await runner2.run({ job_id: "a2-2" }, { nodes, edges });

    expect(result.status).toBe("completed");
    // The early complete + EOS marked its edge done exactly once; the late
    // edge kept the handle open (no double-decrement of the upstream count).
    expect(openAfterEarlyComplete).toBe(true);
  });
});
