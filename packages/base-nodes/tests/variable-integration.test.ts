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
    // The shared context is what Set/Get Variable read & write; every
    // production runner path supplies one (websocket server, CLI, browser).
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

describe("integration: Set/Get Variable + Prompt over the shared context", () => {
  it("a downstream Get Variable reads what an upstream Set Variable wrote", async () => {
    const nodes: NodeDescriptor[] = [
      {
        id: "set",
        type: "nodetool.variable.SetVariable",
        properties: { name: "subject", value: "a dragon" }
      },
      {
        id: "get",
        type: "nodetool.variable.GetVariable",
        properties: { name: "subject" }
      },
      { id: "sink", type: RerouteNode.nodeType, name: "got" }
    ];
    const edges: Edge[] = [
      // ordering edge: Get Variable runs after Set Variable
      {
        source: "set",
        sourceHandle: "output",
        target: "get",
        targetHandle: "trigger"
      },
      {
        source: "get",
        sourceHandle: "output",
        target: "sink",
        targetHandle: "input_value"
      }
    ];

    const result = await makeRunner(makeRegistry(), "var-get-1").run(
      { job_id: "var-get-1", params: {} },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    expect(result.outputs.got).toContain("a dragon");
  });

  it("a downstream Prompt resolves {{ name }} from the shared context", async () => {
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
      // ordering-only edge into an unreferenced dynamic input so the Prompt
      // runs after the variable is set; {{ subject }} still resolves from the
      // shared context rather than this edge's value.
      {
        source: "set",
        sourceHandle: "output",
        target: "prompt",
        targetHandle: "_order"
      },
      {
        source: "prompt",
        sourceHandle: "output",
        target: "sink",
        targetHandle: "input_value"
      }
    ];

    const result = await makeRunner(makeRegistry(), "var-prompt-1").run(
      { job_id: "var-prompt-1", params: {} },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    expect(result.outputs.rendered).toContain("Describe a dragon in detail");
  });
});
