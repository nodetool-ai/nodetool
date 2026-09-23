/**
 * The Loop node through the real registry, hydration, and runner
 * (docs/workflow-loops.md).
 */

import { describe, expect, it } from "vitest";
import { Graph, WorkflowRunner } from "@nodetool-ai/kernel";
import {
  BaseNode,
  NodeRegistry,
  createGraphNodeTypeResolver,
  prop
} from "@nodetool-ai/node-sdk";
import type { Edge, NodeDescriptor } from "@nodetool-ai/protocol";
import { LOOP_NODE_TYPE } from "@nodetool-ai/protocol";
import { DecisionNode, registerBaseNodes } from "@nodetool-ai/base-nodes";
import { FakeProvider, ProcessingContext } from "@nodetool-ai/runtime";
import {
  CollectNode,
  ForEachNode,
  IfNode,
  LoopNode
} from "@nodetool-ai/core-nodes";

class IncrementNode extends BaseNode {
  static readonly nodeType = "test.loop.Increment";
  static readonly description = "Add one and report whether the result is below a limit.";
  static readonly metadataOutputTypes = { output: "int", below: "bool" };

  @prop({ type: "int", default: 0 })
  declare value: number;

  @prop({ type: "int", default: 3 })
  declare limit: number;

  async process(): Promise<Record<string, unknown>> {
    const output = Number(this.value) + 1;
    return { output, below: output < Number(this.limit) };
  }
}

class RecordNode extends BaseNode {
  static readonly nodeType = "test.loop.Record";
  static readonly description = "Record every value it receives.";

  @prop({ type: "any", default: null })
  declare value: unknown;

  async process(): Promise<Record<string, unknown>> {
    recorded.push(this.value);
    return {};
  }
}

let recorded: unknown[] = [];

async function runHydrated(
  nodes: NodeDescriptor[],
  edges: Edge[],
  executionContext?: ProcessingContext
) {
  recorded = [];
  const registry = new NodeRegistry();
  registerBaseNodes(registry);
  registry.register(IncrementNode);
  registry.register(RecordNode);
  const graph = await Graph.loadFromDict(
    { nodes, edges },
    { resolver: createGraphNodeTypeResolver(registry) }
  );
  const runner = new WorkflowRunner("loop-node", {
    resolveExecutor: (node) => registry.resolve(node),
    executionContext
  });
  return runner.run(
    { job_id: "loop-node" },
    {
      nodes: [...graph.nodes] as NodeDescriptor[],
      edges: [...graph.edges] as Edge[]
    }
  );
}

function edge(source: string, sh: string, target: string, th: string): Edge {
  return { source, sourceHandle: sh, target, targetHandle: th };
}

describe("LoopNode", () => {
  it("is the node type the kernel runs as a loop", () => {
    expect(LoopNode.nodeType).toBe(LOOP_NODE_TYPE);
  });

  it("counts up until the condition turns false", async () => {
    const result = await runHydrated(
      [
        { id: "loop", type: LoopNode.nodeType, properties: { initial: 0 } },
        { id: "inc", type: IncrementNode.nodeType, properties: { limit: 4 } },
        { id: "rec", type: RecordNode.nodeType }
      ],
      [
        edge("loop", "value", "inc", "value"),
        edge("inc", "output", "loop", "next"),
        edge("inc", "below", "loop", "condition"),
        edge("loop", "done", "rec", "value")
      ]
    );
    expect(result.status).toBe("completed");
    expect(recorded).toEqual([4]);
  });

  it("runs one independent loop per ForEach item", async () => {
    const result = await runHydrated(
      [
        {
          id: "items",
          type: ForEachNode.nodeType,
          properties: { input_list: [0, 10, 20] }
        },
        { id: "loop", type: LoopNode.nodeType, properties: { max_iterations: 3 } },
        { id: "inc", type: IncrementNode.nodeType, properties: { limit: 1000 } },
        { id: "rec", type: RecordNode.nodeType }
      ],
      [
        edge("items", "output", "loop", "initial"),
        edge("loop", "value", "inc", "value"),
        edge("inc", "output", "loop", "next"),
        edge("loop", "done", "rec", "value")
      ]
    );
    expect(result.status).toBe("completed");
    expect([...recorded].sort((a, b) => Number(a) - Number(b))).toEqual([
      3, 13, 23
    ]);
  });

  it("exits through an If inside the body and collects every iteration outside it", async () => {
    const result = await runHydrated(
      [
        { id: "loop", type: LoopNode.nodeType, properties: { initial: 0, max_iterations: 20 } },
        { id: "inc", type: IncrementNode.nodeType, properties: { limit: 3 } },
        { id: "gate", type: IfNode.nodeType },
        { id: "history", type: CollectNode.nodeType },
        { id: "rec", type: RecordNode.nodeType },
        { id: "hist", type: RecordNode.nodeType }
      ],
      [
        edge("loop", "value", "inc", "value"),
        edge("inc", "output", "gate", "value"),
        edge("inc", "below", "gate", "condition"),
        edge("gate", "if_true", "loop", "next"),
        edge("gate", "if_false", "rec", "value"),
        edge("loop", "value", "history", "input_item"),
        edge("history", "output", "hist", "value")
      ]
    );
    expect(result.status).toBe("completed");
    expect(recorded).toContainEqual(3);
    expect(recorded).toContainEqual([0, 1, 2]);
  });

  it("loops until a Decision node says the value needs no further step", async () => {
    const asked: number[] = [];
    // Answers "does the count still need another step?" with count < 3.
    const provider = new FakeProvider({
      customResponseFn: (messages) => {
        const user = messages.find((m) => m.role === "user");
        const text = typeof user?.content === "string" ? user.content : "";
        const count = Number(/<input name="value">\n(\d+)/.exec(text)?.[1]);
        asked.push(count);
        return [
          {
            id: `call-${count}`,
            name: "decision_result",
            args: { decision: count < 3, reason: `count is ${count}` }
          }
        ];
      }
    });
    const context = new ProcessingContext({ jobId: "loop-node" });
    context.registerProvider("fake", provider);

    const result = await runHydrated(
      [
        { id: "loop", type: LoopNode.nodeType, properties: { initial: 0 } },
        { id: "inc", type: IncrementNode.nodeType, properties: { limit: 1000 } },
        {
          id: "decide",
          type: DecisionNode.nodeType,
          properties: {
            prompt: "Does the count still need another step?",
            model: { type: "language_model", provider: "fake", id: "fake-model-v1" }
          }
        },
        { id: "rec", type: RecordNode.nodeType }
      ],
      [
        edge("loop", "value", "inc", "value"),
        edge("inc", "output", "loop", "next"),
        edge("inc", "output", "decide", "value"),
        edge("decide", "decision", "loop", "condition"),
        edge("loop", "done", "rec", "value")
      ],
      context
    );
    expect(result.status).toBe("completed");
    expect(asked).toEqual([1, 2, 3]);
    expect(recorded).toEqual([3]);
  });

  it("rejects a Collect inside the loop body", async () => {
    const result = await runHydrated(
      [
        { id: "loop", type: LoopNode.nodeType, properties: { initial: [1, 2] } },
        { id: "each", type: ForEachNode.nodeType },
        { id: "gather", type: CollectNode.nodeType }
      ],
      [
        edge("loop", "value", "each", "input_list"),
        edge("each", "output", "gather", "input_item"),
        edge("gather", "output", "loop", "next")
      ]
    );
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/aggregates a stream inside the body/);
  });
});
