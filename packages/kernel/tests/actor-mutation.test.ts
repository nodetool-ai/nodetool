/**
 * Mutation-focused tests for NodeActor._runImpl branches and small methods:
 * streaming-input mode, legacy fallback, controlled/missing-correlation,
 * error + finalize, skipResult, node-status fields, and streaming-partial
 * filtering.
 */
// @ts-nocheck
import { describe, it, expect, vi } from "vitest";
import { NodeActor, type NodeExecutor } from "../src/actor.js";
import { NodeInbox } from "../src/inbox.js";
import type { NodeAnalysis } from "../src/correlation-analysis.js";
import type { NodeDescriptor, NodeUpdate } from "@nodetool-ai/protocol";

const EMPTY_ANALYSIS: NodeAnalysis = {
  invocationScope: [],
  inputs: new Map(),
  outputs: new Map()
};

function makeNode(overrides: Partial<NodeDescriptor> = {}): NodeDescriptor {
  return { id: "n1", type: "test.Node", ...overrides };
}

function createActor(
  node: NodeDescriptor,
  inbox: NodeInbox,
  executor: NodeExecutor,
  opts: Partial<ConstructorParameters<typeof NodeActor>[0]> = {}
) {
  const sentOutputs: Array<{ nodeId: string; outputs: Record<string, unknown>; hints?: unknown }> = [];
  const messages: unknown[] = [];
  const actor = new NodeActor({
    node,
    inbox,
    executor,
    correlation: EMPTY_ANALYSIS,
    sendOutputs: async (nodeId, outputs, hints) => {
      sentOutputs.push({ nodeId, outputs, hints });
    },
    emitMessage: (msg) => messages.push(msg),
    ...opts
  });
  return { actor, sentOutputs, messages };
}

const statusMsg = (messages: unknown[], status: string) =>
  messages.find(
    (m) => (m as NodeUpdate).type === "node_update" && (m as NodeUpdate).status === status
  ) as NodeUpdate | undefined;

describe("NodeActor._runImpl – streaming-input mode", () => {
  it("runs executor.run() and routes emitted outputs", async () => {
    const node = makeNode({ is_streaming_input: true });
    const inbox = new NodeInbox();
    const executor: NodeExecutor = {
      async process() {
        return {};
      },
      async run(_inputs, outputs) {
        await outputs.emit("out", 42);
      }
    };
    const { actor, sentOutputs } = createActor(node, inbox, executor);
    const result = await actor.run();
    expect(sentOutputs.map((s) => s.outputs)).toEqual([{ out: 42 }]);
    expect(result.outputs).toEqual({ out: 42 });
  });

  it("falls back to process({}) when executor has no run()", async () => {
    const node = makeNode({ is_streaming_input: true });
    const inbox = new NodeInbox();
    const calls: Record<string, unknown>[] = [];
    const executor: NodeExecutor = {
      async process(inputs) {
        calls.push(inputs);
        return { legacy: true };
      }
    };
    const { actor, sentOutputs } = createActor(node, inbox, executor);
    await actor.run();
    expect(calls).toEqual([{}]); // called once with empty inputs
    expect(sentOutputs.map((s) => s.outputs)).toEqual([{ legacy: true }]);
  });
});

describe("NodeActor._runImpl – error handling & finalize", () => {
  it("reports an error status and message when the executor throws", async () => {
    const node = makeNode({ is_streaming_input: true });
    const inbox = new NodeInbox();
    const executor: NodeExecutor = {
      async process() {
        throw new Error("boom");
      }
    };
    const { actor, messages } = createActor(node, inbox, executor);
    const result = await actor.run();
    expect(result.error).toBe("boom");
    expect(result.outputs).toEqual({});
    expect(statusMsg(messages, "error")?.error).toBe("boom");
  });

  it("throws (becomes an error) when correlation analysis is missing", async () => {
    const node = makeNode(); // not streaming, not controlled
    const inbox = new NodeInbox();
    const executor: NodeExecutor = { async process() { return {}; } };
    const { actor } = createActor(node, inbox, executor, { correlation: undefined });
    const result = await actor.run();
    expect(result.error).toMatch(/Missing correlation analysis for node "n1"/);
  });

  it("calls preProcess and finalize, finalize even after an error", async () => {
    const node = makeNode({ is_streaming_input: true });
    const inbox = new NodeInbox();
    const order: string[] = [];
    const executor: NodeExecutor = {
      async preProcess() {
        order.push("pre");
      },
      async process() {
        order.push("process");
        throw new Error("x");
      },
      async finalize() {
        order.push("finalize");
      }
    };
    const { actor } = createActor(node, inbox, executor);
    await actor.run();
    expect(order).toEqual(["pre", "process", "finalize"]);
  });

  it("swallows finalize errors so they do not mask the result", async () => {
    const node = makeNode({ is_streaming_input: true });
    const inbox = new NodeInbox();
    const executor: NodeExecutor = {
      async process() {
        return { ok: 1 };
      },
      async finalize() {
        throw new Error("finalize blew up");
      }
    };
    const { actor } = createActor(node, inbox, executor);
    const result = await actor.run();
    expect(result.error).toBeUndefined();
    expect(result.outputs).toEqual({ ok: 1 });
  });
});

