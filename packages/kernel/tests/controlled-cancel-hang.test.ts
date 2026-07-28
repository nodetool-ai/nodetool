/**
 * Regression: cancelling a run must be able to stop a controlled actor that is
 * parked in `_waitForDataInputs`.
 *
 * `NodeInbox.closeAll()` leaves `_openCounts` untouched, so `isOpen(handle)`
 * stays true forever after a close. The controlled wait used only
 * `isOpen() || hasBuffered()` to decide a handle was unsatisfiable, then parked
 * on `waitForActivity()` — which, before the fix, had no closed-latch, so a
 * waiter registered after `closeAll()` was never resolved. The actor blocked
 * permanently and `runner.run()` never resolved.
 */
import { describe, it, expect } from "vitest";
import { NodeActor, type NodeExecutor } from "../src/actor.js";
import { NodeInbox } from "../src/inbox.js";
import { WorkflowRunner } from "../src/runner.js";
import type { NodeAnalysis } from "../src/correlation-analysis.js";
import type { Edge, NodeDescriptor } from "@nodetool-ai/protocol";

const EMPTY_ANALYSIS: NodeAnalysis = {
  invocationScope: [],
  inputs: new Map(),
  outputs: new Map()
};

const NOOP_EXECUTOR: NodeExecutor = {
  async process() {
    return {};
  }
};

function makeControlledActor(inbox: NodeInbox): NodeActor {
  const node: NodeDescriptor = {
    id: "worker",
    type: "test.Worker",
    is_controlled: true
  };
  return new NodeActor({
    node,
    inbox,
    executor: NOOP_EXECUTOR,
    correlation: EMPTY_ANALYSIS,
    sendOutputs: async () => {},
    emitMessage: () => {}
  });
}

/** Reject if `p` has not settled within `ms`. */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out after ${ms}ms`)),
          ms
        );
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

describe("controlled actor — cancel while waiting for data inputs", () => {
  it("run() resolves when the inbox is closed before the actor starts", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("value", 1);
    inbox.addUpstream("__control__", 1);
    const actor = makeControlledActor(inbox);

    await inbox.closeAll();

    await expect(withTimeout(actor.run(), 1000)).resolves.toBeDefined();
  });

  it("run() resolves when the inbox is closed while the actor is parked", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("value", 1);
    inbox.addUpstream("__control__", 1);
    const actor = makeControlledActor(inbox);

    const running = actor.run();
    // Let the actor reach the wait loop and park on waitForActivity().
    await new Promise((r) => setTimeout(r, 20));
    await inbox.closeAll();

    await expect(withTimeout(running, 1000)).resolves.toBeDefined();
  });

  it("a non-cancelled run still blocks until data arrives", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("value", 1);
    inbox.addUpstream("__control__", 1);
    const processed: Array<Record<string, unknown>> = [];
    const node: NodeDescriptor = {
      id: "worker",
      type: "test.Worker",
      is_controlled: true
    };
    const actor = new NodeActor({
      node,
      inbox,
      executor: {
        async process(inputs) {
          processed.push(inputs);
          return {};
        }
      },
      correlation: EMPTY_ANALYSIS,
      sendOutputs: async () => {},
      emitMessage: () => {}
    });

    const running = actor.run();

    // A control event alone must not start execution: the data handle is still
    // open and empty, so the actor stays parked.
    await inbox.put("__control__", { event_type: "run" });
    await new Promise((r) => setTimeout(r, 30));
    expect(processed).toHaveLength(0);

    // Data arrives — now the held control event is replayed and processed.
    await inbox.put("value", 42);
    inbox.markSourceDone("value");
    inbox.markSourceDone("__control__");

    await withTimeout(running, 1000);
    expect(processed).toHaveLength(1);
    expect(processed[0].value).toBe(42);
  });
});

describe("WorkflowRunner.cancel() with a controlled node awaiting data", () => {
  it("run() resolves after cancel when the data source never emits", async () => {
    // Production shape: a controlled node fed by a streaming source that never
    // emits (and so never EOSes its data handle). The worker parks in
    // _waitForDataInputs; only closeAll() can release it.
    const nodes: NodeDescriptor[] = [
      {
        id: "src",
        type: "test.Input",
        is_streaming_output: true,
        outputs: { output: "int" }
      },
      {
        id: "ctrl",
        type: "test.Controller",
        is_streaming_input: true,
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
        id: "e1",
        source: "src",
        sourceHandle: "output",
        target: "worker",
        targetHandle: "value"
      },
      {
        id: "ce1",
        source: "ctrl",
        sourceHandle: "__control__",
        target: "worker",
        targetHandle: "__control__",
        edge_type: "control"
      }
    ];

    // `src` is a streaming-output input node: _dispatchInputs pushes nothing
    // and deliberately never EOSes the worker's "value" handle, and no actor is
    // spawned for it. The controller idles until the run is cancelled.
    const idleSource: NodeExecutor = {
      async process() {
        return {};
      },
      async run(inputs) {
        const signal = (inputs as { signal: AbortSignal }).signal;
        while (!signal.aborted) {
          await new Promise((r) => setTimeout(r, 5));
        }
      }
    };

    const runner = new WorkflowRunner("job-cancel-controlled", {
      resolveExecutor: (node) =>
        node.id === "worker"
          ? { process: async () => ({ result: 1 }) }
          : idleSource
    });

    const running = runner.run(
      { job_id: "job-cancel-controlled" },
      { nodes, edges }
    );
    await new Promise((r) => setTimeout(r, 50));
    runner.cancel();

    const result = await withTimeout(running, 3000);
    expect(result.status).toBe("cancelled");
  }, 10000);
});

describe("NodeInbox close semantics", () => {
  it("isClosed() reflects closeAll()", async () => {
    const inbox = new NodeInbox();
    expect(inbox.isClosed()).toBe(false);
    await inbox.closeAll();
    expect(inbox.isClosed()).toBe(true);
  });

  it("waitForActivity() resolves immediately when already closed", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    await inbox.closeAll();
    await expect(
      withTimeout(inbox.waitForActivity(), 1000)
    ).resolves.toBeUndefined();
  });

  it("waitForActivity() still blocks on an open, idle inbox", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    let settled = false;
    void inbox.waitForActivity().then(() => {
      settled = true;
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(settled).toBe(false);
    await inbox.put("a", 1);
    await new Promise((r) => setTimeout(r, 0));
    expect(settled).toBe(true);
  });
});
