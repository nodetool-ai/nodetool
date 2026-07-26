/**
 * Trigger entry point: a run carrying a `trigger_event` for a trigger node
 * calls `emitTriggerEvent` once (payload → declared output slots) and
 * completes — the node's live-listening `genProcess` loop is never entered.
 * Runs without a trigger event fall through to today's streaming path, so
 * the in-editor live-test mode is preserved.
 *
 * Pattern follows tests/e2e/helpers.ts (registry-resolved executors) with a
 * real ProcessingContext so `ctx.triggerEvent` reaches the actor.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { WorkflowRunner } from "../src/runner.js";
import type { Edge, NodeDescriptor } from "@nodetool-ai/protocol";
import {
  BaseNode,
  NodeRegistry,
  Passthrough,
  hydrateGraphNodeFlags
} from "@nodetool-ai/node-sdk";
import type { StreamingOutputs, TriggerEvent } from "@nodetool-ai/node-sdk";
import { ProcessingContext } from "@nodetool-ai/runtime";

class EntryTrigger extends BaseNode {
  static readonly nodeType = "test.EntryTrigger";
  static readonly title = "Entry Trigger";
  static readonly description = "Trigger node for entry-point tests";
  static readonly isTrigger = true;
  static readonly outputTypes = { data: "any", timestamp: "str" };

  static emitTriggerEventCalls = 0;
  static genProcessEntries = 0;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  // Live-listening loop (in-editor test mode). Yields once so the run can
  // terminate in tests; a real trigger would loop forever.
  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    EntryTrigger.genProcessEntries++;
    yield { data: "live-data", timestamp: "live-ts" };
  }

  async emitTriggerEvent(
    event: TriggerEvent,
    outputs: StreamingOutputs
  ): Promise<void> {
    EntryTrigger.emitTriggerEventCalls++;
    await super.emitTriggerEvent(event, outputs);
  }
}

function makeRegistry(): NodeRegistry {
  const registry = new NodeRegistry();
  registry.register(EntryTrigger);
  registry.register(Passthrough);
  return registry;
}

function makeGraph() {
  const nodes: NodeDescriptor[] = [
    { id: "trig", type: EntryTrigger.nodeType, name: "trig" },
    { id: "sink", type: Passthrough.nodeType, name: "sink" }
  ];
  const edges: Edge[] = [
    { source: "trig", sourceHandle: "data", target: "sink", targetHandle: "value" }
  ];
  return { nodes, edges };
}

function makeRunner(registry: NodeRegistry, ctx: ProcessingContext) {
  return new WorkflowRunner("trigger-entry-job", {
    resolveExecutor: (node) => registry.resolve(node),
    executionContext: ctx
  });
}

describe("Trigger entry point (emitTriggerEvent)", () => {
  beforeEach(() => {
    EntryTrigger.emitTriggerEventCalls = 0;
    EntryTrigger.genProcessEntries = 0;
  });

  it("hydration stamps is_trigger from the node class", () => {
    const hydrated = hydrateGraphNodeFlags(makeGraph(), makeRegistry());
    const trig = hydrated.nodes.find((n) => n.id === "trig")!;
    const sink = hydrated.nodes.find((n) => n.id === "sink")!;
    expect(trig.is_trigger).toBe(true);
    expect(sink.is_trigger).toBe(false);
  });

  it("matching trigger_event calls emitTriggerEvent once, emits the payload, completes — genProcess never entered", async () => {
    const registry = makeRegistry();
    const ctx = new ProcessingContext({ jobId: "j-trig-1" });
    const runner = makeRunner(registry, ctx);
    const graph = hydrateGraphNodeFlags(makeGraph(), registry);

    const result = await runner.run(
      {
        job_id: "j-trig-1",
        trigger_event: {
          node_id: "trig",
          payload: {
            data: "hello-from-event",
            timestamp: "2026-07-26T00:00:00Z",
            not_a_slot: "ignored"
          },
          input_id: "input-1"
        }
      },
      graph
    );

    expect(result.status).toBe("completed");
    expect(EntryTrigger.emitTriggerEventCalls).toBe(1);
    expect(EntryTrigger.genProcessEntries).toBe(0);
    // Payload keys land on the declared output slots and flow downstream.
    expect(result.outputs["sink"]).toContain("hello-from-event");
    // Undeclared payload keys are not emitted as output slots.
    const badUpdates = result.messages.filter(
      (m) =>
        (m as { type?: string; output_name?: string }).type ===
          "output_update" &&
        (m as { output_name?: string }).output_name === "not_a_slot"
    );
    expect(badUpdates).toHaveLength(0);
  });

  it("run without trigger_event falls through to the live streaming path", async () => {
    const registry = makeRegistry();
    const ctx = new ProcessingContext({ jobId: "j-trig-2" });
    const runner = makeRunner(registry, ctx);
    const graph = hydrateGraphNodeFlags(makeGraph(), registry);

    const result = await runner.run({ job_id: "j-trig-2" }, graph);

    expect(result.status).toBe("completed");
    expect(EntryTrigger.genProcessEntries).toBe(1);
    expect(EntryTrigger.emitTriggerEventCalls).toBe(0);
    expect(result.outputs["sink"]).toContain("live-data");
  });

  it("trigger_event targeting a different node leaves the trigger on the live path", async () => {
    const registry = makeRegistry();
    const ctx = new ProcessingContext({ jobId: "j-trig-3" });
    const runner = makeRunner(registry, ctx);
    const graph = hydrateGraphNodeFlags(makeGraph(), registry);

    const result = await runner.run(
      {
        job_id: "j-trig-3",
        trigger_event: {
          node_id: "someone-else",
          payload: { data: "misdirected" },
          input_id: "input-2"
        }
      },
      graph
    );

    expect(result.status).toBe("completed");
    expect(EntryTrigger.genProcessEntries).toBe(1);
    expect(EntryTrigger.emitTriggerEventCalls).toBe(0);
    expect(result.outputs["sink"]).toContain("live-data");
  });
});