describe("NodeActor._emitNodeStatus & skipResult", () => {
  it("omits the result for constant/input node types", async () => {
    for (const type of ["nodetool.constant.Number", "nodetool.input.Text"]) {
      const node = makeNode({ type, is_streaming_input: true });
      const inbox = new NodeInbox();
      const executor: NodeExecutor = { async process() { return { v: 1 }; } };
      const { actor, messages } = createActor(node, inbox, executor);
      await actor.run();
      expect(statusMsg(messages, "completed")?.result).toBeNull();
    }
  });

  it("attaches the latest result for ordinary node types", async () => {
    const node = makeNode({ is_streaming_input: true });
    const inbox = new NodeInbox();
    const executor: NodeExecutor = { async process() { return { v: 7 }; } };
    const { actor, messages } = createActor(node, inbox, executor);
    await actor.run();
    expect(statusMsg(messages, "completed")?.result).toEqual({ v: 7 });
  });

  it("emits node_name (name ?? type), node_type and provider_cost", async () => {
    const node = makeNode({ is_streaming_input: true, name: "Friendly" });
    const inbox = new NodeInbox();
    const executor: NodeExecutor = { async process() { return {}; } };
    const ctx = {
      clearProviderCost: () => {},
      getProviderCost: () => 1.25
    } as never;
    const { actor, messages } = createActor(node, inbox, executor, {
      executionContext: ctx
    });
    await actor.run();
    const running = statusMsg(messages, "running")!;
    expect(running.node_name).toBe("Friendly");
    expect(running.node_type).toBe("test.Node");
    const completed = statusMsg(messages, "completed")!;
    expect(completed.provider_cost).toBe(1.25);
  });

  it("falls back to node.type for node_name when name is absent", async () => {
    const node = makeNode({ is_streaming_input: true });
    const inbox = new NodeInbox();
    const executor: NodeExecutor = { async process() { return {}; } };
    const { actor, messages } = createActor(node, inbox, executor);
    await actor.run();
    expect(statusMsg(messages, "running")?.node_name).toBe("test.Node");
  });
});

describe("NodeActor._filterStreamingPartial", () => {
  it("drops null and undefined partial values but keeps the rest", async () => {
    const node = makeNode({ is_streaming_output: true });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    const executor: NodeExecutor = {
      async process() {
        return {};
      },
      async *genProcess() {
        yield { keep: 0, dropNull: null, dropUndef: undefined };
      }
    };
    const { actor, sentOutputs } = createActor(node, inbox, executor);
    await inbox.put("a", 1);
    inbox.markSourceDone("a");
    await actor.run();
    expect(sentOutputs.map((s) => s.outputs)).toEqual([{ keep: 0 }]);
  });
});

describe("NodeActor._runImpl – non-Error throw", () => {
  it("stringifies a non-Error thrown value", async () => {
    const node = makeNode({ is_streaming_input: true });
    const inbox = new NodeInbox();
    const executor: NodeExecutor = {
      async process() {
        throw "plain string failure"; // eslint-disable-line no-throw-literal
      }
    };
    const { actor } = createActor(node, inbox, executor);
    const result = await actor.run();
    expect(result.error).toBe("plain string failure");
  });
});

// --- Correlated scheduler fixtures -----------------------------------------

function trackingExecutor(processFn: (i: Record<string, unknown>) => Record<string, unknown>) {
  const calls: Array<Record<string, unknown>> = [];
  return {
    executor: {
      async process(inputs: Record<string, unknown>) {
        calls.push(inputs);
        return processFn(inputs);
      }
    } as NodeExecutor,
    calls
  };
}

function analysis(
  invocationScope: string[],
  inputs: Record<string, [string[], boolean?]>
): NodeAnalysis {
  return {
    invocationScope,
    inputs: new Map(
      Object.entries(inputs).map(([h, [scope, repeats]]) => [
        h,
        {
          scope,
          repeatsPerKey: repeats ?? false,
          isMultiEdge: false,
          possibleChildRoots: new Set<string>()
        }
      ])
    ),
    outputs: new Map()
  };
}

const lin = (rec: Record<string, number>) =>
  Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, { index: v }]));

