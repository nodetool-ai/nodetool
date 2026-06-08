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
  const sentOutputs: Array<{ nodeId: string; outputs: Record<string, unknown> }> = [];
  const messages: unknown[] = [];
  const actor = new NodeActor({
    node,
    inbox,
    executor,
    correlation: EMPTY_ANALYSIS,
    sendOutputs: async (nodeId, outputs) => {
      sentOutputs.push({ nodeId, outputs });
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
    expect(result.error).toMatch(/exceeded max_pending_keys/);
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
    expect(result.error).toMatch(/max_pending_messages_per_key/);
  });
});
