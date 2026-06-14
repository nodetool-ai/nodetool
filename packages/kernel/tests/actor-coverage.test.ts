/**
 * Additional NodeActor tests for coverage gaps:
 *  - Streaming input mode
 *  - Source nodes with no input handles (both buffered and streaming output)
 *  - preProcess / finalize hooks
 *  - Error handling with non-Error throws
 *  - _emitNodeStatus with null properties
 */

import { describe, it, expect } from "vitest";
import { NodeActor, type NodeExecutor } from "../src/actor.js";
import { NodeInbox } from "../src/inbox.js";
import type { NodeAnalysis } from "../src/correlation-analysis.js";
import type { NodeDescriptor, NodeUpdate } from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";

/**
 * Minimal analysis for nodes whose inputs all arrive at the empty scope
 * (scalars/config from source nodes). Per docs/correlation-design.md §"Validation
 * rules" #1, empty scopes are constants/config: each handle is sticky-latest and
 * the node fires once when its handles are satisfied. This is faithful for these
 * tests because their upstreams are plain source nodes emitting at empty scope.
 */
const EMPTY_ANALYSIS: NodeAnalysis = {
  invocationScope: [],
  inputs: new Map(),
  outputs: new Map()
};

function makeNode(overrides: Partial<NodeDescriptor> = {}): NodeDescriptor {
  return { id: "test_node", type: "test.Node", ...overrides };
}

interface SentOutput {
  nodeId: string;
  outputs: Record<string, unknown>;
}

function createActor(
  node: NodeDescriptor,
  inbox: NodeInbox,
  executor: NodeExecutor,
  executionContext?: ProcessingContext,
  stickyHandles?: Set<string>
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
    emitMessage: (msg) => messages.push(msg),
    executionContext,
    stickyHandles,
    correlation: EMPTY_ANALYSIS
  });

  return { actor, sentOutputs, messages };
}

describe("NodeActor – streaming input mode", () => {
  it("calls process once with empty inputs for streaming input", async () => {
    const node = makeNode({ is_streaming_input: true });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    const calls: Array<Record<string, unknown>> = [];
    const executor: NodeExecutor = {
      async process(inputs) {
        calls.push(inputs);
        return { result: "streamed" };
      }
    };

    const { actor, sentOutputs } = createActor(node, inbox, executor);

    await inbox.put("a", 1);
    inbox.markSourceDone("a");

    const result = await actor.run();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({});
    expect(sentOutputs).toHaveLength(1);
    expect(sentOutputs[0].outputs).toEqual({ result: "streamed" });
    expect(result.outputs).toEqual({ result: "streamed" });
  });
});

describe("NodeActor – source node (no input handles)", () => {
  it("executes process once when no input handles exist", async () => {
    const node = makeNode();
    const inbox = new NodeInbox();
    // No addUpstream calls - source node

    const executor: NodeExecutor = {
      async process() {
        return { value: 42 };
      }
    };

    const { actor, sentOutputs } = createActor(node, inbox, executor);
    const result = await actor.run();

    expect(sentOutputs).toHaveLength(1);
    expect(sentOutputs[0].outputs).toEqual({ value: 42 });
    expect(result.outputs).toEqual({ value: 42 });
  });

  it("executes genProcess for streaming output source node", async () => {
    const node = makeNode({ is_streaming_output: true });
    const inbox = new NodeInbox();

    const executor: NodeExecutor = {
      async process() {
        return {};
      },
      async *genProcess() {
        yield { chunk: 1 };
        yield { chunk: 2 };
      }
    };

    const { actor, sentOutputs } = createActor(node, inbox, executor);
    await actor.run();

    expect(sentOutputs).toHaveLength(2);
    expect(sentOutputs[0].outputs).toEqual({ chunk: 1 });
    expect(sentOutputs[1].outputs).toEqual({ chunk: 2 });
  });
});

describe("NodeActor – preProcess and finalize", () => {
  it("calls preProcess and finalize lifecycle hooks", async () => {
    const node = makeNode();
    const inbox = new NodeInbox();
    const calls: string[] = [];

    const executor: NodeExecutor = {
      async process() {
        calls.push("process");
        return {};
      },
      async preProcess() {
        calls.push("preProcess");
      },
      async finalize() {
        calls.push("finalize");
      }
    };

    const { actor } = createActor(node, inbox, executor);
    await actor.run();

    expect(calls).toEqual(["preProcess", "process", "finalize"]);
  });
});