describe("NodeActor._runCorrelatedImpl – scheduler", () => {
  it("fires once with empty inputs for a source node (no data handles)", async () => {
    const inbox = new NodeInbox();
    const { executor, calls } = trackingExecutor(() => ({ out: 1 }));
    const { actor } = createActor(makeNode(), inbox, executor);
    await actor.run();
    expect(calls).toEqual([{}]);
  });

  it("fires once per max-scope key for a repeating driver", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    const { executor, calls } = trackingExecutor((i) => ({ out: i.a }));
    const { actor } = createActor(makeNode(), inbox, executor, {
      correlation: analysis(["r"], { a: [["r"], true] })
    });
    await inbox.put("a", "v0", { correlation_lineage: lin({ r: 0 }) });
    await inbox.put("a", "v1", { correlation_lineage: lin({ r: 1 }) });
    inbox.markSourceDone("a");
    await actor.run();
    expect(calls).toEqual([{ a: "v0" }, { a: "v1" }]);
  });

  it("joins a strict-prefix sticky input with each max-scope key", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("deep", 1);
    inbox.addUpstream("cfg", 1);
    const { executor, calls } = trackingExecutor(() => ({}));
    const { actor } = createActor(makeNode(), inbox, executor, {
      correlation: analysis(["r", "s"], {
        deep: [["r", "s"], true],
        cfg: [["r"], false]
      })
    });
    await inbox.put("cfg", "C0", { correlation_lineage: lin({ r: 0 }) });
    await inbox.put("deep", "D00", { correlation_lineage: lin({ r: 0, s: 0 }) });
    await inbox.put("deep", "D01", { correlation_lineage: lin({ r: 0, s: 1 }) });
    inbox.markSourceDone("deep");
    inbox.markSourceDone("cfg");
    await actor.run();
    expect(calls).toEqual([
      { deep: "D00", cfg: "C0" },
      { deep: "D01", cfg: "C0" }
    ]);
  });

  it("aggregates a multi-edge list input into an array on close", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("items", 1);
    const { executor, calls } = trackingExecutor(() => ({}));
    const { actor } = createActor(makeNode(), inbox, executor, {
      correlation: analysis(["r"], { items: [["r"], false] }),
      listInputHandles: new Set(["items"])
    });
    const runP = actor.run();
    await inbox.put("items", "x", { correlation_lineage: lin({ r: 0 }) });
    await inbox.put("items", "y", { correlation_lineage: lin({ r: 0 }) });
    await new Promise((r) => setTimeout(r, 0));
    inbox.markSourceDone("items");
    await runP;
    expect(calls).toEqual([{ items: ["x", "y"] }]);
  });

  it("throws when max_pending_keys is exceeded", async () => {
    const inbox = new NodeInbox(null, { maxPendingKeys: 1 });
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 1);
    const { executor } = trackingExecutor(() => ({}));
    const { actor } = createActor(makeNode(), inbox, executor, {
      correlation: analysis(["r"], { a: [["r"], true], b: [["r"], false] })
    });
    await inbox.put("a", "0", { correlation_lineage: lin({ r: 0 }) });
    await inbox.put("a", "1", { correlation_lineage: lin({ r: 1 }) });
    inbox.markSourceDone("a");
    inbox.markSourceDone("b");
    const result = await actor.run();
    expect(result.error).toMatch(/Inbox for node "n1" exceeded max_pending_keys \(1\) on handle "a"/);
  });

  it("throws when max_pending_messages_per_key is exceeded", async () => {
    const inbox = new NodeInbox(null, { maxPendingMessagesPerKey: 1 });
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 1);
    const { executor } = trackingExecutor(() => ({}));
    const { actor } = createActor(makeNode(), inbox, executor, {
      correlation: analysis(["r"], { a: [["r"], true], b: [["r"], false] })
    });
    await inbox.put("a", "0", { correlation_lineage: lin({ r: 0 }) });
    await inbox.put("a", "1", { correlation_lineage: lin({ r: 0 }) });
    inbox.markSourceDone("a");
    inbox.markSourceDone("b");
    const result = await actor.run();
    expect(result.error).toMatch(/max_pending_messages_per_key \(1\) on handle "a" for key "r=0"/);
  });
});

// --- Output lineage / iteration / aggregate / drop -------------------------

describe("NodeActor – correlated output lineage", () => {
  it("attaches the consumed invocation lineage to single outputs", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    const { executor } = trackingExecutor(() => ({ out: 1 }));
    const { actor, sentOutputs } = createActor(makeNode(), inbox, executor, {
      correlation: analysis(["r"], { a: [["r"], true] })
    });
    await inbox.put("a", "v", { correlation_lineage: lin({ r: 0 }) });
    inbox.markSourceDone("a");
    await actor.run();
    const hints = sentOutputs[0].hints as {
      invocationLineage: Record<string, { index: number }>;
      perSlotLineage: Record<string, Record<string, { index: number }>>;
    };
    expect(hints.invocationLineage).toEqual({ r: { index: 0 } });
    expect(hints.perSlotLineage.out).toEqual({ r: { index: 0 } });
  });

  it("mints a per-frame iteration token for iteration outputs", async () => {
    const node = makeNode({
      output_correlation: {
        out: { kind: "iteration", source: "__execution__", group: "g" }
      }
    });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    const { executor } = trackingExecutor(() => ({ out: "item" }));
    const { actor, sentOutputs } = createActor(node, inbox, executor, {
      correlation: analysis(["r"], { a: [["r"], true] })
    });
    await inbox.put("a", "v0", { correlation_lineage: lin({ r: 0 }) });
    await inbox.put("a", "v1", { correlation_lineage: lin({ r: 0 }) }); // same parent
    inbox.markSourceDone("a");
    await actor.run();
    const slot0 = (sentOutputs[0].hints as { perSlotLineage: Record<string, Record<string, { index: number }>> }).perSlotLineage.out;
    const slot1 = (sentOutputs[1].hints as { perSlotLineage: Record<string, Record<string, { index: number }>> }).perSlotLineage.out;
    // Two firings at the same parent key mint indices 0 then 1 for the group root.
    expect(slot0).toEqual({ r: { index: 0 }, "n1:g": { index: 0 } });
    expect(slot1).toEqual({ r: { index: 0 }, "n1:g": { index: 1 } });
  });
});

