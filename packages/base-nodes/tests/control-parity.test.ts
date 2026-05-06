import { describe, expect, it } from "vitest";
import { WorkflowRunner } from "@nodetool-ai/kernel";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { Edge, NodeDescriptor } from "@nodetool-ai/protocol";
import {
  registerBaseNodes,
  ChunkNode,
  CollectNode,
  CountStreamNode,
  DistinctNode,
  DropNode,
  DropWhileNode,
  FilterCodeNode,
  FilterEqualNode,
  ForEachNode,
  IfNode,
  LastNode,
  OutputNode,
  RerouteNode,
  TakeNode,
  TakeWhileNode,
  TapNode
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

  it("zip_all halts when one streaming input EOSs early and drops unmatched trailing values", async () => {
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
    // After cond EOSs (2 items) and val has C left, zip_all stops.
    // Use sync_mode: "on_any" if you want broadcast/fan-out semantics.
    expect(outputUpdatesForNode(result, "true_out")).toEqual(["A", null]);
    expect(outputUpdatesForNode(result, "false_out")).toEqual([null, "B"]);
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

  it("ForEach respects the limit prop and stops emitting after N items", async () => {
    const result = await runWorkflow(
      [
        {
          id: "src",
          type: ForEachNode.nodeType,
          is_streaming_output: true,
          properties: { input_list: [10, 20, 30, 40, 50], limit: 2 }
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
    expect(result.outputs.items).toEqual([[10, 20]]);
  });

  it("Drop skips the first N stream items and forwards the rest", async () => {
    const result = await runWorkflow(
      [
        {
          id: "src",
          type: ForEachNode.nodeType,
          is_streaming_output: true,
          properties: { input_list: ["a", "b", "c", "d"] }
        },
        {
          id: "drop",
          type: DropNode.nodeType,
          is_streaming_input: true,
          is_streaming_output: true,
          properties: { n: 2 }
        },
        { id: "collect", type: CollectNode.nodeType, is_streaming_input: true },
        { id: "out", type: OutputNode.nodeType, name: "rest" }
      ],
      [
        {
          source: "src",
          sourceHandle: "output",
          target: "drop",
          targetHandle: "input_item"
        },
        {
          source: "drop",
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
    expect(result.outputs.rest).toEqual([["c", "d"]]);
  });

  it("FilterEqual passes only items equal to the target value", async () => {
    const result = await runWorkflow(
      [
        {
          id: "src",
          type: ForEachNode.nodeType,
          is_streaming_output: true,
          properties: { input_list: [1, 2, 1, 3, 1] }
        },
        {
          id: "f",
          type: FilterEqualNode.nodeType,
          is_streaming_input: true,
          is_streaming_output: true,
          properties: { value: 1 }
        },
        { id: "collect", type: CollectNode.nodeType, is_streaming_input: true },
        { id: "out", type: OutputNode.nodeType, name: "kept" }
      ],
      [
        {
          source: "src",
          sourceHandle: "output",
          target: "f",
          targetHandle: "input_item"
        },
        {
          source: "f",
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
    expect(result.outputs.kept).toEqual([[1, 1, 1]]);
  });

  it("FilterCode evaluates a JS predicate per item", async () => {
    const result = await runWorkflow(
      [
        {
          id: "src",
          type: ForEachNode.nodeType,
          is_streaming_output: true,
          properties: { input_list: [1, 2, 3, 4, 5] }
        },
        {
          id: "f",
          type: FilterCodeNode.nodeType,
          is_streaming_input: true,
          is_streaming_output: true,
          properties: { predicate: "item % 2 === 0" }
        },
        { id: "collect", type: CollectNode.nodeType, is_streaming_input: true },
        { id: "out", type: OutputNode.nodeType, name: "evens" }
      ],
      [
        {
          source: "src",
          sourceHandle: "output",
          target: "f",
          targetHandle: "input_item"
        },
        {
          source: "f",
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
    expect(result.outputs.evens).toEqual([[2, 4]]);
  });

  it("Chunk groups items into batches of size N including a trailing partial", async () => {
    const result = await runWorkflow(
      [
        {
          id: "src",
          type: ForEachNode.nodeType,
          is_streaming_output: true,
          properties: { input_list: [1, 2, 3, 4, 5] }
        },
        {
          id: "chunk",
          type: ChunkNode.nodeType,
          is_streaming_input: true,
          is_streaming_output: true,
          properties: { size: 2 }
        },
        { id: "collect", type: CollectNode.nodeType, is_streaming_input: true },
        { id: "out", type: OutputNode.nodeType, name: "batches" }
      ],
      [
        {
          source: "src",
          sourceHandle: "output",
          target: "chunk",
          targetHandle: "input_item"
        },
        {
          source: "chunk",
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
    expect(result.outputs.batches).toEqual([[[1, 2], [3, 4], [5]]]);
  });

  it("Last emits only the final stream item", async () => {
    const result = await runWorkflow(
      [
        {
          id: "src",
          type: ForEachNode.nodeType,
          is_streaming_output: true,
          properties: { input_list: ["a", "b", "c"] }
        },
        {
          id: "last",
          type: LastNode.nodeType,
          is_streaming_input: true
        },
        { id: "out", type: OutputNode.nodeType, name: "final" }
      ],
      [
        {
          source: "src",
          sourceHandle: "output",
          target: "last",
          targetHandle: "input_item"
        },
        {
          source: "last",
          sourceHandle: "output",
          target: "out",
          targetHandle: "value"
        }
      ]
    );

    expect(result.status).toBe("completed");
    expect(result.outputs.final).toEqual(["c"]);
  });

  it("Count emits the total number of stream items", async () => {
    const result = await runWorkflow(
      [
        {
          id: "src",
          type: ForEachNode.nodeType,
          is_streaming_output: true,
          properties: { input_list: [10, 20, 30, 40] }
        },
        {
          id: "count",
          type: CountStreamNode.nodeType,
          is_streaming_input: true
        },
        { id: "out", type: OutputNode.nodeType, name: "total" }
      ],
      [
        {
          source: "src",
          sourceHandle: "output",
          target: "count",
          targetHandle: "input_item"
        },
        {
          source: "count",
          sourceHandle: "output",
          target: "out",
          targetHandle: "value"
        }
      ]
    );

    expect(result.status).toBe("completed");
    expect(result.outputs.total).toEqual([4]);
  });

  it("Distinct drops duplicates by value", async () => {
    const result = await runWorkflow(
      [
        {
          id: "src",
          type: ForEachNode.nodeType,
          is_streaming_output: true,
          properties: { input_list: [1, 2, 2, 3, 1, 3, 4] }
        },
        {
          id: "d",
          type: DistinctNode.nodeType,
          is_streaming_input: true,
          is_streaming_output: true
        },
        { id: "collect", type: CollectNode.nodeType, is_streaming_input: true },
        { id: "out", type: OutputNode.nodeType, name: "uniq" }
      ],
      [
        {
          source: "src",
          sourceHandle: "output",
          target: "d",
          targetHandle: "input_item"
        },
        {
          source: "d",
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
    expect(result.outputs.uniq).toEqual([[1, 2, 3, 4]]);
  });

  it("Distinct uses an optional key expression", async () => {
    const result = await runWorkflow(
      [
        {
          id: "src",
          type: ForEachNode.nodeType,
          is_streaming_output: true,
          properties: {
            input_list: [
              { id: 1, x: "a" },
              { id: 2, x: "b" },
              { id: 1, x: "c" },
              { id: 3, x: "d" }
            ]
          }
        },
        {
          id: "d",
          type: DistinctNode.nodeType,
          is_streaming_input: true,
          is_streaming_output: true,
          properties: { key: "item.id" }
        },
        { id: "collect", type: CollectNode.nodeType, is_streaming_input: true },
        { id: "out", type: OutputNode.nodeType, name: "uniq" }
      ],
      [
        {
          source: "src",
          sourceHandle: "output",
          target: "d",
          targetHandle: "input_item"
        },
        {
          source: "d",
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
    expect(result.outputs.uniq).toEqual([
      [
        { id: 1, x: "a" },
        { id: 2, x: "b" },
        { id: 3, x: "d" }
      ]
    ]);
  });

  it("TakeWhile passes a prefix and stops at the first failure", async () => {
    const result = await runWorkflow(
      [
        {
          id: "src",
          type: ForEachNode.nodeType,
          is_streaming_output: true,
          properties: { input_list: [1, 2, 3, 1, 4] }
        },
        {
          id: "tw",
          type: TakeWhileNode.nodeType,
          is_streaming_input: true,
          is_streaming_output: true,
          properties: { predicate: "item < 3" }
        },
        { id: "collect", type: CollectNode.nodeType, is_streaming_input: true },
        { id: "out", type: OutputNode.nodeType, name: "prefix" }
      ],
      [
        {
          source: "src",
          sourceHandle: "output",
          target: "tw",
          targetHandle: "input_item"
        },
        {
          source: "tw",
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
    expect(result.outputs.prefix).toEqual([[1, 2]]);
  });

  it("DropWhile drops a leading run and forwards the suffix", async () => {
    const result = await runWorkflow(
      [
        {
          id: "src",
          type: ForEachNode.nodeType,
          is_streaming_output: true,
          properties: { input_list: [0, 0, 1, 0, 2] }
        },
        {
          id: "dw",
          type: DropWhileNode.nodeType,
          is_streaming_input: true,
          is_streaming_output: true,
          properties: { predicate: "item === 0" }
        },
        { id: "collect", type: CollectNode.nodeType, is_streaming_input: true },
        { id: "out", type: OutputNode.nodeType, name: "suffix" }
      ],
      [
        {
          source: "src",
          sourceHandle: "output",
          target: "dw",
          targetHandle: "input_item"
        },
        {
          source: "dw",
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
    expect(result.outputs.suffix).toEqual([[1, 0, 2]]);
  });

  it("Tap forwards each item unchanged while logging", async () => {
    const logs: unknown[] = [];
    const original = console.log;
    console.log = (..._args: unknown[]) => {
      logs.push(_args);
    };
    try {
      const result = await runWorkflow(
        [
          {
            id: "src",
            type: ForEachNode.nodeType,
            is_streaming_output: true,
            properties: { input_list: ["a", "b"] }
          },
          {
            id: "tap",
            type: TapNode.nodeType,
            is_streaming_input: true,
            is_streaming_output: true,
            properties: { label: "trace" }
          },
          { id: "collect", type: CollectNode.nodeType, is_streaming_input: true },
          { id: "out", type: OutputNode.nodeType, name: "passed" }
        ],
        [
          {
            source: "src",
            sourceHandle: "output",
            target: "tap",
            targetHandle: "input_item"
          },
          {
            source: "tap",
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
      expect(result.outputs.passed).toEqual([["a", "b"]]);
      expect(logs.length).toBe(2);
    } finally {
      console.log = original;
    }
  });

  it("Take forwards the first N stream items and stops", async () => {
    const result = await runWorkflow(
      [
        {
          id: "src",
          type: ForEachNode.nodeType,
          is_streaming_output: true,
          properties: { input_list: ["a", "b", "c", "d"] }
        },
        {
          id: "take",
          type: TakeNode.nodeType,
          is_streaming_input: true,
          is_streaming_output: true,
          properties: { n: 2 }
        },
        { id: "collect", type: CollectNode.nodeType, is_streaming_input: true },
        { id: "out", type: OutputNode.nodeType, name: "taken" }
      ],
      [
        {
          source: "src",
          sourceHandle: "output",
          target: "take",
          targetHandle: "input_item"
        },
        {
          source: "take",
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
    expect(result.outputs.taken).toEqual([["a", "b"]]);
  });
});
