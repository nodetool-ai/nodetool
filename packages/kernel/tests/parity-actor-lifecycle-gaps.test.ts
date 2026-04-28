/**
 * Regression tests for parity gaps #11 and #13.
 *
 * Gap #11 — Controlled Node Lifecycle:
 *   Python saves/restores node properties per control event, supports
 *   response_future, and tracks metadata (tool_call_id, tool_name, etc.).
 *   TypeScript merges properties via Object.assign with no save/restore,
 *   no response futures, and no metadata tracking.
 *
 * Gap #13 — Node Finalization:
 *   Python calls node.finalize() in a finally block (even on error) and
 *   closes inboxes after finalization. TypeScript calls finalize only
 *   after success (not in a finally block) and does not close inbox.
 */

import { describe, it, expect, vi } from "vitest";
import { NodeActor, type NodeExecutor } from "../src/actor.js";
import { NodeInbox } from "../src/inbox.js";
import type { NodeDescriptor, NodeUpdate } from "@nodetool/protocol";

// ---------------------------------------------------------------------------
// Helpers (mirrored from actor.test.ts)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Gap #13 — Node Finalization
// ---------------------------------------------------------------------------

describe("Gap #13 — Node Finalization", () => {
  it("calls finalize after successful execution", async () => {
    const node = makeNode();
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    const finalizeSpy = vi.fn();
    const executor: NodeExecutor = {
      async process(inputs) {
        return { out: inputs.a };
      },
      async finalize() {
        finalizeSpy();
      }
    };

    const { actor } = createActor(node, inbox, executor);

    await inbox.put("a", 42);
    inbox.markSourceDone("a");

    const result = await actor.run();

    expect(result.error).toBeUndefined();
    expect(finalizeSpy).toHaveBeenCalledTimes(1);
  });

  it("calls finalize even when process throws (PARITY GAP: currently fails)", async () => {
    // Python calls finalize in a finally block so it runs even on error.
    // TypeScript currently calls finalize only after success, so this test
    // documents the gap — finalize is NOT called when process() throws.
    const node = makeNode();
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    const finalizeSpy = vi.fn();
    const executor: NodeExecutor = {
      async process() {
        throw new Error("process exploded");
      },
      async finalize() {
        finalizeSpy();
      }
    };

    const { actor } = createActor(node, inbox, executor);

    await inbox.put("a", 1);
    inbox.markSourceDone("a");

    const result = await actor.run();

    // The error should be captured
    expect(result.error).toBe("process exploded");

    // PARITY GAP: In Python, finalize is called even on error.
    // In TypeScript, finalize is only called on success.
    // This assertion documents the gap — it will FAIL until fixed.
    expect(finalizeSpy).toHaveBeenCalledTimes(1);
  });

  it("inbox should be fully drained after actor.run() completes", async () => {
    // Python closes all inboxes and drains active edges after finalization.
    // TypeScript does not explicitly drain the inbox post-run.
    const node = makeNode();
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    const executor: NodeExecutor = {
      async process(inputs) {
        return { out: inputs.a };
      }
    };

    const { actor } = createActor(node, inbox, executor);

    await inbox.put("a", 99);
    inbox.markSourceDone("a");

    await actor.run();

    expect(inbox.isFullyDrained()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Gap #11 — Controlled Node Lifecycle
// ---------------------------------------------------------------------------

describe("Gap #11 — Controlled Node Lifecycle", () => {
  it("properties from event 1 should not bleed into event 2 (PARITY GAP: save/restore)", async () => {
    // Python saves node properties before each control event and restores
    // them after, so transient overrides from one event don't affect the next.
    // TypeScript merges properties via Object.assign with no save/restore,
    // so properties from event 1 accumulate into event 2.
    const node = makeNode({ is_controlled: true });
    const inbox = new NodeInbox();
    inbox.addUpstream("__control__", 1);
    inbox.addUpstream("base", 1);

    const calls: Array<Record<string, unknown>> = [];
    const executor: NodeExecutor = {
      async process(inputs) {
        calls.push({ ...inputs });
        return { ok: true };
      }
    };

    const { actor } = createActor(node, inbox, executor);

    // Cache a base input
    await inbox.put("base", "cached_value");

    // Event 1: sets property "alpha"
    await inbox.put("__control__", {
      event_type: "run" as const,
      properties: { alpha: 1 }
    });

    // Event 2: sets property "beta" but NOT "alpha"
    await inbox.put("__control__", {
      event_type: "run" as const,
      properties: { beta: 2 }
    });

    // Stop
    await inbox.put("__control__", {
      event_type: "stop" as const
    });

    inbox.markSourceDone("__control__");
    inbox.markSourceDone("base");

    await actor.run();

    expect(calls).toHaveLength(2);

    // Event 1 should have alpha but not beta
    expect(calls[0]).toEqual({ base: "cached_value", alpha: 1 });

    // PARITY GAP: Event 2 should have beta but NOT alpha.
    // In Python, properties are saved/restored so alpha doesn't persist.
    // In TypeScript, _currentControlProperties is simply overwritten per event,
    // BUT _cachedInputs accumulates via Object.assign merging.
    // The actual behavior depends on implementation details.
    // Python expected: { base: "cached_value", beta: 2 }
    // TypeScript actual: alpha may or may not bleed depending on merge strategy.
    expect(calls[1]).toEqual({ base: "cached_value", beta: 2 });
  });

  it("controlled node should support response_future for bidirectional agent communication", async () => {
    // Python's controlled nodes support a response_future mechanism: after
    // sending a run event, the controller can await the controlled node's
    // output via a Future object attached to the event.
    //
    // TypeScript's NodeActor delivers outputs via the sendOutputs callback,
    // which the runner wraps in a Promise via sendControlEvent() using
    // _pendingControlResponses. This test verifies the actor-level output
    // delivery that underpins the runner-level response_future equivalent.
    const node = makeNode({ is_controlled: true });
    const inbox = new NodeInbox();
    inbox.addUpstream("__control__", 1);

    const executor: NodeExecutor = {
      async process(inputs) {
        return { echo: inputs.message, count: (inputs.count as number) + 1 };
      }
    };

    const { actor, sentOutputs } = createActor(node, inbox, executor);

    // Drive the actor concurrently while sending control events
    const runPromise = actor.run();

    await inbox.put("__control__", {
      event_type: "run" as const,
      properties: { message: "hello", count: 0 }
    });
    await inbox.put("__control__", {
      event_type: "run" as const,
      properties: { message: "world", count: 5 }
    });
    await inbox.put("__control__", { event_type: "stop" as const });
    inbox.markSourceDone("__control__");

    const result = await runPromise;

    // The actor delivers responses via sendOutputs for each run event
    expect(result.error).toBeUndefined();
    expect(sentOutputs).toHaveLength(2);
    expect(sentOutputs[0].outputs).toEqual({ echo: "hello", count: 1 });
    expect(sentOutputs[1].outputs).toEqual({ echo: "world", count: 6 });

    // NOTE: TypeScript parity gap — NodeActor has no first-class response_future.
    // The runner's sendControlEvent() provides equivalent Promise-based semantics
    // by storing a pending resolve in _pendingControlResponses and resolving it
    // from _sendMessages() when the node produces output.
  });

  it("controlled node should attach tool_call_id, tool_name from control event metadata", async () => {
    // Python's ControlEvent carries tool_call_id and tool_name as first-class
    // fields used in AI tool call integration (LangChain / OpenAI tool calls).
    // TypeScript's RunEvent only has:
    //   properties: Record<string, unknown>
    //
    // Workaround: pass tool_call_id and tool_name inside the properties dict.
    // The controlled node receives them alongside regular inputs so executors
    // can forward them to downstream AI responses.
    const node = makeNode({ is_controlled: true });
    const inbox = new NodeInbox();
    inbox.addUpstream("__control__", 1);

    const receivedInputs: Record<string, unknown>[] = [];
    const executor: NodeExecutor = {
      async process(inputs) {
        receivedInputs.push({ ...inputs });
        return { result: "done" };
      }
    };

    const { actor } = createActor(node, inbox, executor);
    const runPromise = actor.run();

    // Pass tool metadata via properties (Python-parity workaround)
    await inbox.put("__control__", {
      event_type: "run" as const,
      properties: {
        tool_call_id: "call_abc123",
        tool_name: "search_web",
        query: "TypeScript testing"
      }
    });
    await inbox.put("__control__", { event_type: "stop" as const });
    inbox.markSourceDone("__control__");

    await runPromise;

    expect(receivedInputs).toHaveLength(1);
    // tool_call_id and tool_name are available in the merged inputs
    expect(receivedInputs[0].tool_call_id).toBe("call_abc123");
    expect(receivedInputs[0].tool_name).toBe("search_web");
    expect(receivedInputs[0].query).toBe("TypeScript testing");

    // NOTE: TypeScript parity gap — ControlEvent has no first-class
    // tool_call_id/tool_name fields. They must travel via the properties dict.
    // Python's RunEvent has separate fields:
    //   { event_type: "run", properties: {...}, tool_call_id: "...", tool_name: "...", metadata: {...} }
  });
});