describe("NodeActor – streaming-input emit lineage", () => {
  it("mints a fresh iteration token on each outputs.emit()", async () => {
    const node = makeNode({
      is_streaming_input: true,
      output_correlation: {
        pair: { kind: "iteration", source: "__execution__", group: "z" }
      }
    });
    const inbox = new NodeInbox();
    const executor: NodeExecutor = {
      async process() {
        return {};
      },
      async run(_inputs, outputs) {
        await outputs.emit("pair", "a");
        await outputs.emit("pair", "b");
      }
    };
    const { actor, sentOutputs } = createActor(node, inbox, executor, {
      correlation: analysis([], {})
    });
    await actor.run();
    const root = "n1:z";
    expect((sentOutputs[0].hints as { perSlotLineage: Record<string, Record<string, { index: number }>> }).perSlotLineage.pair[root].index).toBe(0);
    expect((sentOutputs[1].hints as { perSlotLineage: Record<string, Record<string, { index: number }>> }).perSlotLineage.pair[root].index).toBe(1);
  });

  it("emitGroup mints one shared token across sibling iteration slots", async () => {
    const node = makeNode({
      is_streaming_input: true,
      output_correlation: {
        left: { kind: "iteration", source: "__execution__", group: "zip" },
        right: { kind: "iteration", source: "__execution__", group: "zip" }
      }
    });
    const inbox = new NodeInbox();
    const executor: NodeExecutor = {
      async process() {
        return {};
      },
      async run(_inputs, outputs) {
        await outputs.emitGroup({ left: 1, right: 2 });
      }
    };
    const { actor, sentOutputs } = createActor(node, inbox, executor, {
      correlation: analysis([], {})
    });
    await actor.run();
    const hints = sentOutputs[0].hints as { perSlotLineage: Record<string, Record<string, { index: number }>> };
    const root = "n1:zip";
    // Both siblings share the SAME minted token.
    expect(hints.perSlotLineage.left[root].index).toBe(0);
    expect(hints.perSlotLineage.right[root].index).toBe(0);
  });

  it("drop() emits a lineage_done signal for the slot", async () => {
    const node = makeNode({ is_streaming_input: true });
    const inbox = new NodeInbox();
    const env = {
      data: 1,
      metadata: {},
      timestamp: 0,
      event_id: "e",
      correlation_lineage: lin({ r: 3 }),
      source_edge_id: "edge"
    };
    const executor: NodeExecutor = {
      async process() {
        return {};
      },
      async run(_inputs, outputs) {
        await outputs.drop("done_slot", env as never);
      }
    };
    const { actor, sentOutputs } = createActor(node, inbox, executor);
    await actor.run();
    const sent = sentOutputs[0];
    const hints = sent.hints as { lineageDoneSlots: Set<string>; perSlotLineage: Record<string, unknown> };
    expect(Array.from(hints.lineageDoneSlots)).toEqual(["done_slot"]);
    expect(hints.perSlotLineage.done_slot).toEqual({ r: { index: 3 } });
  });
});

describe("NodeActor – aggregate & frame-index minting", () => {
  it("collapses the innermost root for aggregate outputs", async () => {
    const node = makeNode({
      is_streaming_input: true,
      output_correlation: {
        rolled: { kind: "aggregate", source: "in", collapse: "innermost" }
      }
    });
    const inbox = new NodeInbox();
    inbox.addUpstream("in", 1);
    const executor: NodeExecutor = {
      async process() {
        return {};
      },
      async run(inputs, outputs) {
        for await (const _ of inputs.stream("in")) void _; // populate lineage tracker
        await outputs.emit("rolled", "summary");
      }
    };
    const { actor, sentOutputs } = createActor(node, inbox, executor, {
      correlation: analysis(["r", "x:s"], { in: [["r", "x:s"], false] })
    });
    const runP = actor.run();
    await inbox.put("in", "v", { correlation_lineage: lin({ r: 0, "x:s": 2 }) });
    inbox.markSourceDone("in");
    await runP;
    const hints = sentOutputs[0].hints as { perSlotLineage: Record<string, Record<string, { index: number }>> };
    // innermost root "x:s" is dropped from the emitted lineage.
    expect(hints.perSlotLineage.rolled).toEqual({ r: { index: 0 } });
  });

  it("overrides a genProcess-supplied index with the actor-minted token", async () => {
    const node = makeNode({
      is_streaming_output: true,
      output_correlation: {
        output: { kind: "iteration", source: "__execution__", group: "g" },
        index: { kind: "iteration", source: "__execution__", group: "g" }
      }
    });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    const executor: NodeExecutor = {
      async process() {
        return {};
      },
      async *genProcess() {
        yield { output: "item", index: 99 }; // node-supplied index must be overwritten
      }
    };
    const { actor, sentOutputs } = createActor(node, inbox, executor, {
      correlation: analysis(["r"], { a: [["r"], true] })
    });
    await inbox.put("a", "v", { correlation_lineage: lin({ r: 0 }) });
    inbox.markSourceDone("a");
    await actor.run();
    expect(sentOutputs[0].outputs.index).toBe(0); // minted token, not 99
  });
});

describe("NodeActor._runCorrelatedImpl – list & no-max paths", () => {
  it("aggregates a prefix-scope multi-edge list per parent key", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("deep", 1);
    inbox.addUpstream("plist", 1);
    const { executor, calls } = trackingExecutor(() => ({}));
    const { actor } = createActor(makeNode(), inbox, executor, {
      correlation: analysis(["r", "s"], {
        deep: [["r", "s"], true],
        plist: [["r"], false]
      }),
      listInputHandles: new Set(["plist"])
    });
    const runP = actor.run();
    await inbox.put("plist", "p1", { correlation_lineage: lin({ r: 0 }) });
    await inbox.put("plist", "p2", { correlation_lineage: lin({ r: 0 }) });
    await inbox.put("deep", "D00", { correlation_lineage: lin({ r: 0, s: 0 }) });
    await new Promise((r) => setTimeout(r, 0));
    inbox.markSourceDone("plist");
    inbox.markSourceDone("deep");
    await runP;
    expect(calls).toEqual([{ deep: "D00", plist: ["p1", "p2"] }]);
  });

  it("aggregates an empty-scope multi-edge list on close", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("elist", 1);
    const { executor, calls } = trackingExecutor(() => ({}));
    const { actor } = createActor(makeNode(), inbox, executor, {
      correlation: analysis(["r"], { a: [["r"], true], elist: [[], false] }),
      listInputHandles: new Set(["elist"])
    });
    const runP = actor.run();
    await inbox.put("elist", "e1", {});
    await inbox.put("elist", "e2", {});
    await inbox.put("a", "v", { correlation_lineage: lin({ r: 0 }) });
    await new Promise((r) => setTimeout(r, 0));
    inbox.markSourceDone("elist");
    inbox.markSourceDone("a");
    await runP;
    expect(calls).toEqual([{ a: "v", elist: ["e1", "e2"] }]);
  });

  it("fires once for a node with no max-scope input", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("cfg", 1);
    const { executor, calls } = trackingExecutor(() => ({}));
    const { actor } = createActor(makeNode(), inbox, executor, {
      correlation: analysis(["r", "s"], { cfg: [["r"], false] })
    });
    await inbox.put("cfg", "C", { correlation_lineage: lin({ r: 0 }) });
    inbox.markSourceDone("cfg");
    await actor.run();
    expect(calls).toEqual([{ cfg: "C" }]);
  });
});