describe("NodeActor – error handling edge cases", () => {
  it("handles non-Error thrown values", async () => {
    const node = makeNode();
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    const executor: NodeExecutor = {
      async process() {
        throw "string error";
      }
    };

    const { actor, messages } = createActor(node, inbox, executor);

    await inbox.put("a", 1);
    inbox.markSourceDone("a");

    const result = await actor.run();
    expect(result.error).toBe("string error");
    expect(result.outputs).toEqual({});

    const statusMsgs = messages.filter(
      (m) => (m as NodeUpdate).type === "node_update"
    ) as NodeUpdate[];
    expect(statusMsgs.some((m) => m.status === "error")).toBe(true);
  });
});

describe("NodeActor – node status emission", () => {
  it("emits node_update with null properties when properties not set", async () => {
    const node = makeNode({ properties: undefined });
    const inbox = new NodeInbox();

    const executor: NodeExecutor = {
      async process() {
        return { out: 1 };
      }
    };

    const { actor, messages } = createActor(node, inbox, executor);
    await actor.run();

    const statusMsgs = messages.filter(
      (m) => (m as NodeUpdate).type === "node_update"
    ) as NodeUpdate[];
    expect(statusMsgs.length).toBeGreaterThanOrEqual(2);
    expect(statusMsgs[0].properties).toBeNull();
  });

  it("emits node_update with name falling back to type", async () => {
    const node = makeNode({ name: undefined });
    const inbox = new NodeInbox();

    const executor: NodeExecutor = {
      async process() {
        return {};
      }
    };

    const { actor, messages } = createActor(node, inbox, executor);
    await actor.run();

    const statusMsgs = messages.filter(
      (m) => (m as NodeUpdate).type === "node_update"
    ) as NodeUpdate[];
    expect(statusMsgs[0].node_name).toBe("test.Node");
  });
});

describe("NodeActor – execution context forwarding", () => {
  it("passes execution context to process calls", async () => {
    const node = makeNode();
    const inbox = new NodeInbox();
    let receivedContext: ProcessingContext | undefined;

    const mockContext = { emit: () => {} } as unknown as ProcessingContext;

    const executor: NodeExecutor = {
      async process(_inputs, context) {
        receivedContext = context;
        return {};
      }
    };

    const { actor } = createActor(node, inbox, executor, mockContext);
    await actor.run();

    expect(receivedContext).toBe(mockContext);
  });
});

describe("NodeActor – empty-scope sticky inputs", () => {
  it("fires once with the latest value of each empty-scope handle", async () => {
    // Empty-scope handles are constants/config (correlation-design.md §"Validation
    // rules" #1): each retains its LATEST value and the node fires once when all
    // handles are satisfied. Pushing a=1,b=10 then a=2 yields a single call with
    // the latest values {a:2, b:10} — not the old zip_all FIFO pairing.
    const node = makeNode();
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 1);

    const calls: Array<Record<string, unknown>> = [];
    const executor: NodeExecutor = {
      async process(inputs) {
        calls.push({ ...inputs });
        return { out: "ok" };
      }
    };

    const { actor } = createActor(node, inbox, executor);

    await inbox.put("a", 1);
    await inbox.put("b", 10);
    await inbox.put("a", 2);

    inbox.markSourceDone("a");
    inbox.markSourceDone("b");

    await actor.run();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ a: 2, b: 10 });
  });

  it("fires with the handles that received data when another closes empty", async () => {
    // "b" never receives a value and its upstream closes. Empty-scope handles
    // with no value contribute nothing (the node would fall back to its declared
    // default); a satisfied handle still drives a single firing.
    const node = makeNode();
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 1);

    const calls: Array<Record<string, unknown>> = [];
    const executor: NodeExecutor = {
      async process(inputs) {
        calls.push({ ...inputs });
        return {};
      }
    };

    const { actor } = createActor(node, inbox, executor);

    await inbox.put("a", 1);
    inbox.markSourceDone("a");
    inbox.markSourceDone("b");

    await actor.run();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ a: 1 });
  });
});

