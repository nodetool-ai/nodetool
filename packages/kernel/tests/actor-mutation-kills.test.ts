/**
 * Behavioural contracts of `NodeActor` that the rest of the suite leaves
 * unpinned. Written against the mutation-testing survivor list for
 * `src/actor.ts`; every test here pins one externally-observable contract:
 *
 *  - `generation_complete.properties` — the scalar filter (what the relay
 *    persists into asset metadata).
 *  - Streaming-input `NodeOutputs` callbacks — per-slot lineage minting,
 *    aggregate collapse, early slot EOS, `drop()`, `emitGroup()`.
 *  - The correlated scheduler's final "no max-scope inputs" fire-once block —
 *    prefix sticky, prefix-list aggregation across parent keys, empty-scope
 *    list aggregation.
 *  - Iteration-token bookkeeping — one token per group per frame, counters
 *    scoped per parent key.
 *  - `_executeWithInputs` merge order and control-context injection.
 */

import { describe, it, expect } from "vitest";
import {
  NodeActor,
  type NodeExecutor,
  type OutputRoutingHints
} from "../src/actor.js";
import { NodeInbox, type MessageEnvelope } from "../src/inbox.js";
import type { NodeInputs, NodeOutputs } from "../src/io.js";
import type { InputAnalysis, NodeAnalysis } from "../src/correlation-analysis.js";
import type {
  CorrelationLineage,
  GenerationComplete,
  NodeDescriptor
} from "@nodetool-ai/protocol";

const EMPTY_ANALYSIS: NodeAnalysis = {
  invocationScope: [],
  inputs: new Map(),
  outputs: new Map()
};

/** Build a `NodeAnalysis` from an invocation scope and per-handle scopes. */
function analysis(
  invocationScope: string[],
  inputs: Record<string, { scope: string[]; repeatsPerKey?: boolean }> = {}
): NodeAnalysis {
  const map = new Map<string, InputAnalysis>();
  for (const [handle, spec] of Object.entries(inputs)) {
    map.set(handle, {
      scope: spec.scope,
      repeatsPerKey: spec.repeatsPerKey ?? false,
      isMultiEdge: false,
      possibleChildRoots: new Set<string>()
    });
  }
  return { invocationScope, inputs: map, outputs: new Map() };
}

function makeNode(overrides: Partial<NodeDescriptor> = {}): NodeDescriptor {
  return { id: "n1", type: "test.Node", ...overrides };
}

interface Sent {
  nodeId: string;
  outputs: Record<string, unknown>;
  hints: OutputRoutingHints | undefined;
}

interface Harness {
  actor: NodeActor;
  sent: Sent[];
  messages: unknown[];
  eos: Array<[string, string]>;
}

function createActor(
  node: NodeDescriptor,
  inbox: NodeInbox,
  executor: NodeExecutor,
  opts: Partial<ConstructorParameters<typeof NodeActor>[0]> = {}
): Harness {
  const sent: Sent[] = [];
  const messages: unknown[] = [];
  const eos: Array<[string, string]> = [];
  const actor = new NodeActor({
    node,
    inbox,
    executor,
    correlation: EMPTY_ANALYSIS,
    sendOutputs: async (nodeId, outputs, hints) => {
      sent.push({ nodeId, outputs, hints });
    },
    emitMessage: (msg) => messages.push(msg),
    signalSlotEos: (nodeId, slot) => eos.push([nodeId, slot]),
    ...opts
  });
  return { actor, sent, messages, eos };
}

function generationCompletes(messages: unknown[]): GenerationComplete[] {
  return messages.filter(
    (m) => (m as { type?: string }).type === "generation_complete"
  ) as GenerationComplete[];
}

/** A streaming-input executor that consumes `handle` then runs `body`. */
function streamThen(
  handle: string,
  body: (outputs: NodeOutputs, envelopes: MessageEnvelope[]) => Promise<void>
): NodeExecutor {
  return {
    async process() {
      return {};
    },
    async run(inputs: NodeInputs, outputs: NodeOutputs) {
      const envelopes: MessageEnvelope[] = [];
      for await (const env of inputs.streamWithEnvelope(handle)) {
        envelopes.push(env);
      }
      await body(outputs, envelopes);
    }
  };
}

