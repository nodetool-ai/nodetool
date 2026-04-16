import { describe, expect, it } from "vitest";
import { WorkflowRunner } from "@nodetool/kernel";
import { NodeRegistry } from "@nodetool/node-sdk";
import type { Edge, NodeDescriptor } from "@nodetool/protocol";
import {
  registerBaseNodes,
  CollectNode,
  ForEachNode,
  IfNode,
  OutputNode,
  RerouteNode
} from "../src/index.js";

function makeRegistry(): NodeRegistry {
  const registry = new NodeRegistry();
  registerBaseNodes(registry);
  return registry;
}

function makeRunner(registry: NodeRegistry): WorkflowRunner {
  return new WorkflowRunner("control-parity", {
    resolveExecutor: (node) => {
      if (!registry.has(node.type)) {
        return {
          async process() {
            return {};
          }
        };
      }
      return registry.resolve(node);
    }
  });
}

async function runWorkflow(
  nodes: NodeDescriptor[],
  edges: Edge[],
  params: Record<string, unknown> = {}
) {
  return makeRunner(makeRegistry()).run(
    { job_id: `control-parity-${Date.now()}`, params },
    { nodes, edges }
  );
}

async function runWithRunner(
  runner: WorkflowRunner,
  nodes: NodeDescriptor[],
  edges: Edge[],
  params: Record<string, unknown> = {}
) {
  return runner.run(
    { job_id: `control-parity-${Date.now()}`, params },
    { nodes, edges }
  );
}

function outputUpdatesForNode(
  result: Awaited<ReturnType<typeof runWorkflow>>,
  nodeId: string
): unknown[] {
  return result.messages
    .filter(
      (message) =>
        message.type === "output_update" && message.node_id === nodeId
    )
    .map((message) => message.value);
}

describe("control parity: If node", () => {
  it("routes static true input to the true sink and leaves the false sink null", async () => {
    const result = await runWorkflow(
      [
        { id: "src", type: "test.Input", name: "value" },
        { id: "if", type: IfNode.nodeType, properties: { condition: true } },
        { id: "true", type: OutputNode.nodeType, name: "true_sink" },
        { id: "false", type: OutputNode.nodeType, name: "false_sink" }
      ],
      [
        {
          source: "src",
          sourceHandle: "value",
          target: "if",
          targetHandle: "value"
        },
        {
          source: "if",
          sourceHandle: "if_true",
          target: "true",
          targetHandle: "value"
        },
        {
          source: "if",
          sourceHandle: "if_false",
          target: "false",
          targetHandle: "value"
        }
      ],
      { value: "hello" }
    );

    expect(result.status).toBe("completed");
    expect(result.outputs.true_sink).toEqual(["hello"]);
    expect(result.outputs.false_sink).toEqual([null]);
  });

  it("routes static false input to the false sink and leaves the true sink null", async () => {
    const result = await runWorkflow(
      [
        { id: "src", type: "test.Input", name: "value" },
        { id: "if", type: IfNode.nodeType, properties: { condition: false } },
        { id: "true", type: OutputNode.nodeType, name: "true_sink" },
        { id: "false", type: OutputNode.nodeType, name: "false_sink" }
      ],
      [
        {
          source: "src",
          sourceHandle: "value",
          target: "if",
          targetHandle: "value"
        },
        {
          source: "if",
          sourceHandle: "if_true",
          target: "true",
          targetHandle: "value"
        },
        {
          source: "if",
          sourceHandle: "if_false",
          target: "false",
          targetHandle: "value"
        }
      ],
      { value: "hello" }
    );

    expect(result.status).toBe("completed");
    expect(result.outputs.true_sink).toEqual([null]);
    expect(result.outputs.false_sink).toEqual(["hello"]);
  });

  it("passes an entire generated stream through the true branch", async () => {
    const result = await runWorkflow(
      [
        {
          id: "src",
          type: ForEachNode.nodeType,
          is_streaming_output: true,
          properties: { input_list: [0, 1, 2] }
        },
        { id: "if", type: IfNode.nodeType, is_streaming_output: true, sync_mode: "on_any" as const, properties: { condition: true } },
        { id: "collect", type: CollectNode.nodeType, is_streaming_input: true },
        { id: "out", type: OutputNode.nodeType, name: "passed" }
      ],
      [
        {
          source: "src",
          sourceHandle: "output",
          target: "if",
          targetHandle: "value"
        },
        {
          source: "if",
          sourceHandle: "if_true",
          target: "collect",
          targetHandle: "input_item"
        },
        {
          source: "collect",
          sourceHandle: "output",
          target: "out",
          targetHandle: "value"
        }
      ]
    );

    expect(result.status).toBe("completed");
    expect(result.outputs.passed).toEqual([[0, 1, 2]]);
  });

  it("zips condition and value streams and routes each item to the matching branch", async () => {
    const result = await runWorkflow(
      [
        {
          id: "cond",
          type: ForEachNode.nodeType,
          is_streaming_output: true,
          properties: { input_list: [true, true, false] }
        },
        {
          id: "val",
          type: ForEachNode.nodeType,
          is_streaming_output: true,
          properties: { input_list: ["A", "B", "C"] }
        },
        { id: "if", type: IfNode.nodeType, sync_mode: "zip_all" },
        { id: "true_out", type: OutputNode.nodeType, name: "true_sink" },
        { id: "false_out", type: OutputNode.nodeType, name: "false_sink" }
      ],
      [
        {
          source: "cond",
          sourceHandle: "output",
          target: "if",
          targetHandle: "condition"
        },
        {
          source: "val",
          sourceHandle: "output",
          target: "if",
          targetHandle: "value"
        },
        {
          source: "if",
          sourceHandle: "if_true",
          target: "true_out",
          targetHandle: "value"
        },
        {
          source: "if",
          sourceHandle: "if_false",
          target: "false_out",
          targetHandle: "value"
        }
      ]
    );

    const trueValues = outputUpdatesForNode(result, "true_out");
    const falseValues = outputUpdatesForNode(result, "false_out");

    expect(result.status).toBe("completed");
    expect(trueValues).toEqual(["A", "B", null]);
    expect(falseValues).toEqual([null, null, "C"]);
  });

  it("reuses the last condition for unmatched trailing values when zip_all lengths differ", async () => {
    const result = await runWorkflow(
      [
        {
          id: "cond",
          type: ForEachNode.nodeType,
          is_streaming_output: true,
          properties: { input_list: [true, false] }
        },
        {
          id: "val",
          type: ForEachNode.nodeType,
          is_streaming_output: true,
          properties: { input_list: ["A", "B", "C"] }
        },
        { id: "if", type: IfNode.nodeType, sync_mode: "zip_all" },
        { id: "true_out", type: OutputNode.nodeType, name: "true_sink" },
        { id: "false_out", type: OutputNode.nodeType, name: "false_sink" }
      ],
      [
        {
          source: "cond",
          sourceHandle: "output",
          target: "if",
          targetHandle: "condition"
        },
        {
          source: "val",
          sourceHandle: "output",
          target: "if",
          targetHandle: "value"
        },
        {
          source: "if",
          sourceHandle: "if_true",
          target: "true_out",
          targetHandle: "value"
        },
        {
          source: "if",
          sourceHandle: "if_false",
          target: "false_out",
          targetHandle: "value"
        }
      ]
    );

    expect(result.status).toBe("completed");
    expect(outputUpdatesForNode(result, "true_out")).toEqual(["A", null, null]);
    expect(outputUpdatesForNode(result, "false_out")).toEqual([null, "B", "C"]);
  });
});

