/**
 * Trigger entry point — the kernel's trigger_event branch.
 *
 * Covers:
 *  (a) is_trigger propagates through toDescriptor()/getNodeMetadata().
 *  (b) a run WITH a matching trigger_event calls emitTriggerEvent once, emits
 *      the payload onto the node's outputs, completes — genProcess is never
 *      entered.
 *  (c) the same graph run WITHOUT a trigger_event falls through to today's
 *      streaming (genProcess) path — the in-editor live-test experience.
 *  (d) a trigger_event targeting a DIFFERENT node_id leaves this node on the
 *      normal path.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { NodeRegistry, BaseNode, getNodeMetadata } from "@nodetool-ai/node-sdk";
import type { StreamingOutputs, TriggerEvent } from "@nodetool-ai/node-sdk";
import type { NodeDescriptor, Edge } from "@nodetool-ai/protocol";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { WorkflowRunner } from "../src/runner.js";
import { withExplicitNodeFlags } from "../src/graph.js";
import { Passthrough } from "@nodetool-ai/node-sdk";

// A trigger node that both listens (genProcess) and has a trigger entry point,
// so the two run paths can be told apart. Counters are static so the test can
// observe them across the fresh instance the registry builds per run.
class FakeTriggerNode extends BaseNode {
  static readonly nodeType = "test.FakeTrigger";
  static readonly title = "Fake Trigger";
  static readonly description = "";
  static readonly isTrigger = true;
  static readonly metadataOutputTypes = { value: "any", label: "str" };

  static emitCalls = 0;
  static genProcessEntered = false;

  static reset(): void {
    FakeTriggerNode.emitCalls = 0;
    FakeTriggerNode.genProcessEntered = false;
  }

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    FakeTriggerNode.genProcessEntered = true;
    yield { value: "live", label: "from-genprocess" };
  }

  override async emitTriggerEvent(
    event: TriggerEvent,
    outputs: StreamingOutputs
  ): Promise<void> {
    FakeTriggerNode.emitCalls += 1;
    // Exercise the default BaseNode mapping (payload keys → declared slots).
    await super.emitTriggerEvent(event, outputs);
  }
}

function makeRegistry(): NodeRegistry {
  const registry = new NodeRegistry();
  registry.register(FakeTriggerNode);
  registry.register(Passthrough);
  return registry;
}

function makeRunner(
  registry: NodeRegistry,
  ctx: ProcessingContext
): WorkflowRunner {
  return new WorkflowRunner("trigger-job", {
    resolveExecutor: (node) => registry.resolve(node),
    executionContext: ctx
  });
}

function triggerGraph() {
  const nodes: NodeDescriptor[] = [
    {
      id: "trigger",
      type: FakeTriggerNode.nodeType,
      name: "trigger",
      is_trigger: true,
      is_streaming_output: true
    },
    { id: "sink", type: Passthrough.nodeType, name: "sink" }
  ];
  const edges: Edge[] = [
    { id: "e1", source: "trigger", sourceHandle: "value", target: "sink", targetHandle: "value" }
  ];
  return withExplicitNodeFlags({ nodes, edges });
}

describe("is_trigger metadata propagation", () => {
  it("surfaces is_trigger on toDescriptor() and getNodeMetadata()", () => {
    expect(FakeTriggerNode.toDescriptor("t1").is_trigger).toBe(true);
    expect(getNodeMetadata(FakeTriggerNode).is_trigger).toBe(true);
    expect(Passthrough.toDescriptor("p1").is_trigger).toBeUndefined();
    expect(getNodeMetadata(Passthrough).is_trigger).toBeUndefined();
  });
});

describe("kernel trigger_event entry point", () => {
  beforeEach(() => {
    FakeTriggerNode.reset();
  });

  it("(b) a matching trigger_event calls emitTriggerEvent once and skips genProcess", async () => {
    const ctx = new ProcessingContext({ jobId: "trigger-job" });
    const runner = makeRunner(makeRegistry(), ctx);

    const result = await runner.run(
      {
        job_id: "trigger-job",
        trigger_event: {
          node_id: "trigger",
          input_id: "i1",
          payload: { value: 42, label: "hello", ignored: "x" }
        }
      },
      triggerGraph()
    );

    expect(result.status).toBe("completed");
    expect(FakeTriggerNode.emitCalls).toBe(1);
    expect(FakeTriggerNode.genProcessEntered).toBe(false);
    // Payload flowed onto the declared "value" slot → downstream Passthrough.
    expect(result.outputs["sink"]).toContain(42);
  });

  it("(c) no trigger_event falls through to the streaming genProcess path", async () => {
    const ctx = new ProcessingContext({ jobId: "trigger-job" });
    const runner = makeRunner(makeRegistry(), ctx);

    const result = await runner.run(
      { job_id: "trigger-job" },
      triggerGraph()
    );

    expect(result.status).toBe("completed");
    expect(FakeTriggerNode.emitCalls).toBe(0);
    expect(FakeTriggerNode.genProcessEntered).toBe(true);
    expect(result.outputs["sink"]).toContain("live");
  });

  it("(d) a trigger_event for a different node leaves this node on the normal path", async () => {
    const ctx = new ProcessingContext({ jobId: "trigger-job" });
    const runner = makeRunner(makeRegistry(), ctx);

    const result = await runner.run(
      {
        job_id: "trigger-job",
        trigger_event: {
          node_id: "some-other-node",
          input_id: "i2",
          payload: { value: 99 }
        }
      },
      triggerGraph()
    );

    expect(result.status).toBe("completed");
    expect(FakeTriggerNode.emitCalls).toBe(0);
    expect(FakeTriggerNode.genProcessEntered).toBe(true);
    expect(result.outputs["sink"]).toContain("live");
  });
});