/** Feed one envelope with `lineage` on `handle`, then close the handle. */
async function feedOne(
  inbox: NodeInbox,
  handle: string,
  value: unknown,
  lineage: CorrelationLineage
): Promise<void> {
  inbox.addUpstream(handle, 1);
  await inbox.put(handle, value, { correlation_lineage: lineage });
  inbox.markSourceDone(handle);
}

// ---------------------------------------------------------------------------
// generation_complete: the scalar `properties` filter
// ---------------------------------------------------------------------------

describe("generation_complete properties — scalar filter", () => {
  it("carries only string/number/boolean inputs, dropping nested values and internals", async () => {
    // Arrange: a source node whose resolved inputs mix scalars, nested
    // values and a reserved `_`-prefixed internal.
    const node = makeNode({
      properties: {
        prompt: "a red fox",
        seed: 7,
        hires: true,
        ref: { uri: "asset://x" },
        tags: ["a", "b"],
        missing: null,
        absent: undefined,
        _internal: 5
      }
    });
    const { actor, messages } = createActor(node, new NodeInbox(), {
      async process() {
        return { image: "bytes" };
      }
    });

    // Act
    await actor.run();

    // Assert: exactly the three scalars ride along.
    const gen = generationCompletes(messages);
    expect(gen).toHaveLength(1);
    expect(gen[0].properties).toEqual({
      prompt: "a red fox",
      seed: 7,
      hires: true
    });
  });

  it("reports null (not an empty object) when no input is scalar", async () => {
    // Arrange
    const node = makeNode({
      properties: { ref: { uri: "asset://x" }, tags: [1, 2], missing: null }
    });
    const { actor, messages } = createActor(node, new NodeInbox(), {
      async process() {
        return { image: "bytes" };
      }
    });

    // Act
    await actor.run();

    // Assert
    expect(generationCompletes(messages)[0].properties).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Streaming-input NodeOutputs callbacks
// ---------------------------------------------------------------------------

describe("streaming-input emit — routing hints", () => {
  it("attaches no per-slot lineage when the slot declares no output_correlation", async () => {
    // Arrange
    const node = makeNode({ is_streaming_input: true });
    const inbox = new NodeInbox();
    const { actor, sent } = createActor(
      node,
      inbox,
      streamThen("items", async (outputs) => {
        await outputs.emit("out", "v");
      })
    );
    await feedOne(inbox, "items", "in", { r1: { index: 2 } });

    // Act
    await actor.run();

    // Assert: the invocation lineage is inherited, nothing is overridden.
    expect(sent).toHaveLength(1);
    expect(sent[0].hints?.invocationLineage).toEqual({ r1: { index: 2 } });
    expect(sent[0].hints?.perSlotLineage).toBeUndefined();
  });

  it("uses a caller-supplied lineage verbatim and inherits no invocation lineage", async () => {
    // Arrange: an iteration slot, so minting would fire if the caller's
    // lineage did not take precedence.
    const node = makeNode({
      is_streaming_input: true,
      output_correlation: {
        item: { kind: "iteration", source: "items", group: "g" }
      }
    });
    const inbox = new NodeInbox();
    const { actor, sent } = createActor(
      node,
      inbox,
      streamThen("items", async (outputs) => {
        await outputs.emit("item", "a", { lineage: { own: { index: 7 } } });
      })
    );
    await feedOne(inbox, "items", "in", { r1: { index: 2 } });

    // Act
    await actor.run();

    // Assert: the caller owns the lineage shape — nothing minted, nothing
    // inherited.
    expect(sent).toHaveLength(1);
    expect(sent[0].hints?.perSlotLineage).toEqual({
      item: { own: { index: 7 } }
    });
    expect(sent[0].hints?.invocationLineage).toBeUndefined();
  });

  it("mints an ascending iteration token per emit, keeping the inherited parent roots", async () => {
    // Arrange
    const node = makeNode({
      is_streaming_input: true,
      output_correlation: {
        item: { kind: "iteration", source: "items", group: "g" }
      }
    });
    const inbox = new NodeInbox();
    const { actor, sent } = createActor(
      node,
      inbox,
      streamThen("items", async (outputs) => {
        await outputs.emit("item", "a");
        await outputs.emit("item", "b");
      })
    );
    await feedOne(inbox, "items", "in", { r1: { index: 2 } });

    // Act
    await actor.run();

    // Assert: each emit is its own logical item under the same parent.
    expect(sent.map((s) => s.hints?.perSlotLineage?.item)).toEqual([
      { r1: { index: 2 }, "n1:g": { index: 0 } },
      { r1: { index: 2 }, "n1:g": { index: 1 } }
    ]);
  });

  it("drops the innermost root for an aggregate(innermost) output", async () => {
    // Arrange: `out` aggregates `items`, whose static scope ends with r1.
    const node = makeNode({
      is_streaming_input: true,
      output_correlation: {
        out: { kind: "aggregate", source: "items", collapse: "innermost" }
      }
    });
    const inbox = new NodeInbox();
    const { actor, sent } = createActor(
      node,
      inbox,
      streamThen("items", async (outputs) => {
        await outputs.emit("out", ["a"]);
      }),
      { correlation: analysis(["r1"], { items: { scope: ["r1"] } }) }
    );
    await feedOne(inbox, "items", "in", { r1: { index: 2 } });

    // Act
    await actor.run();

    // Assert: the emission sits at the parent scope.
    expect(sent[0].hints?.invocationLineage).toEqual({ r1: { index: 2 } });
    expect(sent[0].hints?.perSlotLineage?.out).toEqual({});
  });

  it("keeps the full lineage for an aggregate output that does not collapse", async () => {
    // Arrange: same wiring, but no `collapse: "innermost"`.
    const node = makeNode({
      is_streaming_input: true,
      output_correlation: { out: { kind: "aggregate", source: "items" } }
    });
    const inbox = new NodeInbox();
    const { actor, sent } = createActor(
      node,
      inbox,
      streamThen("items", async (outputs) => {
        await outputs.emit("out", ["a"]);
      }),
      { correlation: analysis(["r1"], { items: { scope: ["r1"] } }) }
    );
    await feedOne(inbox, "items", "in", { r1: { index: 2 } });

    // Act
    await actor.run();

    // Assert: no collapse, so no per-slot override.
    expect(sent[0].hints?.invocationLineage).toEqual({ r1: { index: 2 } });
    expect(sent[0].hints?.perSlotLineage).toBeUndefined();
  });

  it("emits without collapsing when no correlation analysis is available", async () => {
    // Arrange: an aggregate(innermost) output on an unanalyzed node.
    const node = makeNode({
      is_streaming_input: true,
      output_correlation: {
        out: { kind: "aggregate", source: "items", collapse: "innermost" }
      }
    });
    const inbox = new NodeInbox();
    const { actor, sent } = createActor(
      node,
      inbox,
      streamThen("items", async (outputs) => {
        await outputs.emit("out", ["a"]);
      }),
      { correlation: undefined }
    );
    await feedOne(inbox, "items", "in", { r1: { index: 2 } });

    // Act
    const result = await actor.run();

    // Assert: the emission still goes out, uncollapsed.
    expect(result.error).toBeUndefined();
    expect(sent[0].outputs).toEqual({ out: ["a"] });
    expect(sent[0].hints?.perSlotLineage).toBeUndefined();
  });

  it("emits without collapsing when the aggregate source handle is not connected", async () => {
    // Arrange: `source` names a handle absent from the analysis.
    const node = makeNode({
      is_streaming_input: true,
      output_correlation: {
        out: { kind: "aggregate", source: "unconnected", collapse: "innermost" }
      }
    });
    const inbox = new NodeInbox();
    const { actor, sent } = createActor(
      node,
      inbox,
      streamThen("items", async (outputs) => {
        await outputs.emit("out", ["a"]);
      }),
      { correlation: analysis(["r1"], { items: { scope: ["r1"] } }) }
    );
    await feedOne(inbox, "items", "in", { r1: { index: 2 } });

    // Act
    const result = await actor.run();

    // Assert
    expect(result.error).toBeUndefined();
    expect(sent[0].hints?.perSlotLineage).toBeUndefined();
  });

  it("emits without collapsing when the aggregate source sits at the root scope", async () => {
    // Arrange: nothing to collapse — the source handle has an empty scope.
    const node = makeNode({
      is_streaming_input: true,
      output_correlation: {
        out: { kind: "aggregate", source: "items", collapse: "innermost" }
      }
    });
    const inbox = new NodeInbox();
    const { actor, sent } = createActor(
      node,
      inbox,
      streamThen("items", async (outputs) => {
        await outputs.emit("out", ["a"]);
      }),
      { correlation: analysis([], { items: { scope: [] } }) }
    );
    await feedOne(inbox, "items", "in", { r1: { index: 2 } });

    // Act
    await actor.run();

    // Assert
    expect(sent[0].hints?.perSlotLineage).toBeUndefined();
  });
});

describe("streaming-input outputs.complete / drop / emitGroup", () => {
  it("signals early EOS for the named slot, defaulting an empty name to 'output'", async () => {
    // Arrange
    const node = makeNode({ is_streaming_input: true });
    const inbox = new NodeInbox();
    const { actor, eos } = createActor(node, inbox, {
      async process() {
        return {};
      },
      async run(_inputs: NodeInputs, outputs: NodeOutputs) {
        outputs.complete("");
        outputs.complete("images");
      }
    });

    // Act
    await actor.run();

    // Assert
    expect(eos).toEqual([
      ["n1", "output"],
      ["n1", "images"]
    ]);
  });

  it("tolerates outputs.complete() when the runner wired no EOS callback", async () => {
    // Arrange: no `signalSlotEos` (e.g. a standalone actor fixture).
    const node = makeNode({ is_streaming_input: true });
    const inbox = new NodeInbox();
    const { actor, sent } = createActor(
      node,
      inbox,
      {
        async process() {
          return {};
        },
        async run(_inputs: NodeInputs, outputs: NodeOutputs) {
          outputs.complete("out");
          await outputs.emit("out", 1);
        }
      },
      { signalSlotEos: undefined }
    );

    // Act
    const result = await actor.run();

    // Assert
    expect(result.error).toBeUndefined();
    expect(sent[0].outputs).toEqual({ out: 1 });
  });

  it("routes outputs.drop() as a lineage_done for that slot at the envelope's lineage", async () => {
    // Arrange
    const node = makeNode({ is_streaming_input: true });
    const inbox = new NodeInbox();
    const { actor, sent } = createActor(
      node,
      inbox,
      streamThen("items", async (outputs, envelopes) => {
        await outputs.drop("out", envelopes[0]);
      })
    );
    await feedOne(inbox, "items", "in", { r1: { index: 4 } });

    // Act
    await actor.run();

    // Assert: the slot must be present in the routed frame so the runner
    // knows which edges to signal.
    expect(sent).toHaveLength(1);
    expect("out" in sent[0].outputs).toBe(true);
    expect(sent[0].hints?.lineageDoneSlots).toEqual(new Set(["out"]));
    expect(sent[0].hints?.perSlotLineage?.out).toEqual({ r1: { index: 4 } });
  });

  it("emitGroup shares one minted token across sibling slots and honours an explicit lineage", async () => {
    // Arrange: `left`/`right` are one iteration group; `meta` is undeclared.
    const node = makeNode({
      is_streaming_input: true,
      output_correlation: {
        left: { kind: "iteration", source: "items", group: "pair" },
        right: { kind: "iteration", source: "items", group: "pair" }
      }
    });
    const inbox = new NodeInbox();
    const { actor, sent } = createActor(
      node,
      inbox,
      streamThen("items", async (outputs) => {
        await outputs.emitGroup(
          { left: 1, right: 2, meta: "m" },
          { lineage: { r0: { index: 7 } } }
        );
      })
    );
    // A different ambient lineage, to prove the explicit one wins.
    await feedOne(inbox, "items", "in", { r1: { index: 9 } });

    // Act
    await actor.run();

    // Assert
    expect(sent).toHaveLength(1);
    expect(sent[0].outputs).toEqual({ left: 1, right: 2, meta: "m" });
    expect(sent[0].hints?.invocationLineage).toEqual({ r0: { index: 7 } });
    const perSlot = sent[0].hints?.perSlotLineage;
    expect(perSlot?.meta).toEqual({ r0: { index: 7 } });
    expect(perSlot?.left).toEqual({
      r0: { index: 7 },
      "n1:pair": { index: 0 }
    });
    expect(perSlot?.right).toEqual(perSlot?.left);
  });
});

// ---------------------------------------------------------------------------
// Correlated scheduler — the final "no max-scope inputs" fire-once block
// ---------------------------------------------------------------------------

describe("correlated scheduler — fire-once with no max-scope inputs", () => {
  it("fires once with the sticky value of a strict-prefix handle", async () => {
    // Arrange: `cfg` sits one root above the invocation scope, so it is a
    // strict-prefix sticky input and the node has no max-scope input at all.
    const node = makeNode();
    const inbox = new NodeInbox();
    const calls: Array<Record<string, unknown>> = [];
    const { actor } = createActor(
      node,
      inbox,
      {
        async process(inputs) {
          calls.push(inputs);
          return {};
        }
      },
      { correlation: analysis(["r1", "r2"], { cfg: { scope: ["r1"] } }) }
    );
    await feedOne(inbox, "cfg", "hello", { r1: { index: 0 } });

    // Act
    await actor.run();

    // Assert
    expect(calls).toEqual([{ cfg: "hello" }]);
  });

  it("aggregates a prefix list input across every parent key into one array", async () => {
    // Arrange: a multi-edge list handle at prefix scope receives values under
    // two different parent keys.
    const node = makeNode();
    const inbox = new NodeInbox();
    const calls: Array<Record<string, unknown>> = [];
    const { actor } = createActor(
      node,
      inbox,
      {
        async process(inputs) {
          calls.push(inputs);
          return {};
        }
      },
      {
        correlation: analysis(["r1", "r2"], { items: { scope: ["r1"] } }),
        listInputHandles: new Set(["items"])
      }
    );
    inbox.addUpstream("items", 1);
    await inbox.put("items", "a", { correlation_lineage: { r1: { index: 0 } } });
    await inbox.put("items", "b", { correlation_lineage: { r1: { index: 1 } } });
    inbox.markSourceDone("items");

    // Act
    await actor.run();

    // Assert
    expect(calls).toEqual([{ items: ["a", "b"] }]);
  });

  it("aggregates every envelope of an empty-scope list input", async () => {
    // Arrange
    const node = makeNode();
    const inbox = new NodeInbox();
    const calls: Array<Record<string, unknown>> = [];
    const { actor } = createActor(
      node,
      inbox,
      {
        async process(inputs) {
          calls.push(inputs);
          return {};
        }
      },
      { correlation: analysis([]), listInputHandles: new Set(["items"]) }
    );
    inbox.addUpstream("items", 1);
    await inbox.put("items", "a");
    await inbox.put("items", "b");
    inbox.markSourceDone("items");

    // Act
    await actor.run();

    // Assert
    expect(calls).toEqual([{ items: ["a", "b"] }]);
  });

  it("does not fire when its only wired input closes without ever emitting", async () => {
    // Arrange: the upstream closes without emitting — the untaken side of an
    // `If`, or a filter that matched nothing.
    const node = makeNode({ properties: { items: "declared-default" } });
    const inbox = new NodeInbox();
    const calls: Array<Record<string, unknown>> = [];
    const { actor } = createActor(
      node,
      inbox,
      {
        async process(inputs) {
          calls.push(inputs);
          return {};
        }
      },
      { correlation: analysis([]), listInputHandles: new Set(["items"]) }
    );
    inbox.addUpstream("items", 1);
    inbox.markSourceDone("items");

    // Act
    await actor.run();

    // Assert: a node wired to data it never received is on an untaken branch.
    // Firing it on its declared default would run the branch nobody took.
    expect(calls).toEqual([]);
  });

  it("still fires with the declared default for a handle that stays empty when another delivered", async () => {
    // Arrange: `a` delivers, `items` closes empty. The node ran, so the empty
    // handle falls back to its declared default rather than skipping the node.
    const node = makeNode({ properties: { items: "declared-default" } });
    const inbox = new NodeInbox();
    const calls: Array<Record<string, unknown>> = [];
    const { actor } = createActor(
      node,
      inbox,
      {
        async process(inputs) {
          calls.push(inputs);
          return {};
        }
      },
      { correlation: analysis([]), listInputHandles: new Set(["items"]) }
    );
    inbox.addUpstream("items", 1);
    inbox.addUpstream("a", 1);
    await inbox.put("a", "value");
    inbox.markSourceDone("items");
    inbox.markSourceDone("a");

    // Act
    await actor.run();

    // Assert: fires once, with the default for `items` (not an empty array).
    expect(calls).toEqual([{ a: "value", items: "declared-default" }]);
  });
});

// ---------------------------------------------------------------------------
// Iteration-token bookkeeping
// ---------------------------------------------------------------------------

describe("iteration tokens", () => {
  it("gives sibling slots of one group the same token in a single process() result", async () => {
    // Arrange
    const node = makeNode({
      output_correlation: {
        left: { kind: "iteration", source: "a", group: "pair" },
        right: { kind: "iteration", source: "a", group: "pair" }
      }
    });
    const { actor, sent } = createActor(node, new NodeInbox(), {
      async process() {
        return { left: 1, right: 2 };
      }
    });

    // Act
    await actor.run();

    // Assert: one logical item, not two.
    const perSlot = sent[0].hints?.perSlotLineage;
    expect(perSlot?.left).toEqual({ "n1:pair": { index: 0 } });
    expect(perSlot?.right).toEqual({ "n1:pair": { index: 0 } });
  });

  it("overwrites a genProcess-supplied `index` with the actor-minted token and matches the routed lineage", async () => {
    // Arrange: the node yields its own (stale) index alongside a sibling
    // value slot and an undeclared passthrough slot.
    const node = makeNode({
      is_streaming_output: true,
      output_correlation: {
        index: { kind: "iteration", source: "a", group: "g" },
        value: { kind: "iteration", source: "a", group: "g" }
      }
    });
    const { actor, sent } = createActor(node, new NodeInbox(), {
      async process() {
        return {};
      },
      async *genProcess() {
        yield { index: 99, value: "x", extra: "e" };
      }
    });

    // Act
    const result = await actor.run();

    // Assert: the emitted index, the collected result and the lineage token
    // all agree on the actor-minted 0.
    expect(result.error).toBeUndefined();
    expect(sent).toHaveLength(1);
    expect(sent[0].outputs).toEqual({ index: 0, value: "x", extra: "e" });
    expect(result.outputs).toEqual({ index: 0, value: "x", extra: "e" });
    const perSlot = sent[0].hints?.perSlotLineage;
    expect(perSlot?.index).toEqual({ "n1:g": { index: 0 } });
    expect(perSlot?.value).toEqual({ "n1:g": { index: 0 } });
  });

  it("restarts iteration token numbering for each parent key", async () => {
    // Arrange: one max-scope input delivers two envelopes with distinct
    // parent keys; each invocation mints its own group token.
    const node = makeNode({
      is_streaming_output: true,
      output_correlation: {
        item: { kind: "iteration", source: "src", group: "g" }
      }
    });
    const inbox = new NodeInbox();
    const { actor, sent } = createActor(
      node,
      inbox,
      {
        async process() {
          return {};
        },
        async *genProcess(inputs) {
          yield { item: inputs.src };
        }
      },
      { correlation: analysis(["r1"], { src: { scope: ["r1"] } }) }
    );
    inbox.addUpstream("src", 1);
    await inbox.put("src", "a", { correlation_lineage: { r1: { index: 0 } } });
    await inbox.put("src", "b", { correlation_lineage: { r1: { index: 1 } } });
    inbox.markSourceDone("src");

    // Act
    await actor.run();

    // Assert: both parent keys start at 0 — counters are per (root, parent).
    expect(sent).toHaveLength(2);
    expect(sent.map((s) => s.hints?.perSlotLineage?.item)).toEqual([
      { r1: { index: 0 }, "n1:g": { index: 0 } },
      { r1: { index: 1 }, "n1:g": { index: 0 } }
    ]);
  });
});

// ---------------------------------------------------------------------------
// genProcess frame filtering and execution-mode selection
// ---------------------------------------------------------------------------

describe("genProcess frames", () => {
  it("routes nothing for a yield whose values are all null or undefined", async () => {
    // Arrange
    const node = makeNode({ is_streaming_output: true });
    const { actor, sent } = createActor(node, new NodeInbox(), {
      async process() {
        return {};
      },
      async *genProcess() {
        yield { a: null, b: undefined };
        yield { a: 1 };
      }
    });

    // Act
    await actor.run();

    // Assert
    expect(sent).toHaveLength(1);
    expect(sent[0].outputs).toEqual({ a: 1 });
  });

  it("falls back to process() when a node declares is_streaming_output but has no genProcess", async () => {
    // Arrange
    const node = makeNode({ is_streaming_output: true });
    const { actor, sent } = createActor(node, new NodeInbox(), {
      async process() {
        return { out: "buffered" };
      }
    });

    // Act
    const result = await actor.run();

    // Assert
    expect(result.error).toBeUndefined();
    expect(sent.map((s) => s.outputs)).toEqual([{ out: "buffered" }]);
  });
});

// ---------------------------------------------------------------------------
// _executeWithInputs: property merge and control context
// ---------------------------------------------------------------------------

describe("resolved inputs", () => {
  it("lets dynamic_properties override declared properties", async () => {
    // Arrange
    const node = makeNode({
      properties: { a: 1, b: 2 },
      dynamic_properties: { b: 3, c: 4 }
    });
    const calls: Array<Record<string, unknown>> = [];
    const { actor } = createActor(node, new NodeInbox(), {
      async process(inputs) {
        calls.push(inputs);
        return {};
      }
    });

    // Act
    await actor.run();

    // Assert
    expect(calls).toEqual([{ a: 1, b: 3, c: 4 }]);
  });

  it("injects the control context as _control_context alongside the merged inputs", async () => {
    // Arrange
    const node = makeNode({ properties: { a: 1 } });
    const calls: Array<Record<string, unknown>> = [];
    const { actor } = createActor(
      node,
      new NodeInbox(),
      {
        async process(inputs) {
          calls.push(inputs);
          return {};
        }
      },
      { controlContext: { node_id: "ctrl" } }
    );

    // Act
    await actor.run();

    // Assert
    expect(calls).toEqual([{ a: 1, _control_context: { node_id: "ctrl" } }]);
  });
});

// ---------------------------------------------------------------------------
// Controlled mode: caching data inputs that arrive while waiting
// ---------------------------------------------------------------------------

describe("controlled mode — waiting for data inputs", () => {
  it("keeps every data handle that arrives during the wait, not just the last one", async () => {
    // Arrange: neither handle is buffered when the actor starts, so both are
    // collected by the wait loop before the first control event runs.
    const node = makeNode({ is_controlled: true });
    const inbox = new NodeInbox();
    inbox.addUpstream("__control__", 1);
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 1);
    const calls: Array<Record<string, unknown>> = [];
    const { actor } = createActor(node, inbox, {
      async process(inputs) {
        calls.push(inputs);
        return {};
      }
    });

    // Act
    const running = actor.run();
    await inbox.put("a", "A");
    await inbox.put("b", "B");
    await inbox.put("__control__", {
      event_type: "run" as const,
      properties: {}
    });
    inbox.markSourceDone("a");
    inbox.markSourceDone("b");
    inbox.markSourceDone("__control__");
    await running;

    // Assert
    expect(calls).toEqual([{ a: "A", b: "B" }]);
  });
});
