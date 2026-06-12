/**
 * Run-level cancellation signal: `WorkflowRunner.cancel()` aborts an
 * AbortController whose signal reaches node code via `NodeInputs.signal`.
 * Inbox closure only unblocks consumers — this signal is how producing
 * loops (generators, wall-clock pacers) learn the run is over.
 */
import { describe, it, expect } from "vitest";
import { WorkflowRunner } from "../src/runner.js";
import { NodeActor, type NodeExecutor } from "../src/actor.js";
import { NodeInbox } from "../src/inbox.js";
import { NodeInputs } from "../src/io.js";
import type { NodeAnalysis } from "../src/correlation-analysis.js";
import type { NodeDescriptor } from "@nodetool-ai/protocol";

const EMPTY_ANALYSIS: NodeAnalysis = {
  invocationScope: [],
  inputs: new Map(),
  outputs: new Map()
};

describe("NodeInputs.signal", () => {
  it("defaults to a never-aborted signal", () => {
    const inputs = new NodeInputs(new NodeInbox());
    expect(inputs.signal.aborted).toBe(false);
  });

  it("exposes the supplied signal", () => {
    const controller = new AbortController();
    const inputs = new NodeInputs(
      new NodeInbox(),
      null,
      undefined,
      controller.signal
    );
    expect(inputs.signal.aborted).toBe(false);
    controller.abort();
    expect(inputs.signal.aborted).toBe(true);
  });
});

describe("NodeActor cancelSignal wiring", () => {
  it("passes cancelSignal through to inputs.signal in run()", async () => {
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    const node: NodeDescriptor = {
      id: "n1",
      type: "test.Streaming",
      is_streaming_input: true
    };
    const executor: NodeExecutor = {
      async process() {
        return {};
      },
      async run(inputs) {
        seen = (inputs as { signal: AbortSignal }).signal;
      }
    };
    const actor = new NodeActor({
      node,
      inbox: new NodeInbox(),
      executor,
      correlation: EMPTY_ANALYSIS,
      sendOutputs: async () => {},
      emitMessage: () => {},
      cancelSignal: controller.signal
    });
    await actor.run();
    expect(seen).toBeDefined();
    expect(seen!.aborted).toBe(false);
    controller.abort();
    expect(seen!.aborted).toBe(true);
  });
});

describe("WorkflowRunner.cancel() aborts the run signal", () => {
  it("a producing streaming node observes the abort and stops", async () => {
    let observed: AbortSignal | undefined;
    let stoppedByAbort = false;

    const nodes: NodeDescriptor[] = [
      {
        id: "src",
        type: "test.InfiniteSource",
        is_streaming_input: true,
        outputs: { out: "int" }
      },
      { id: "sink", type: "test.Sink", outputs: { result: "int" } }
    ];
    const edges = [
      { source: "src", sourceHandle: "out", target: "sink", targetHandle: "a" }
    ];

    const sourceExecutor: NodeExecutor = {
      async process() {
        return {};
      },
      async run(inputs, outputs) {
        observed = (inputs as { signal: AbortSignal }).signal;
        // Producing loop with no input waits — only the signal can stop it.
        for (let i = 0; i < 10_000; i++) {
          if (observed.aborted) {
            stoppedByAbort = true;
            return;
          }
          await outputs.emit("out", i);
          await new Promise((r) => setTimeout(r, 1));
        }
      }
    };
    const sinkExecutor: NodeExecutor = {
      async process() {
        return { result: 0 };
      }
    };

    const runner = new WorkflowRunner("job-cancel", {
      resolveExecutor: (node) =>
        node.id === "src" ? sourceExecutor : sinkExecutor
    });

    const runPromise = runner.run({ job_id: "job-cancel" }, { nodes, edges });
    await new Promise((r) => setTimeout(r, 50));
    runner.cancel();
    const result = await runPromise;

    expect(result.status).toBe("cancelled");
    expect(observed?.aborted).toBe(true);
    expect(stoppedByAbort).toBe(true);
  });
});