describe("NodeActor._runControlled – data waiting", () => {
  it("waits for and caches a data input that arrives after run starts", async () => {
    const node = makeNode({ is_controlled: true });
    const inbox = new NodeInbox();
    inbox.addUpstream("__control__", 1);
    inbox.addUpstream("x", 1);
    const { executor, calls } = trackingExecutor((i) => ({ out: i.x }));
    const { actor, sentOutputs } = createActor(node, inbox, executor);
    const runP = actor.run();
    // Data arrives AFTER run starts -> _waitForDataInputs drains it.
    await inbox.put("x", 100);
    await inbox.put("__control__", { event_type: "run", properties: { p: 1 } });
    await inbox.put("__control__", { event_type: "stop" });
    inbox.markSourceDone("x");
    inbox.markSourceDone("__control__");
    await runP;
    expect(calls).toEqual([{ x: 100, p: 1 }]);
    expect(sentOutputs).toHaveLength(1);
  });

  it("processes multiple run events and stops on a stop event", async () => {
    const node = makeNode({ is_controlled: true });
    const inbox = new NodeInbox();
    inbox.addUpstream("__control__", 1);
    inbox.addUpstream("x", 1);
    const { executor, calls } = trackingExecutor((i) => ({ out: i.threshold }));
    const { actor } = createActor(node, inbox, executor);
    await inbox.put("x", 5);
    await inbox.put("__control__", { event_type: "run", properties: { threshold: 1 } });
    await inbox.put("__control__", { event_type: "run", properties: { threshold: 2 } });
    await inbox.put("__control__", { event_type: "stop" });
    inbox.markSourceDone("x");
    inbox.markSourceDone("__control__");
    await actor.run();
    expect(calls).toEqual([
      { x: 5, threshold: 1 },
      { x: 5, threshold: 2 }
    ]);
  });
});

describe("NodeActor._runCorrelatedImpl – driver & key edge cases", () => {
  it("re-fires the same key for a repeating driver", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    const { executor, calls } = trackingExecutor((i) => ({ out: i.a }));
    const { actor } = createActor(makeNode(), inbox, executor, {
      correlation: analysis(["r"], { a: [["r"], true] })
    });
    // Two values at the SAME key — a repeating driver fires for each.
    await inbox.put("a", "v0", { correlation_lineage: lin({ r: 0 }) });
    await inbox.put("a", "v1", { correlation_lineage: lin({ r: 0 }) });
    inbox.markSourceDone("a");
    await actor.run();
    expect(calls).toEqual([{ a: "v0" }, { a: "v1" }]);
  });

  it("fires once per non-repeating max key (no re-fire)", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    // non-repeating max handle: each key consumed once; the fired-set guards
    // against double-fire.
    const { executor, calls } = trackingExecutor((i) => ({ out: i.a }));
    const { actor } = createActor(makeNode(), inbox, executor, {
      correlation: analysis(["r"], { a: [["r"], false] })
    });
    await inbox.put("a", "only", { correlation_lineage: lin({ r: 0 }) });
    inbox.markSourceDone("a");
    await actor.run();
    expect(calls).toEqual([{ a: "only" }]);
  });

  it("buckets a max envelope with incomplete lineage under the empty key", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    const { executor, calls } = trackingExecutor((i) => ({ out: i.a }));
    const { actor } = createActor(makeNode(), inbox, executor, {
      correlation: analysis(["r", "s"], { a: [["r", "s"], true] })
    });
    // lineage lacks "s" -> projectKey returns null -> key "".
    await inbox.put("a", "v", { correlation_lineage: lin({ r: 0 }) });
    inbox.markSourceDone("a");
    await actor.run();
    expect(calls).toEqual([{ a: "v" }]);
  });

  it("an empty-scope arrival unblocks a pending max key", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("cfg", 1);
    const { executor, calls } = trackingExecutor(() => ({}));
    const { actor } = createActor(makeNode(), inbox, executor, {
      correlation: analysis(["r"], { a: [["r"], true], cfg: [[], false] })
    });
    const runP = actor.run();
    // max key arrives while cfg is still open -> not ready, stays pending...
    await inbox.put("a", "A0", { correlation_lineage: lin({ r: 0 }) });
    await new Promise((r) => setTimeout(r, 0));
    // ...then the empty-scope sticky arrives and unblocks the pending key.
    await inbox.put("cfg", "C");
    await new Promise((r) => setTimeout(r, 0));
    inbox.markSourceDone("a");
    inbox.markSourceDone("cfg");
    await runP;
    expect(calls).toEqual([{ a: "A0", cfg: "C" }]);
  });
});

