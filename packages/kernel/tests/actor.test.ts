/**
 * NodeActor tests – execution mode parity.
 *
 * Covers:
 *  - Buffered mode (process called once per input batch)
 *  - Streaming output via genProcess
 *  - on_any sync mode
 *  - zip_all sync mode with sticky semantics
 *  - Controlled mode (control events)
 */

import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { NodeActor, type NodeExecutor } from "../src/actor.js";
import { NodeInbox } from "../src/inbox.js";
import type { NodeDescriptor, NodeUpdate } from "@nodetool-ai/protocol";
import { configureLogging } from "@nodetool-ai/config";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(overrides: Partial<NodeDescriptor> = {}): NodeDescriptor {
  return { id: "test_node", type: "test.Node", ...overrides };
}

function trackingExecutor(
  processFn: (inputs: Record<string, unknown>) => Record<string, unknown>
): {
  executor: NodeExecutor;
  calls: Array<Record<string, unknown>>;
} {
  const calls: Array<Record<string, unknown>> = [];
  return {
    executor: {
      async process(inputs) {
        calls.push(inputs);
        return processFn(inputs);
      }
    },
    calls
  };
}

interface SentOutput {
  nodeId: string;
  outputs: Record<string, unknown>;
}

function createActor(
  node: NodeDescriptor,
  inbox: NodeInbox,
  executor: NodeExecutor
): { actor: NodeActor; sentOutputs: SentOutput[]; messages: unknown[] } {
  const sentOutputs: SentOutput[] = [];
  const messages: unknown[] = [];

  const actor = new NodeActor({
    node,
    inbox,
    executor,
    sendOutputs: async (nodeId, outputs) => {
      sentOutputs.push({ nodeId, outputs });
    },
    emitMessage: (msg) => messages.push(msg)
  });

  return { actor, sentOutputs, messages };
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("NodeActor – buffered mode", () => {
  it("logs the node being executed", async () => {
    const node = makeNode({ sync_mode: "zip_all" });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    const { executor } = trackingExecutor((inputs) => ({
      result: inputs
    }));

    const { actor } = createActor(node, inbox, executor);

    await inbox.put("a", 5);
    inbox.markSourceDone("a");

    await actor.run();

    const logged = stderrSpy.mock.calls
      .map(([chunk]) => String(chunk))
      .find((line) => line.includes("Executing node"));

    expect(logged).toContain("Executing node");
    expect(logged).toContain('"nodeId":"test_node"');
    expect(logged).toContain('"type":"test.Node"');
  });

  it("defaults to on_any when sync_mode is omitted", async () => {
    const node = makeNode();
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 1);

    const { executor, calls } = trackingExecutor((inputs) => ({
      result: inputs
    }));

    const { actor } = createActor(node, inbox, executor);

    await inbox.put("a", 1);
    await inbox.put("b", 2);
    await inbox.put("a", 3);
    inbox.markSourceDone("a");
    inbox.markSourceDone("b");

    await actor.run();

    expect(calls).toEqual([
      { a: 1, b: 2 },
      { a: 3, b: 2 }
    ]);
  });

  it("calls process once and sends outputs", async () => {
    const node = makeNode({
      sync_mode: "zip_all",
      properties: { label: "demo" }
    });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    const { executor, calls } = trackingExecutor((inputs) => ({
      result: (inputs.a as number) * 2
    }));

    const { actor, sentOutputs, messages } = createActor(node, inbox, executor);

    await inbox.put("a", 5);
    inbox.markSourceDone("a");

    const result = await actor.run();

    expect(calls).toHaveLength(1);
    // Node properties are merged as defaults; edge input "a" overrides
    expect(calls[0]).toEqual({ label: "demo", a: 5 });
    expect(sentOutputs).toHaveLength(1);
    expect(sentOutputs[0].outputs).toEqual({ result: 10 });
    expect(result.outputs).toEqual({ result: 10 });

    // Should have emitted running + completed statuses
    const statusMsgs = messages.filter(
      (m) => (m as NodeUpdate).type === "node_update"
    ) as NodeUpdate[];
    expect(statusMsgs.some((m) => m.status === "running")).toBe(true);
    expect(statusMsgs.some((m) => m.status === "completed")).toBe(true);
    expect(statusMsgs.every((m) => m.properties?.label === "demo")).toBe(true);
  });
});

