/**
 * Trigger-event regression: a delivered event must reach the trigger node's
 * outputs on the `resolveNodeType` hydration path, not just the
 * `hydrateGraphNodeFlags` one.
 *
 * `actor.ts` gates the trigger entry point on `node.is_trigger`. Saved
 * workflow JSON never carries that flag, so it has to come from the registry
 * during hydration — and the two hydration paths are mutually exclusive
 * (`session.ts`: `resolveNodeType` takes `Graph.loadFromDict`, otherwise
 * `hydrateGraphNodeFlags`). `hydrateGraphNodeFlags` set the flag; the resolver
 * path dropped it in two places at once — `createGraphNodeTypeResolver` never
 * put `is_trigger` in its `descriptorDefaults`, and `loadFromDict` never read
 * it — so it silently defaulted to false.
 *
 * The failure was quiet, which is why it survived: the run completed, the
 * trigger node reported success, and the event was simply ignored. The node
 * fell through to `genProcess()`, which waits on a live adapter a
 * delivered-event run does not have, and emitted nothing. Every host passing
 * `resolveNodeType` was affected — the CLI and the websocket server both do.
 *
 * The assertion is the payload value, not merely that something was emitted:
 * the interval trigger's `genProcess()` path also emits a tick, so a test that
 * only checked for output would have passed against the bug.
 */
import { describe, it, expect } from "vitest";
import {
  BaseNode,
  NodeRegistry,
  createGraphNodeTypeResolver,
  prop
} from "@nodetool-ai/node-sdk";
import type { StreamingOutputs, TriggerEvent } from "@nodetool-ai/node-sdk";
import { ExecutionSession } from "../src/index.js";

/**
 * Minimal stand-in for the shipped trigger nodes: `genProcess` emits a value
 * the delivered event never would, so the two paths are distinguishable.
 */
class ProbeTrigger extends BaseNode {
  static readonly nodeType = "test.triggers.Probe";
  static readonly isTrigger = true;
  static readonly metadataOutputTypes = { body: "any" };

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    yield { body: "from-genProcess" };
  }

  override async emitTriggerEvent(
    event: TriggerEvent,
    outputs: StreamingOutputs
  ): Promise<void> {
    const payload = (event.payload ?? {}) as { body?: unknown };
    await outputs.emit("body", payload.body);
  }
}

class Sink extends BaseNode {
  static readonly nodeType = "test.Sink";
  static readonly title = "Sink";
  static readonly metadataOutputTypes = { output: "any" };

  @prop({ type: "any", default: null })
  declare value: unknown;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value };
  }
}

function registry(): NodeRegistry {
  const r = new NodeRegistry();
  r.register(ProbeTrigger as never);
  r.register(Sink as never);
  return r;
}

const graph = {
  nodes: [
    { id: "trig", type: "test.triggers.Probe", data: {} },
    { id: "sink", type: "test.Sink", data: {} }
  ],
  edges: [
    {
      id: "e1",
      source: "trig",
      sourceHandle: "body",
      target: "sink",
      targetHandle: "value"
    }
  ]
};

async function runWith(useResolver: boolean) {
  const reg = registry();
  const session = await ExecutionSession.create({
    graph: graph as never,
    registry: reg,
    jobId: `trig-${useResolver ? "resolver" : "flags"}`,
    ...(useResolver
      ? {
          resolveNodeType:
            createGraphNodeTypeResolver(reg).resolveNodeType
        }
      : {}),
    triggerEvent: {
      node_id: "trig",
      payload: { body: "from-trigger-event" },
      input_id: "i1"
    }
  } as never);
  return session.result;
}

describe("trigger event delivery across both hydration paths", () => {
  it("delivers the payload on the hydrateGraphNodeFlags path", async () => {
    const result = await runWith(false);
    expect(Object.values(result.outputs ?? {}).flat()).toEqual([
      "from-trigger-event"
    ]);
  });

  it("delivers the payload on the resolveNodeType path", async () => {
    // The regression: this used to yield "from-genProcess", because
    // is_trigger was false so the actor never took the trigger branch.
    const result = await runWith(true);
    expect(Object.values(result.outputs ?? {}).flat()).toEqual([
      "from-trigger-event"
    ]);
  });
});
