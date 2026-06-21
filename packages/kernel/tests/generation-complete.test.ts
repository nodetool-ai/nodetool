/**
 * `generation_complete` emission (RFC: generation-events §5 / §13).
 *
 * The actor emits a BARE `generation_complete` (no `job_id`, no `index`) at
 * each point a COMPLETE process() result is committed — the same boundaries
 * where `_latestResult` is assigned for a finished execution:
 *
 *   - correlated process()       → one per ready key (N/run for a generator)
 *   - controlled-loop process()  → one per "run" control event
 *   - legacy single process()    → once
 *   - genProcess stream-end      → ONCE per stream (overwrite-merged outputs)
 *
 * It routes through the same `_emit` path `node_update` uses, so it is NEVER
 * edge-suppressed and never audio-dropped. Constant/input nodes emit none.
 */

import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { NodeActor, type NodeExecutor } from "../src/actor.js";
import { NodeInbox } from "../src/inbox.js";
import type { NodeAnalysis } from "../src/correlation-analysis.js";
import type {
  GenerationComplete,
  NodeDescriptor,
  NodeUpdate
} from "@nodetool-ai/protocol";
import { configureLogging } from "@nodetool-ai/config";
import {
  runWorkflow,
  foreachNode,
  iterationOutput,
  dataEdge
} from "./correlation/_harness.js";

const EMPTY_ANALYSIS: NodeAnalysis = {
  invocationScope: [],
  inputs: new Map(),
  outputs: new Map()
};

function makeNode(overrides: Partial<NodeDescriptor> = {}): NodeDescriptor {
  return { id: "test_node", type: "test.Node", ...overrides };
}

function createActor(
  node: NodeDescriptor,
  inbox: NodeInbox,
  executor: NodeExecutor
): { actor: NodeActor; messages: unknown[] } {
  const messages: unknown[] = [];
  const actor = new NodeActor({
    node,
    inbox,
    executor,
    correlation: EMPTY_ANALYSIS,
    sendOutputs: async () => {},
    emitMessage: (msg) => messages.push(msg)
  });
  return { actor, messages };
}

function generationCompletes(messages: unknown[]): GenerationComplete[] {
  return messages.filter(
    (m) => (m as { type?: string }).type === "generation_complete"
  ) as GenerationComplete[];
}

function completedUpdates(messages: unknown[]): NodeUpdate[] {
  return messages.filter(
    (m) =>
      (m as NodeUpdate).type === "node_update" &&
      (m as NodeUpdate).status === "completed"
  ) as NodeUpdate[];
}

let originalLogLevel: string | undefined;

beforeEach(() => {
  originalLogLevel = process.env["NODETOOL_LOG_LEVEL"];
  process.env["NODETOOL_LOG_LEVEL"] = "info";
  configureLogging();
});

afterEach(() => {
  if (originalLogLevel === undefined) {
    delete process.env["NODETOOL_LOG_LEVEL"];
  } else {
    process.env["NODETOOL_LOG_LEVEL"] = originalLogLevel;
  }
  configureLogging();
  vi.restoreAllMocks();
});

describe("generation_complete — actor emit shape (bare)", () => {
  it("legacy single process() emits exactly one bare generation_complete", async () => {
    const node = makeNode();
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    const executor: NodeExecutor = {
      async process() {
        return { result: 42 };
      }
    };
    const { actor, messages } = createActor(node, inbox, executor);

    await inbox.put("a", 1);
    inbox.markSourceDone("a");
    await actor.run();

    const gens = generationCompletes(messages);
    expect(gens).toHaveLength(1);
    const g = gens[0];
    expect(g.type).toBe("generation_complete");
    expect(g.node_id).toBe("test_node");
    expect(g.node_name).toBe("test.Node"); // node.name ?? node.type
    expect(g.node_type).toBe("test.Node");
    expect(g.outputs).toEqual({ result: 42 });
    // BARE — the actor stamps NO job_id and NO index (stamped downstream, D8).
    expect(g.job_id).toBeUndefined();
    expect(g.index).toBeUndefined();
  });

  it("controlled-loop emits one generation_complete per 'run' event", async () => {
    const node = makeNode({ is_controlled: true });
    const inbox = new NodeInbox();
    inbox.addUpstream("__control__", 1);
    inbox.addUpstream("x", 1);

    const executor: NodeExecutor = {
      async process(inputs) {
        return { out: inputs.threshold };
      }
    };
    const { actor, messages } = createActor(node, inbox, executor);

    await inbox.put("x", 100);
    await inbox.put("__control__", {
      event_type: "run" as const,
      properties: { threshold: 0.5 }
    });
    await inbox.put("__control__", {
      event_type: "run" as const,
      properties: { threshold: 0.9 }
    });
    await inbox.put("__control__", { event_type: "stop" as const });
    inbox.markSourceDone("__control__");
    inbox.markSourceDone("x");

    await actor.run();

    const gens = generationCompletes(messages);
    expect(gens).toHaveLength(2);
    expect(gens.map((g) => g.outputs)).toEqual([
      { out: 0.5 },
      { out: 0.9 }
    ]);
    expect(gens.every((g) => g.job_id === undefined)).toBe(true);
    expect(gens.every((g) => g.index === undefined)).toBe(true);
    // Lifecycle still collapses to one completed update.
    expect(completedUpdates(messages)).toHaveLength(1);
  });
});