describe("NodeActor – streaming output", () => {
  it("yields multiple outputs via genProcess", async () => {
    const node = makeNode({ is_streaming_output: true, sync_mode: "zip_all" });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    const executor: NodeExecutor = {
      async process() {
        return {};
      },
      async *genProcess(inputs) {
        const val = inputs.a as number;
        yield { chunk: val * 1 };
        yield { chunk: val * 2 };
        yield { chunk: val * 3 };
      }
    };

    const { actor, sentOutputs } = createActor(node, inbox, executor);

    await inbox.put("a", 10);
    inbox.markSourceDone("a");

    await actor.run();

    expect(sentOutputs).toHaveLength(3);
    expect(sentOutputs.map((s) => s.outputs)).toEqual([
      { chunk: 10 },
      { chunk: 20 },
      { chunk: 30 }
    ]);
  });

  it("ignores null streaming outputs and keeps the collected non-null result", async () => {
    const node = makeNode({ is_streaming_output: true, sync_mode: "zip_all" });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    const executor: NodeExecutor = {
      async process() {
        return {};
      },
      async *genProcess(inputs) {
        const val = inputs.a as string;
        yield { chunk: { type: "chunk", content: val } };
        yield { chunk: null, text: `${val}!` };
      }
    };

    const { actor, sentOutputs, messages } = createActor(node, inbox, executor);

    await inbox.put("a", "hi");
    inbox.markSourceDone("a");

    const result = await actor.run();

    expect(sentOutputs.map((s) => s.outputs)).toEqual([
      { chunk: { type: "chunk", content: "hi" } },
      { text: "hi!" }
    ]);
    expect(result.outputs).toEqual({
      chunk: { type: "chunk", content: "hi" },
      text: "hi!"
    });

    const completed = messages.find(
      (m) =>
        (m as NodeUpdate).type === "node_update" &&
        (m as NodeUpdate).status === "completed"
    ) as NodeUpdate | undefined;
    expect(completed?.result).toEqual({
      chunk: { type: "chunk", content: "hi" },
      text: "hi!"
    });
  });
});

describe("NodeActor – on_any sync mode", () => {
  it("waits for all handles before initial fire, then fires on each subsequent item", async () => {
    const node = makeNode({ sync_mode: "on_any" });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 1);

    const { executor, calls } = trackingExecutor((inputs) => ({
      result: inputs
    }));
    const { actor, sentOutputs } = createActor(node, inbox, executor);

    // Put one item on each handle, then a second on "a"
    await inbox.put("a", "first");
    await inbox.put("b", "second");
    await inbox.put("a", "third");
    inbox.markSourceDone("a");
    inbox.markSourceDone("b");

    await actor.run();

    // Initial fire after both handles have data, then one more for "third"
    expect(calls).toHaveLength(2);
    // First call has both handles
    expect(calls[0]).toEqual({ a: "first", b: "second" });
    // Second call updates "a" while "b" retains its last value
    expect(calls[1]).toEqual({ a: "third", b: "second" });
  });

  it("fires once when each handle has exactly one item", async () => {
    const node = makeNode({ sync_mode: "on_any" });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 1);

    const { executor, calls } = trackingExecutor((inputs) => ({
      result: inputs
    }));
    const { actor } = createActor(node, inbox, executor);

    await inbox.put("a", "first");
    await inbox.put("b", "second");
    inbox.markSourceDone("a");
    inbox.markSourceDone("b");

    await actor.run();

    // Only one fire since each handle has exactly one item
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ a: "first", b: "second" });
  });
});

describe("NodeActor – zip_all sync mode", () => {
  it("waits for all handles before firing", async () => {
    const node = makeNode({ sync_mode: "zip_all" });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 1);

    const { executor, calls } = trackingExecutor((inputs) => ({
      sum: (inputs.a as number) + (inputs.b as number)
    }));
    const { actor, sentOutputs } = createActor(node, inbox, executor);

    await inbox.put("a", 10);
    await inbox.put("b", 20);
    inbox.markSourceDone("a");
    inbox.markSourceDone("b");

    await actor.run();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ a: 10, b: 20 });
    expect(sentOutputs[0].outputs).toEqual({ sum: 30 });
  });
});

describe("NodeActor – controlled mode", () => {
  it("executes on run events with control properties", async () => {
    const node = makeNode({ is_controlled: true });
    const inbox = new NodeInbox();
    inbox.addUpstream("__control__", 1);
    inbox.addUpstream("x", 1);

    const { executor, calls } = trackingExecutor((inputs) => ({
      out: inputs.threshold
    }));
    const { actor, sentOutputs } = createActor(node, inbox, executor);

    // Send data input first (cached)
    await inbox.put("x", 100);

    // Send control events
    await inbox.put("__control__", {
      event_type: "run" as const,
      properties: { threshold: 0.5 }
    });
    await inbox.put("__control__", {
      event_type: "stop" as const
    });

    inbox.markSourceDone("__control__");
    inbox.markSourceDone("x");

    await actor.run();

    // Should have been called once with merged inputs
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ x: 100, threshold: 0.5 });
    expect(sentOutputs).toHaveLength(1);
  });
});

describe("NodeActor – error handling", () => {
  it("captures errors and reports error status", async () => {
    const node = makeNode();
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    const executor: NodeExecutor = {
      async process() {
        throw new Error("test failure");
      }
    };

    const { actor, messages } = createActor(node, inbox, executor);

    await inbox.put("a", 1);
    inbox.markSourceDone("a");

    const result = await actor.run();

    expect(result.error).toBe("test failure");

    const statusMsgs = messages.filter(
      (m) => (m as NodeUpdate).type === "node_update"
    ) as NodeUpdate[];
    expect(statusMsgs.some((m) => m.status === "error")).toBe(true);
  });
});