describe("NodeActor – empty-scope sticky: multi-source handle", () => {
  it("keeps the latest value when one upstream of a handle closes early", async () => {
    // "b" has two upstream sources. One closes after delivering a value; the
    // empty-scope handle keeps that latest value (correlation-design.md
    // §"Validation rules" #1) and the node fires once with the latest of each.
    const node = makeNode();
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 2); // 2 upstream sources

    const calls: Array<Record<string, unknown>> = [];
    const executor: NodeExecutor = {
      async process(inputs) {
        calls.push({ ...inputs });
        return { out: "ok" };
      }
    };

    const { actor } = createActor(node, inbox, executor);

    await inbox.put("a", 1);
    await inbox.put("b", 10);
    await inbox.put("a", 2);
    // One of b's sources finishes; b's latest sticky value stays 10.
    inbox.markSourceDone("b");

    inbox.markSourceDone("a");
    inbox.markSourceDone("b"); // b now fully closed

    await actor.run();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ a: 2, b: 10 });
  });
});

describe("NodeActor – empty-scope sticky: single firing on close", () => {
  it("fires once with the latest of each handle when all upstreams close", async () => {
    // Empty-scope handles are sticky-latest constants (correlation-design.md
    // §"Validation rules" #1). Multiple values on "a" do not re-fire the node;
    // it fires once with the latest value of each handle when its upstreams close.
    const node = makeNode();
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 1);

    const calls: Array<Record<string, unknown>> = [];
    const executor: NodeExecutor = {
      async process(inputs) {
        calls.push({ ...inputs });
        return { out: "ok" };
      }
    };

    const { actor } = createActor(node, inbox, executor);

    await inbox.put("a", 1);
    await inbox.put("b", 10);
    await inbox.put("a", 2);

    inbox.markSourceDone("a");
    inbox.markSourceDone("b");

    const result = await actor.run();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ a: 2, b: 10 });
    expect(result.outputs).toEqual({ out: "ok" });
  });
});

describe("NodeActor – async arrival after run() starts", () => {
  it("awaits inputs that arrive after run() and fires once", async () => {
    // No data is buffered before run(); the actor awaits arrivals via the async
    // iterator. Once both empty-scope handles are satisfied it fires once.
    const node = makeNode();
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 1);

    const calls: Array<Record<string, unknown>> = [];
    const executor: NodeExecutor = {
      async process(inputs) {
        calls.push({ ...inputs });
        return { out: "ok" };
      }
    };

    const { actor, sentOutputs } = createActor(node, inbox, executor);

    // Don't put data before actor.run() - force async iteration path
    setTimeout(async () => {
      await inbox.put("a", 1);
      await inbox.put("b", 2);
      inbox.markSourceDone("a");
      inbox.markSourceDone("b");
    }, 10);

    await actor.run();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ a: 1, b: 2 });
    expect(sentOutputs).toHaveLength(1);
  });
});

describe("NodeActor – empty-scope sticky: latest value wins on close", () => {
  it("fires once with the latest empty-scope value when a handle closes early", async () => {
    // "b" delivers one value then closes; "a" delivers two values. Empty-scope
    // handles are sticky-latest (correlation-design.md §"Validation rules" #1),
    // so the single firing uses a's latest (30) and b's retained value (20).
    const node = makeNode();
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 1);

    const calls: Array<Record<string, unknown>> = [];
    const executor: NodeExecutor = {
      async process(inputs) {
        calls.push({ ...inputs });
        return { out: "ok" };
      }
    };

    const { actor } = createActor(node, inbox, executor);

    await inbox.put("a", 10);
    await inbox.put("b", 20);
    await inbox.put("a", 30);
    inbox.markSourceDone("a");
    inbox.markSourceDone("b");

    await actor.run();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ a: 30, b: 20 });
  });
});

describe("NodeActor – controlled mode edge cases", () => {
  it("caches data inputs for replay in controlled mode", async () => {
    const node = makeNode({ is_controlled: true });
    const inbox = new NodeInbox();
    inbox.addUpstream("__control__", 1);
    inbox.addUpstream("x", 1);
    inbox.addUpstream("y", 1);

    const calls: Array<Record<string, unknown>> = [];
    const executor: NodeExecutor = {
      async process(inputs) {
        calls.push({ ...inputs });
        return { out: "ok" };
      }
    };

    const { actor } = createActor(node, inbox, executor);

    // Send data inputs first (cached)
    await inbox.put("x", 10);
    await inbox.put("y", 20);

    // First run event
    await inbox.put("__control__", {
      event_type: "run" as const,
      properties: { multiplier: 2 }
    });

    // Second run event reuses cached inputs
    await inbox.put("__control__", {
      event_type: "run" as const,
      properties: { multiplier: 3 }
    });

    // Stop
    await inbox.put("__control__", { event_type: "stop" as const });

    inbox.markSourceDone("__control__");
    inbox.markSourceDone("x");
    inbox.markSourceDone("y");

    await actor.run();

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ x: 10, y: 20, multiplier: 2 });
    expect(calls[1]).toEqual({ x: 10, y: 20, multiplier: 3 });
  });
});