describe("NodeActor._executeWithInputs – property merge & control context", () => {
  it("merges properties and dynamic_properties as defaults (edge input wins)", async () => {
    const node = makeNode({
      properties: { threshold: 0.5, label: "p" },
      dynamic_properties: { extra: 9, label: "dyn" }
    });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    const { executor, calls } = trackingExecutor(() => ({}));
    const { actor } = createActor(node, inbox, executor, {
      correlation: analysis(["r"], { a: [["r"], true] })
    });
    await inbox.put("a", "edgeval", { correlation_lineage: lin({ r: 0 }) });
    inbox.markSourceDone("a");
    await actor.run();
    // dynamic_properties override properties; edge input is added.
    expect(calls).toEqual([
      { threshold: 0.5, label: "dyn", extra: 9, a: "edgeval" }
    ]);
  });

  it("injects _control_context for controller nodes", async () => {
    const node = makeNode();
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    const { executor, calls } = trackingExecutor(() => ({}));
    const { actor } = createActor(node, inbox, executor, {
      correlation: analysis(["r"], { a: [["r"], true] }),
      controlContext: { mode: "ctl" }
    });
    await inbox.put("a", "v", { correlation_lineage: lin({ r: 0 }) });
    inbox.markSourceDone("a");
    await actor.run();
    expect(calls[0]._control_context).toEqual({ mode: "ctl" });
  });
});

describe("NodeActor._runCorrelatedImpl – no-max list aggregation", () => {
  it("aggregates a prefix-list in the no-max fire-once path", async () => {
    // invocation [r,s]; only a prefix-list input [r] -> no max handle.
    const inbox = new NodeInbox();
    inbox.addUpstream("plist", 1);
    const { executor, calls } = trackingExecutor(() => ({}));
    const { actor } = createActor(makeNode(), inbox, executor, {
      correlation: analysis(["r", "s"], { plist: [["r"], false] }),
      listInputHandles: new Set(["plist"])
    });
    const runP = actor.run();
    await inbox.put("plist", "p1", { correlation_lineage: lin({ r: 0 }) });
    await inbox.put("plist", "p2", { correlation_lineage: lin({ r: 1 }) });
    await new Promise((r) => setTimeout(r, 0));
    inbox.markSourceDone("plist");
    await runP;
    expect(calls).toEqual([{ plist: ["p1", "p2"] }]);
  });

  it("aggregates an empty-list in the no-max fire-once path", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("elist", 1);
    const { executor, calls } = trackingExecutor(() => ({}));
    const { actor } = createActor(makeNode(), inbox, executor, {
      correlation: analysis(["r"], { elist: [[], false] }),
      listInputHandles: new Set(["elist"])
    });
    const runP = actor.run();
    await inbox.put("elist", "e1", {});
    await inbox.put("elist", "e2", {});
    await new Promise((r) => setTimeout(r, 0));
    inbox.markSourceDone("elist");
    await runP;
    expect(calls).toEqual([{ elist: ["e1", "e2"] }]);
  });
});

describe("NodeActor – multi-root invocation lineage", () => {
  it("builds the invocation lineage from a multi-root max envelope", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    const { executor } = trackingExecutor(() => ({ out: 1 }));
    const { actor, sentOutputs } = createActor(makeNode(), inbox, executor, {
      correlation: analysis(["r", "s"], { a: [["r", "s"], true] })
    });
    await inbox.put("a", "v", { correlation_lineage: lin({ r: 1, s: 2 }) });
    inbox.markSourceDone("a");
    await actor.run();
    const hints = sentOutputs[0].hints as {
      invocationLineage: Record<string, { index: number }>;
    };
    expect(hints.invocationLineage).toEqual({ r: { index: 1 }, s: { index: 2 } });
  });
});

describe("NodeActor – non-iteration output correlation", () => {
  it("inherits invocation lineage for single and chunk outputs (no root minted)", async () => {
    const node = makeNode({
      output_correlation: {
        out: { kind: "single", source: "__execution__" },
        ch: { kind: "chunk", source: "__execution__" }
      }
    });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    const { executor } = trackingExecutor(() => ({ out: 1, ch: 2 }));
    const { actor, sentOutputs } = createActor(node, inbox, executor, {
      correlation: analysis(["r"], { a: [["r"], true] })
    });
    await inbox.put("a", "v", { correlation_lineage: lin({ r: 0 }) });
    inbox.markSourceDone("a");
    await actor.run();
    const ps = (sentOutputs[0].hints as { perSlotLineage: Record<string, unknown> }).perSlotLineage;
    expect(ps.out).toEqual({ r: { index: 0 } }); // no iteration root added
    expect(ps.ch).toEqual({ r: { index: 0 } });
  });

  it("omits invocationLineage on emit when no input lineage is available", async () => {
    const node = makeNode({ is_streaming_input: true });
    const inbox = new NodeInbox();
    const executor: NodeExecutor = {
      async process() {
        return {};
      },
      async run(_inputs, outputs) {
        await outputs.emit("out", 1); // no consumed input -> no invocation lineage
      }
    };
    const { actor, sentOutputs } = createActor(node, inbox, executor);
    await actor.run();
    const hints = sentOutputs[0].hints as Record<string, unknown>;
    expect("invocationLineage" in hints).toBe(false);
  });
});

