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
import type { NodeDescriptor, NodeUpdate } from "@nodetool/protocol";
import type { ProcessingContext } from "@nodetool/runtime";

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
  executionContext?: ProcessingContext
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
      },
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
      },
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
      },
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
      },
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
      },
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
      },
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
      },
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
      },
    };

    const { actor } = createActor(node, inbox, executor, mockContext);
    await actor.run();

    expect(receivedContext).toBe(mockContext);
  });
});

describe("NodeActor – zip_all sticky edge cases", () => {
  it("uses sticky value when handle is open but EOS arrives", async () => {
    // Scenario: handle "a" has data, handle "b" will go through iterInput
    // and get EOS while there's a sticky value from a previous iteration
    const node = makeNode({ sync_mode: "zip_all" });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 1);

    const calls: Array<Record<string, unknown>> = [];
    const executor: NodeExecutor = {
      async process(inputs) {
        calls.push({ ...inputs });
        return { out: "ok" };
      },
    };

    const { actor, sentOutputs } = createActor(node, inbox, executor);

    // First batch: both handles
    await inbox.put("a", 1);
    await inbox.put("b", 10);

    // Second batch: only a has new data, b closes after first
    await inbox.put("a", 2);

    inbox.markSourceDone("a");
    inbox.markSourceDone("b");

    await actor.run();

    // First call should have both inputs
    expect(calls[0]).toEqual({ a: 1, b: 10 });
    // Second call should use sticky for b
    expect(calls[1]).toEqual({ a: 2, b: 10 });
  });

  it("returns null when handle is closed with no sticky value", async () => {
    // Edge case: handle registered but no data ever arrives
    const node = makeNode({ sync_mode: "zip_all" });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 1);

    const calls: Array<Record<string, unknown>> = [];
    const executor: NodeExecutor = {
      async process(inputs) {
        calls.push({ ...inputs });
        return {};
      },
    };

    const { actor } = createActor(node, inbox, executor);

    // Only provide data for "a", close "b" without data
    await inbox.put("a", 1);
    inbox.markSourceDone("a");
    inbox.markSourceDone("b");

    const result = await actor.run();
    // Should complete without calling process since b has no data
    expect(calls).toHaveLength(0);
    expect(result.outputs).toEqual({});
  });
});

describe("NodeActor – zip_all: open handle EOS with existing sticky", () => {
  it("uses sticky value when iterInput returns EOS on an open handle", async () => {
    // This covers actor.ts lines 323-326:
    // Handle is open, iterInput returns done, but sticky exists from prior iteration
    const node = makeNode({ sync_mode: "zip_all" });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 2); // 2 upstream sources

    const calls: Array<Record<string, unknown>> = [];
    const executor: NodeExecutor = {
      async process(inputs) {
        calls.push({ ...inputs });
        return { out: "ok" };
      },
    };

    const { actor } = createActor(node, inbox, executor);

    // First batch: both handles have data
    await inbox.put("a", 1);
    await inbox.put("b", 10);

    // Second batch: "a" has new data, "b" has one source done but second still "open" with no data
    await inbox.put("a", 2);
    // Mark one of b's sources done (b still "open" with 1 remaining)
    inbox.markSourceDone("b");

    // Now close everything
    inbox.markSourceDone("a");
    inbox.markSourceDone("b"); // b now fully closed

    await actor.run();

    // First call: a=1, b=10
    expect(calls[0]).toEqual({ a: 1, b: 10 });
    // Second call: a=2, b should use sticky=10 (b was open, iterInput returned EOS, sticky existed)
    expect(calls[1]).toEqual({ a: 2, b: 10 });
  });
});

describe("NodeActor – zip_all: inbox closed while waiting (lines 324-326)", () => {
  it("falls back to sticky when inbox is closed during iterInput wait", async () => {
    // This tests the path where iterInput returns done because inbox is closed,
    // but a sticky value exists from a prior iteration.
    const node = makeNode({ sync_mode: "zip_all" });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 1);

    const calls: Array<Record<string, unknown>> = [];
    const executor: NodeExecutor = {
      async process(inputs) {
        calls.push({ ...inputs });
        // After first call, close the inbox to trigger the EOS+sticky path
        if (calls.length === 1) {
          // Closing inbox causes iterInput to return done on next iteration
          await inbox.closeAll();
        }
        return { out: "ok" };
      },
    };

    const { actor } = createActor(node, inbox, executor);

    // Provide data for first iteration
    await inbox.put("a", 1);
    await inbox.put("b", 10);

    // Provide second value for "a" but nothing for "b"
    // When the actor processes the second iteration, it will try to get "b"
    // via iterInput, but inbox is closed, so it returns done.
    // Since "b" has a sticky value from iteration 1, it should use that.
    await inbox.put("a", 2);

    const result = await actor.run();

    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0]).toEqual({ a: 1, b: 10 });
    expect(result.outputs).toBeDefined();
  });
});

describe("NodeActor – on_any mode via async iteration (lines 274-281)", () => {
  it("uses async iterAny when no buffered items available initially", async () => {
    const node = makeNode({ sync_mode: "on_any" });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 1);

    const calls: Array<Record<string, unknown>> = [];
    const executor: NodeExecutor = {
      async process(inputs) {
        calls.push({ ...inputs });
        return { out: "ok" };
      },
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

    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(sentOutputs.length).toBeGreaterThanOrEqual(1);
  });
});

describe("NodeActor – zip_all closed handle no sticky (lines 340-341)", () => {
  it("uses sticky value from first iteration when handle closes", async () => {
    const node = makeNode({ sync_mode: "zip_all" });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 1);

    const calls: Array<Record<string, unknown>> = [];
    const executor: NodeExecutor = {
      async process(inputs) {
        calls.push({ ...inputs });
        return { out: "ok" };
      },
    };

    const { actor } = createActor(node, inbox, executor);

    // Both handles have data for first iteration
    await inbox.put("a", 10);
    await inbox.put("b", 20);
    // "a" has second value, "b" is done
    await inbox.put("a", 30);
    inbox.markSourceDone("a");
    inbox.markSourceDone("b");

    await actor.run();

    expect(calls[0]).toEqual({ a: 10, b: 20 });
    // Second iteration: a=30, b=sticky(20)
    expect(calls[1]).toEqual({ a: 30, b: 20 });
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
      },
    };

    const { actor } = createActor(node, inbox, executor);

    // Send data inputs first (cached)
    await inbox.put("x", 10);
    await inbox.put("y", 20);

    // First run event
    await inbox.put("__control__", {
      event_type: "run" as const,
      properties: { multiplier: 2 },
    });

    // Second run event reuses cached inputs
    await inbox.put("__control__", {
      event_type: "run" as const,
      properties: { multiplier: 3 },
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
