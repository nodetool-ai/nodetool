import { describe, it, expect } from "vitest";
import { WorkflowRunner } from "@nodetool-ai/kernel";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import { ProcessingContext } from "@nodetool-ai/runtime";
import type { NodeDescriptor, Edge } from "@nodetool-ai/protocol";
import { registerBaseNodes, RerouteNode } from "../src/index.js";

function makeRegistry(): NodeRegistry {
  const registry = new NodeRegistry();
  registerBaseNodes(registry);
  return registry;
}

function makeRunner(registry: NodeRegistry, jobId: string): WorkflowRunner {
  return new WorkflowRunner(jobId, {
    executionContext: new ProcessingContext({ jobId }),
    resolveExecutor: (node) => {
      if (!registry.has(node.type)) {
        return {
          async process(inputs: Record<string, unknown>) {
            return inputs;
          }
        };
      }
      return registry.resolve(node);
    }
  });
}

// Get Variable is a streaming-output source; in a real graph these descriptor
// fields are hydrated from the node class metadata.
const getVariable = (id: string, name: string): NodeDescriptor =>
  ({
    id,
    type: "nodetool.variable.GetVariable",
    properties: { name },
    is_streaming_output: true,
    output_correlation: {
      output: { kind: "iteration", source: "__execution__", group: "channel" }
    }
  }) as unknown as NodeDescriptor;

describe("integration: variable channels (no ordering edge needed)", () => {
  it("a Get Variable reads what a Set Variable publishes, with no edge between them", async () => {
    const nodes: NodeDescriptor[] = [
      {
        id: "set",
        type: "nodetool.variable.SetVariable",
        properties: { name: "subject", value: "a dragon" }
      },
      getVariable("get", "subject"),
      { id: "sink", type: RerouteNode.nodeType, name: "got" }
    ];
    // The only edge wires Get → sink; the channel orders set-before-read.
    const edges: Edge[] = [
      {
        source: "get",
        sourceHandle: "output",
        target: "sink",
        targetHandle: "input_value"
      }
    ];

    const result = await makeRunner(makeRegistry(), "vc-get").run(
      { job_id: "vc-get", params: {} },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    expect(result.outputs.got).toContain("a dragon");
  });

  it("a Prompt resolves {{ name }} from a channel, with no edge to the setter", async () => {
    const nodes: NodeDescriptor[] = [
      {
        id: "set",
        type: "nodetool.variable.SetVariable",
        properties: { name: "subject", value: "a dragon" }
      },
      {
        id: "prompt",
        type: "nodetool.text.Prompt",
        properties: { prompt: "Describe {{ subject }} in detail" }
      },
      { id: "sink", type: RerouteNode.nodeType, name: "rendered" }
    ];
    const edges: Edge[] = [
      {
        source: "prompt",
        sourceHandle: "output",
        target: "sink",
        targetHandle: "input_value"
      }
    ];

    const result = await makeRunner(makeRegistry(), "vc-prompt").run(
      { job_id: "vc-prompt", params: {} },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    expect(result.outputs.rendered).toContain("Describe a dragon in detail");
  });

  it("a Get Variable for an unset name emits nothing and completes (no hang)", async () => {
    const nodes: NodeDescriptor[] = [
      getVariable("get", "nobody"),
      { id: "sink", type: RerouteNode.nodeType, name: "got" }
    ];
    const edges: Edge[] = [
      {
        source: "get",
        sourceHandle: "output",
        target: "sink",
        targetHandle: "input_value"
      }
    ];

    const result = await makeRunner(makeRegistry(), "vc-empty").run(
      { job_id: "vc-empty", params: {} },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
  });
});