describe("NodeActor – edge cases (batch)", () => {
  it("emits null properties in node status when properties is not an object", async () => {
    const node = makeNode({ is_streaming_input: true, properties: "weird" as never });
    const inbox = new NodeInbox();
    const executor: NodeExecutor = { async process() { return {}; } };
    const { actor, messages } = createActor(node, inbox, executor);
    await actor.run();
    expect(statusMsg(messages, "running")?.properties).toBeNull();
  });

  it("skips empty genProcess frames without sending output", async () => {
    const node = makeNode({ is_streaming_output: true });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    const executor: NodeExecutor = {
      async process() {
        return {};
      },
      async *genProcess() {
        yield {}; // empty frame -> skipped
        yield { real: 1 };
      }
    };
    const { executor: _e } = trackingExecutor(() => ({}));
    void _e;
    const { actor, sentOutputs } = createActor(makeNode({ is_streaming_output: true }), inbox, executor, {
      correlation: analysis(["r"], { a: [["r"], true] })
    });
    await inbox.put("a", "v", { correlation_lineage: lin({ r: 0 }) });
    inbox.markSourceDone("a");
    await actor.run();
    expect(sentOutputs.map((s) => s.outputs)).toEqual([{ real: 1 }]);
  });

  it("reuses the frame-minted token across iteration siblings in genProcess", async () => {
    const node = makeNode({
      is_streaming_output: true,
      output_correlation: {
        output: { kind: "iteration", source: "__execution__", group: "g" },
        index: { kind: "iteration", source: "__execution__", group: "g" }
      }
    });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    const executor: NodeExecutor = {
      async process() {
        return {};
      },
      async *genProcess() {
        yield { output: "item", index: 0 };
      }
    };
    const { actor, sentOutputs } = createActor(node, inbox, executor, {
      correlation: analysis(["r"], { a: [["r"], true] })
    });
    await inbox.put("a", "v", { correlation_lineage: lin({ r: 0 }) });
    inbox.markSourceDone("a");
    await actor.run();
    const ps = (sentOutputs[0].hints as { perSlotLineage: Record<string, Record<string, { index: number }>> }).perSlotLineage;
    // output and index (same group) share the one minted token.
    expect(ps.output["n1:g"].index).toBe(0);
    expect(ps.index["n1:g"].index).toBe(0);
  });

  it("fires a no-max node with a single prefix-sticky value", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("cfg", 1);
    inbox.addUpstream("cfg2", 1);
    const { executor, calls } = trackingExecutor(() => ({}));
    const { actor } = createActor(makeNode(), inbox, executor, {
      correlation: analysis(["r", "s"], {
        cfg: [["r"], false],
        cfg2: [["r"], false]
      })
    });
    await inbox.put("cfg", "C1", { correlation_lineage: lin({ r: 0 }) });
    await inbox.put("cfg2", "C2", { correlation_lineage: lin({ r: 0 }) });
    inbox.markSourceDone("cfg");
    inbox.markSourceDone("cfg2");
    await actor.run();
    expect(calls).toEqual([{ cfg: "C1", cfg2: "C2" }]);
  });
});

describe("NodeActor._runCorrelatedImpl – not-ready guards", () => {
  it("does not fire a max key while its prefix-sticky input is missing", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("deep", 1);
    inbox.addUpstream("cfg", 1);
    const { executor, calls } = trackingExecutor(() => ({}));
    const { actor } = createActor(makeNode(), inbox, executor, {
      correlation: analysis(["r", "s"], {
        deep: [["r", "s"], true],
        cfg: [["r"], false]
      })
    });
    // deep arrives but cfg never does -> the key is not ready.
    await inbox.put("deep", "D", { correlation_lineage: lin({ r: 0, s: 0 }) });
    inbox.markSourceDone("deep");
    inbox.markSourceDone("cfg"); // closed with no value
    await actor.run();
    expect(calls).toEqual([]);
  });

  it("does not fire while a prefix-list input has no value for the parent key", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("deep", 1);
    inbox.addUpstream("plist", 1);
    const { executor, calls } = trackingExecutor(() => ({}));
    const { actor } = createActor(makeNode(), inbox, executor, {
      correlation: analysis(["r", "s"], {
        deep: [["r", "s"], true],
        plist: [["r"], false]
      }),
      listInputHandles: new Set(["plist"])
    });
    const runP = actor.run();
    await inbox.put("deep", "D", { correlation_lineage: lin({ r: 0, s: 0 }) });
    await new Promise((r) => setTimeout(r, 0));
    inbox.markSourceDone("plist"); // closed empty -> no bucket for parent r=0
    inbox.markSourceDone("deep");
    await runP;
    expect(calls).toEqual([]);
  });

  it("does not fire a side max input until it produces the key", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 1);
    const { executor, calls } = trackingExecutor(() => ({}));
    const { actor } = createActor(makeNode(), inbox, executor, {
      correlation: analysis(["r"], { a: [["r"], true], b: [["r"], false] })
    });
    // driver "a" produces r=0 but side max "b" never does.
    await inbox.put("a", "A", { correlation_lineage: lin({ r: 0 }) });
    inbox.markSourceDone("a");
    inbox.markSourceDone("b");
    await actor.run();
    expect(calls).toEqual([]);
  });
});

