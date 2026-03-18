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
    emitMessage: (msg) => messages.push(msg),
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
      },
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
      },
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
      },
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
      },
    };

    const { actor } = createActor(node, inbox, executor);

    // Cache a base input
    await inbox.put("base", "cached_value");

    // Event 1: sets property "alpha"
    await inbox.put("__control__", {
      event_type: "run" as const,
      properties: { alpha: 1 },
    });

    // Event 2: sets property "beta" but NOT "alpha"
    await inbox.put("__control__", {
      event_type: "run" as const,
      properties: { beta: 2 },
    });

    // Stop
    await inbox.put("__control__", {
      event_type: "stop" as const,
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

  it.todo(
    "controlled node should support response_future for bidirectional agent communication"
  );

  it.todo(
    "controlled node should attach tool_call_id, tool_name from control event metadata"
  );
});