describe("generation_complete — genProcess stream-end", () => {
  it("emits N output_update yields + exactly ONE generation_complete at stream-end", async () => {
    const node = makeNode({ is_streaming_output: true, sync_mode: "zip_all" });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    // A generator that streams chunks then a final consolidating whole-value
    // yield (Summarizer-style). The overwrite-merged stream-end dict holds the
    // complete artifact.
    const executor: NodeExecutor = {
      async process() {
        return {};
      },
      async *genProcess(inputs) {
        const val = inputs.a as string;
        yield { text: { type: "chunk", content: "a" } };
        yield { text: { type: "chunk", content: "b" } };
        yield { text: `${val}-final`, output: `${val}-final` };
      }
    };
    const sent: Array<Record<string, unknown>> = [];
    const messages: unknown[] = [];
    const actor = new NodeActor({
      node,
      inbox,
      executor,
      correlation: EMPTY_ANALYSIS,
      sendOutputs: async (_id, outputs) => {
        sent.push(outputs);
      },
      emitMessage: (msg) => messages.push(msg)
    });

    await inbox.put("a", "hi");
    inbox.markSourceDone("a");
    await actor.run();

    // Per-yield partials route to _sendOutputs (→ output_update), not gen_complete.
    expect(sent).toHaveLength(3);

    const gens = generationCompletes(messages);
    expect(gens).toHaveLength(1);
    // Stream-end carries the consolidated whole value, NOT a per-yield chunk.
    expect(gens[0].outputs).toEqual({
      text: "hi-final",
      output: "hi-final"
    });
  });

  it("GUARD (documented limitation): multi-artifact-per-slot streaming loses prior content", async () => {
    // A generator that streams N distinct savable artifacts on the SAME output
    // slot with no consolidating final yield. Because `_streamingCollectedOutputs`
    // is an overwrite-merge, the single stream-end generation_complete carries
    // ONLY the last artifact — the prior ones are lost. Multi-artifact-per-slot
    // streaming generators are OUT OF SCOPE (RFC §5 invariant / Decision 1
    // corollary). This test asserts the loss so a future author of such a node
    // hits a failing test, not silent data loss.
    const node = makeNode({ is_streaming_output: true, sync_mode: "zip_all" });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    const executor: NodeExecutor = {
      async process() {
        return {};
      },
      async *genProcess() {
        // Three whole artifacts on the same slot, no consolidating yield.
        yield { image: "artifact-0" };
        yield { image: "artifact-1" };
        yield { image: "artifact-2" };
      }
    };
    const { actor, messages } = createActor(node, inbox, executor);

    await inbox.put("a", 1);
    inbox.markSourceDone("a");
    await actor.run();

    const gens = generationCompletes(messages);
    expect(gens).toHaveLength(1);
    // DOCUMENTED LOSS: only the last artifact survives the overwrite-merge.
    expect(gens[0].outputs).toEqual({ image: "artifact-2" });
  });
});

describe("generation_complete — constant/input skip (no generation)", () => {
  it("nodetool.constant.* emits no generation_complete", async () => {
    const node = makeNode({ type: "nodetool.constant.String" });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    const executor: NodeExecutor = {
      async process() {
        return { output: "hello" };
      }
    };
    const { actor, messages } = createActor(node, inbox, executor);

    await inbox.put("a", 1);
    inbox.markSourceDone("a");
    await actor.run();

    expect(generationCompletes(messages)).toHaveLength(0);
    // Lifecycle still fires.
    expect(completedUpdates(messages)).toHaveLength(1);
  });

  it("nodetool.input.* emits no generation_complete", async () => {
    const node = makeNode({ type: "nodetool.input.StringInput" });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    const executor: NodeExecutor = {
      async process() {
        return { output: "param" };
      }
    };
    const { actor, messages } = createActor(node, inbox, executor);

    await inbox.put("a", 1);
    inbox.markSourceDone("a");
    await actor.run();

    expect(generationCompletes(messages)).toHaveLength(0);
  });
});

