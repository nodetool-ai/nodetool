import { describe, it, expect } from "vitest";
import { WorkflowRunner } from "@nodetool-ai/kernel";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { NodeDescriptor, Edge } from "@nodetool-ai/protocol";
import {
  registerBaseNodes,
  IfNode,
  ForEachNode,
  CollectNode,
  OutputNode,
  RerouteNode
} from "../src/index.js";

function makeRegistry(): NodeRegistry {
  const registry = new NodeRegistry();
  registerBaseNodes(registry);
  return registry;
}

function makeRunner(registry: NodeRegistry): WorkflowRunner {
  return new WorkflowRunner("test-job", {
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

describe("integration: If node with input source", () => {
  it("routes to true sink", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "src", type: "test.Input", name: "value" },
      { id: "if", type: IfNode.nodeType, properties: { condition: true } },
      { id: "sink", type: RerouteNode.nodeType, name: "out" }
    ];
    const edges: Edge[] = [
      {
        source: "src",
        sourceHandle: "value",
        target: "if",
        targetHandle: "value"
      },
      {
        source: "if",
        sourceHandle: "if_true",
        target: "sink",
        targetHandle: "input_value"
      }
    ];

    const result = await makeRunner(makeRegistry()).run(
      { job_id: "if-1", params: { value: "hello" } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    expect(result.outputs.out).toContain("hello");
  });
});

describe.skip("integration: ForEach node streaming output (ListRangeNode not available)", () => {
  it("collects all items from generated range", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "trigger", type: "test.Input", name: "start" },
      {
        id: "range",
        type: "nodetool.data.ListRange",
        properties: { stop: 4, step: 1 }
      },
      { id: "each", type: ForEachNode.nodeType, is_streaming_output: true },
      { id: "collect", type: CollectNode.nodeType },
      { id: "sink", type: OutputNode.nodeType, name: "values" }
    ];

    const edges: Edge[] = [
      {
        source: "trigger",
        sourceHandle: "value",
        target: "range",
        targetHandle: "start"
      },
      {
        source: "range",
        sourceHandle: "output",
        target: "each",
        targetHandle: "input_list"
      },
      {
        source: "each",
        sourceHandle: "output",
        target: "collect",
        targetHandle: "input_item"
      },
      {
        source: "collect",
        sourceHandle: "output",
        target: "sink",
        targetHandle: "value"
      }
    ];

    const result = await makeRunner(makeRegistry()).run(
      { job_id: "fe-1", params: { start: 1 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    expect(result.outputs.values).toEqual([[1, 2, 3]]);
  });
});

describe.skip("integration: GenerateSequence streaming output (GenerateSequenceNode not available)", () => {
  it("collects sequence values at the sink", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "trigger", type: "test.Input", name: "start" },
      {
        id: "seq",
        type: "nodetool.data.GenerateSequence",
        is_streaming_output: true,
        properties: { stop: 4, step: 1 }
      },
      { id: "collect", type: CollectNode.nodeType },
      { id: "sink", type: OutputNode.nodeType, name: "values" }
    ];
    const edges: Edge[] = [
      {
        source: "trigger",
        sourceHandle: "value",
        target: "seq",
        targetHandle: "start"
      },
      {
        source: "seq",
        sourceHandle: "output",
        target: "collect",
        targetHandle: "input_item"
      },
      {
        source: "collect",
        sourceHandle: "output",
        target: "sink",
        targetHandle: "value"
      }
    ];

    const result = await makeRunner(makeRegistry()).run(
      { job_id: "seq-1", params: { start: 1 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    expect(result.outputs.values).toEqual([[1, 2, 3]]);
  });
});