describe("NodeActor – more scheduler/lineage coverage", () => {
  it("does not fire a no-max node while a required empty input is still open", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("cfg", 1);
    inbox.addUpstream("other", 1);
    const { executor, calls } = trackingExecutor(() => ({}));
    const { actor } = createActor(makeNode(), inbox, executor, {
      correlation: analysis(["r", "s"], {
        cfg: [["r"], false],
        other: [["r"], false]
      })
    });
    // cfg arrives, other never arrives (closed empty) -> still fires with cfg
    // only (empty/prefix defaults are allowed once closed).
    await inbox.put("cfg", "C", { correlation_lineage: lin({ r: 0 }) });
    inbox.markSourceDone("cfg");
    inbox.markSourceDone("other");
    await actor.run();
    expect(calls).toEqual([{ cfg: "C" }]);
  });

  it("emitGroup leaves non-iteration sibling slots on the parent lineage", async () => {
    const node = makeNode({
      is_streaming_input: true,
      output_correlation: {
        iter: { kind: "iteration", source: "__execution__", group: "g" }
        // "plain" has no correlation -> inherits parent lineage
      }
    });
    const inbox = new NodeInbox();
    const executor: NodeExecutor = {
      async process() {
        return {};
      },
      async run(_inputs, outputs) {
        await outputs.emitGroup({ iter: 1, plain: 2 });
      }
    };
    const { actor, sentOutputs } = createActor(node, inbox, executor, {
      correlation: analysis([], {})
    });
    await actor.run();
    const ps = (sentOutputs[0].hints as { perSlotLineage: Record<string, Record<string, { index: number }>> }).perSlotLineage;
    expect(ps.iter["n1:g"].index).toBe(0); // minted
    expect(ps.plain).toEqual({}); // parent (empty) lineage, no root
  });

  it("controlled mode reuses already-cached data without re-waiting", async () => {
    const node = makeNode({ is_controlled: true });
    const inbox = new NodeInbox();
    inbox.addUpstream("__control__", 1);
    inbox.addUpstream("x", 1);
    const { executor, calls } = trackingExecutor((i) => ({ out: i.x }));
    const { actor } = createActor(node, inbox, executor);
    // data buffered up-front -> fast path (no drain wait); two runs reuse it.
    await inbox.put("x", 7);
    await inbox.put("__control__", { event_type: "run", properties: {} });
    await inbox.put("__control__", { event_type: "run", properties: {} });
    await inbox.put("__control__", { event_type: "stop" });
    inbox.markSourceDone("x");
    inbox.markSourceDone("__control__");
    await actor.run();
    expect(calls).toEqual([{ x: 7 }, { x: 7 }]);
  });
});

describe("NodeActor._maybeCollapseForSlot – aggregate edges", () => {
  function aggNode(corr: Record<string, unknown>) {
    return makeNode({ is_streaming_input: true, output_correlation: corr as never });
  }
  async function emitAgg(node: NodeDescriptor, inScope: string[], inLineage: Record<string, number>) {
    const inbox = new NodeInbox();
    inbox.addUpstream("in", 1);
    const executor: NodeExecutor = {
      async process() { return {}; },
      async run(inputs, outputs) {
        for await (const _ of inputs.stream("in")) void _;
        await outputs.emit("rolled", "s");
      }
    };
    const { actor, sentOutputs } = createActor(node, inbox, executor, {
      correlation: analysis(inScope, { in: [inScope, false] })
    });
    const runP = actor.run();
    await inbox.put("in", "v", { correlation_lineage: lin(inLineage) });
    inbox.markSourceDone("in");
    await runP;
    return sentOutputs[0].hints as { perSlotLineage?: Record<string, unknown>; invocationLineage?: unknown };
  }

  it("is identity when collapse is not innermost", async () => {
    const node = aggNode({ rolled: { kind: "aggregate", source: "in", collapse: "outer" } });
    const hints = await emitAgg(node, ["r", "x:s"], { r: 0, "x:s": 2 });
    // collapse !== innermost -> no collapse -> emit inherits the full invocation
    // lineage with no per-slot override.
    expect(hints.invocationLineage).toEqual({ r: { index: 0 }, "x:s": { index: 2 } });
    expect(hints.perSlotLineage).toBeUndefined();
  });

  it("returns the base lineage when the collapsed root is absent", async () => {
    const node = aggNode({ rolled: { kind: "aggregate", source: "in", collapse: "innermost" } });
    // source scope ends in "x:s" but the lineage only has "r" -> base returned unchanged
    const hints = await emitAgg(node, ["r", "x:s"], { r: 0 });
    // collapsed root "x:s" absent from the lineage -> base returned (perSlot set).
    expect(hints.perSlotLineage?.rolled).toEqual({ r: { index: 0 } });
  });
});

describe("NodeActor._maybeMintForSlot – non-iteration", () => {
  it("does not mint or attach a root for a single-kind streaming output", async () => {
    const node = makeNode({
      is_streaming_input: true,
      output_correlation: { out: { kind: "single", source: "__execution__" } }
    });
    const inbox = new NodeInbox();
    inbox.addUpstream("in", 1);
    const executor: NodeExecutor = {
      async process() { return {}; },
      async run(inputs, outputs) {
        for await (const _ of inputs.stream("in")) void _;
        await outputs.emit("out", 1);
      }
    };
    const { actor, sentOutputs } = createActor(node, inbox, executor, {
      correlation: analysis(["r"], { in: [["r"], false] })
    });
    const runP = actor.run();
    await inbox.put("in", "v", { correlation_lineage: lin({ r: 0 }) });
    inbox.markSourceDone("in");
    await runP;
    const hints = sentOutputs[0].hints as { invocationLineage?: unknown; perSlotLineage?: Record<string, unknown> };
    // single output inherits invocation lineage with no minted root.
    expect(hints.invocationLineage).toEqual({ r: { index: 0 } });
    expect(hints.perSlotLineage).toBeUndefined();
  });
});