describe("generation_complete — correlated fan-out (runner)", () => {
  it("a 6x correlated generator emits 6 bare generation_complete + ONE node_update{completed}", async () => {
    const list = ["i0", "i1", "i2", "i3", "i4", "i5"];
    const { result } = await runWorkflow({
      jobId: "gen-6x",
      nodes: [
        {
          id: "src",
          type: "nodetool.input.IntegerInput",
          name: "items",
          properties: { value: list }
        },
        {
          id: "fe",
          type: "nodetool.control.ForEach",
          is_streaming_output: true,
          outputs: { output: "any", index: "int" },
          output_correlation: {
            output: iterationOutput("items"),
            index: iterationOutput("items")
          }
        },
        // Buffered consumer: fires once per arriving lineage key (6×) on the
        // correlated process() path (site #1). Terminal `image` handle.
        {
          id: "gen",
          type: "test.TextToImage",
          outputs: { image: "any" }
        }
      ],
      edges: [
        dataEdge("src", "value", "fe", "input_list", "eSrc"),
        dataEdge("fe", "output", "gen", "prompt", "eFe")
      ],
      executors: {
        fe: foreachNode(),
        gen: {
          async process(ins) {
            return { image: `img(${ins.prompt})` };
          }
        }
      }
    });

    expect(result.status).toBe("completed");

    const genMsgs = result.messages.filter(
      (m) => m.type === "generation_complete" && m.node_id === "gen"
    ) as GenerationComplete[];
    expect(genMsgs).toHaveLength(6);
    // Each carries a distinct artifact; actor emit is bare (no job_id/index).
    expect(genMsgs.map((g) => g.outputs)).toEqual(
      list.map((p) => ({ image: `img(${p})` }))
    );
    expect(genMsgs.every((g) => g.job_id === undefined)).toBe(true);
    expect(genMsgs.every((g) => g.index === undefined)).toBe(true);

    // Lifecycle collapses to ONE completed update for the consumer.
    const completed = result.messages.filter(
      (m) =>
        m.type === "node_update" &&
        m.node_id === "gen" &&
        m.status === "completed"
    );
    expect(completed).toHaveLength(1);
  });

  it("generation_complete is never edge-suppressed (intermediate generator feeding a sink)", async () => {
    // `gen` has an OUTGOING data edge to `sink` — its output_update would be
    // edge-suppressed, but generation_complete must still be emitted.
    const list = ["a", "b", "c"];
    const { result } = await runWorkflow({
      jobId: "gen-suppress",
      nodes: [
        {
          id: "src",
          type: "nodetool.input.IntegerInput",
          name: "items",
          properties: { value: list }
        },
        {
          id: "fe",
          type: "nodetool.control.ForEach",
          is_streaming_output: true,
          outputs: { output: "any", index: "int" },
          output_correlation: {
            output: iterationOutput("items"),
            index: iterationOutput("items")
          }
        },
        { id: "gen", type: "test.Mapper", outputs: { value: "any" } },
        { id: "sink", type: "test.Sink", is_streaming_input: true }
      ],
      edges: [
        dataEdge("src", "value", "fe", "input_list", "eSrc"),
        dataEdge("fe", "output", "gen", "value", "eFe"),
        // gen.value → sink: an OUTGOING data edge that suppresses output_update.
        dataEdge("gen", "value", "sink", "value", "eGen")
      ],
      executors: {
        fe: foreachNode(),
        gen: {
          async process(ins) {
            return { value: `m(${ins.value})` };
          }
        }
      },
      captureFrom: { sink: ["value"] }
    });

    expect(result.status).toBe("completed");

    // output_update for gen's connected handle is suppressed.
    const outputUpdates = result.messages.filter(
      (m) => m.type === "output_update" && m.node_id === "gen"
    );
    expect(outputUpdates).toHaveLength(0);

    // generation_complete is NOT suppressed — all 3 survive.
    const genMsgs = result.messages.filter(
      (m) => m.type === "generation_complete" && m.node_id === "gen"
    ) as GenerationComplete[];
    expect(genMsgs).toHaveLength(3);
    expect(genMsgs.map((g) => g.outputs)).toEqual(
      list.map((v) => ({ value: `m(${v})` }))
    );
  });
});