describe("NodeActor – controlled mode survivors", () => {
  it("stops processing run events after a stop event", async () => {
    const node = makeNode({ is_controlled: true });
    const inbox = new NodeInbox();
    inbox.addUpstream("__control__", 1);

    const calls: Array<Record<string, unknown>> = [];
    const executor: NodeExecutor = {
      async process(inputs) {
        calls.push({ ...inputs });
        return {};
      }
    };
    const { actor } = createActor(node, inbox, executor);

    await inbox.put("__control__", { event_type: "run" as const, properties: {} });
    // An unrecognized event is neither run nor stop: it must be ignored.
    await inbox.put("__control__", { event_type: "noop", properties: {} } as never);
    await inbox.put("__control__", { event_type: "stop" as const });
    // A run event after the stop must NOT be processed (the loop breaks).
    await inbox.put("__control__", { event_type: "run" as const, properties: {} });
    inbox.markSourceDone("__control__");

    await actor.run();
    expect(calls).toHaveLength(1);
  });

  it("merges node properties and dynamic_properties under control properties", async () => {
    const node = makeNode({
      is_controlled: true,
      properties: { base: "B", over: "node" },
      dynamic_properties: { dyn: "D" }
    });
    const inbox = new NodeInbox();
    inbox.addUpstream("__control__", 1);

    const calls: Array<Record<string, unknown>> = [];
    const executor: NodeExecutor = {
      async process(inputs) {
        calls.push({ ...inputs });
        return {};
      }
    };
    const { actor } = createActor(node, inbox, executor);

    await inbox.put("__control__", {
      event_type: "run" as const,
      properties: { over: "control" }
    });
    inbox.markSourceDone("__control__");

    await actor.run();
    expect(calls).toEqual([
      { base: "B", dyn: "D", over: "control" }
    ]);
  });

  it("waits for late-arriving data and re-queues control events held during the wait", async () => {
    const node = makeNode({ is_controlled: true });
    const inbox = new NodeInbox();
    inbox.addUpstream("__control__", 1);
    inbox.addUpstream("x", 1);

    const calls: Array<Record<string, unknown>> = [];
    const executor: NodeExecutor = {
      async process(inputs) {
        calls.push({ ...inputs });
        return {};
      }
    };
    const { actor } = createActor(node, inbox, executor);

    const runPromise = actor.run(); // parks in _waitForDataInputs (x not buffered)
    await new Promise((r) => setTimeout(r, 0));

    // Control event arrives before the data: it must be held aside, not consumed.
    await inbox.put("__control__", { event_type: "run" as const, properties: {} });
    await inbox.put("x", 99); // satisfies the wait; held control event re-queued
    await inbox.put("__control__", { event_type: "stop" as const });
    inbox.markSourceDone("__control__");
    inbox.markSourceDone("x");

    await runPromise;
    // The run event executed once, with the data that arrived during the wait.
    expect(calls).toEqual([{ x: 99 }]);
  });
});

describe("NodeActor._emitNodeStatus – provider cost without a context", () => {
  it("reports null provider_cost when there is no execution context", async () => {
    const node = makeNode({ is_streaming_input: true });
    const inbox = new NodeInbox();
    const executor: NodeExecutor = { async process() { return {}; } };
    const { actor, messages } = createActor(node, inbox, executor);
    await actor.run();
    const completed = messages.find(
      (m) =>
        (m as NodeUpdate).type === "node_update" &&
        (m as NodeUpdate).status === "completed"
    ) as NodeUpdate | undefined;
    expect(completed!.provider_cost).toBeNull();
  });
});

describe("NodeActor._emitNodeStatus – non-object properties", () => {
  it("emits null properties when node.properties is not an object", async () => {
    const node = makeNode({ properties: "not-an-object" as never });
    const inbox = new NodeInbox();
    const executor: NodeExecutor = {
      async process() {
        return {};
      }
    };
    const { actor, messages } = createActor(node, inbox, executor);
    await actor.run();
    const statusMsgs = messages.filter(
      (m) => (m as NodeUpdate).type === "node_update"
    ) as NodeUpdate[];
    expect(statusMsgs.length).toBeGreaterThan(0);
    for (const m of statusMsgs) expect(m.properties).toBeNull();
  });
});