describe("control parity: Collect node", () => {
  it("aggregates a generated stream into one final list", async () => {
    const result = await runWorkflow(
      [
        {
          id: "src",
          type: ForEachNode.nodeType,
          is_streaming_output: true,
          properties: { input_list: [0, 1, 2] }
        },
        { id: "collect", type: CollectNode.nodeType, is_streaming_input: true },
        { id: "out", type: OutputNode.nodeType, name: "items" }
      ],
      [
        {
          source: "src",
          sourceHandle: "output",
          target: "collect",
          targetHandle: "input_item"
        },
        {
          source: "collect",
          sourceHandle: "output",
          target: "out",
          targetHandle: "value"
        }
      ]
    );

    expect(result.status).toBe("completed");
    expect(result.outputs.items).toEqual([[0, 1, 2]]);
  });

  it("emits an empty list for an empty stream", async () => {
    const result = await runWorkflow(
      [
        { id: "collect", type: CollectNode.nodeType, is_streaming_input: true },
        { id: "out", type: OutputNode.nodeType, name: "items" }
      ],
      [
        {
          source: "collect",
          sourceHandle: "output",
          target: "out",
          targetHandle: "value"
        }
      ]
    );

    expect(result.status).toBe("completed");
    expect(result.outputs.items).toEqual([[]]);
  });

  it("resets collected state across separate workflow runs on the same runner", async () => {
    const runner = makeRunner(makeRegistry());
    const nodes: NodeDescriptor[] = [
      {
        id: "src",
        type: ForEachNode.nodeType,
        is_streaming_output: true,
        properties: { input_list: [0, 1] }
      },
      { id: "collect", type: CollectNode.nodeType, is_streaming_input: true },
      { id: "out", type: OutputNode.nodeType, name: "items" }
    ];
    const edges: Edge[] = [
      {
        source: "src",
        sourceHandle: "output",
        target: "collect",
        targetHandle: "input_item"
      },
      {
        source: "collect",
        sourceHandle: "output",
        target: "out",
        targetHandle: "value"
      }
    ];

    const first = await runWithRunner(runner, nodes, edges);
    const firstItems = structuredClone(first.outputs.items);
    const second = await runWithRunner(
      runner,
      [
        {
          ...nodes[0],
          properties: { input_list: [3, 4] }
        },
        nodes[1],
        nodes[2]
      ],
      edges
    );

    expect(first.status).toBe("completed");
    expect(firstItems).toEqual([[0, 1]]);
    expect(second.status).toBe("completed");
    expect(outputUpdatesForNode(second, "out").at(-1)).toEqual([3, 4]);
    expect(second.outputs.items.at(-1)).toEqual([3, 4]);
  });
});

describe("control parity: Reroute node", () => {
  it("passes an entire generated stream through unchanged", async () => {
    const result = await runWorkflow(
      [
        {
          id: "src",
          type: ForEachNode.nodeType,
          is_streaming_output: true,
          properties: { input_list: [0, 1, 2] }
        },
        { id: "reroute", type: RerouteNode.nodeType, is_streaming_output: true, sync_mode: "on_any" as const },
        { id: "collect", type: CollectNode.nodeType, is_streaming_input: true },
        { id: "out", type: OutputNode.nodeType, name: "items" }
      ],
      [
        {
          source: "src",
          sourceHandle: "output",
          target: "reroute",
          targetHandle: "input_value"
        },
        {
          source: "reroute",
          sourceHandle: "output",
          target: "collect",
          targetHandle: "input_item"
        },
        {
          source: "collect",
          sourceHandle: "output",
          target: "out",
          targetHandle: "value"
        }
      ]
    );

    expect(result.status).toBe("completed");
    expect(result.outputs.items).toEqual([[0, 1, 2]]);
  });
});
