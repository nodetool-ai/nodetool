/**
 * End to end: an upstream generator streams into a Code node whose body keeps
 * a running total, through the real `WorkflowRunner`.
 *
 * The graph is hydrated against a registry that carries `CodeNode`, so this
 * also pins the per-instance flag path: nothing declares the node streaming —
 * `resolveStreamingInput` reads it out of the body.
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
import type { StreamingInputs } from "@nodetool-ai/runtime";
import { CodeNode } from "@nodetool-ai/code-nodes";

/** Values the sink saw, per run, in arrival order. */
const collected: unknown[] = [];

class NumbersNode extends BaseNode {
  static readonly nodeType = "test.stream.Numbers";
  static readonly description = "Emit three numbers, one at a time.";

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    for (const n of [1, 2, 3]) yield { output: n };
  }
}

/**
 * Records every value that arrives. Streaming-input, so each emitted value is
 * one item: a buffered consumer would keep only the last, because the Code
 * node's emits carry no iteration correlation of their own.
 */
class SinkNode extends BaseNode {
  static readonly nodeType = "test.stream.Sink";
  static readonly description = "Record every value it receives.";
  static readonly isStreamingInput = true;

  @prop({ type: "any", default: null, title: "Value" })
  declare value: unknown;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(inputs: StreamingInputs): Promise<void> {
    for await (const value of inputs.stream("value")) collected.push(value);
  }
}

const RUNNING_TOTAL = `let sum = 0;
for await (const n of stream("numbers")) {
  sum += n;
  await emit("running", sum);
}
await output("total", sum);`;

describe("Code node streaming input, end to end", () => {
  it(
    "sees each upstream item live and posts the final total",
    async () => {
      collected.length = 0;
      const registry = new NodeRegistry();
      registry.register(NumbersNode);
      registry.register(SinkNode);
      registry.register(CodeNode);

      const nodes: NodeDescriptor[] = [
        { id: "src", type: NumbersNode.nodeType, properties: {} },
        {
          id: "code",
          type: CodeNode.nodeType,
          properties: { code: RUNNING_TOTAL },
          dynamic_inputs: { numbers: "any" },
          dynamic_outputs: { running: "any", total: "any" }
        },
        { id: "running_sink", type: SinkNode.nodeType, properties: {} },
        { id: "total_sink", type: SinkNode.nodeType, properties: {} }
      ] as unknown as NodeDescriptor[];
      const edges: Edge[] = [
        {
          id: "e1",
          source: "src",
          sourceHandle: "output",
          target: "code",
          targetHandle: "numbers"
        },
        {
          id: "e2",
          source: "code",
          sourceHandle: "running",
          target: "running_sink",
          targetHandle: "value"
        },
        {
          id: "e3",
          source: "code",
          sourceHandle: "total",
          target: "total_sink",
          targetHandle: "value"
        }
      ] as unknown as Edge[];

      const graph = await Graph.loadFromDict(
        { nodes, edges },
        { resolver: createGraphNodeTypeResolver(registry) }
      );
      // Nothing on the node says "streaming"; the body did.
      expect(
        graph.nodes.find((node) => node.id === "code")?.is_streaming_input
      ).toBe(true);

      const runner = new WorkflowRunner("code-stream-e2e", {
        resolveExecutor: (node) => registry.resolve(node)
      });
      const result = await runner.run(
        { job_id: "code-stream-e2e" },
        {
          nodes: [...graph.nodes] as NodeDescriptor[],
          edges: [...graph.edges] as Edge[]
        }
      );

      expect(result.status).toBe("completed");
      // Three live partial sums, then the final total — one value per item,
      // which the buffered contract could not produce without a Collect node.
      expect(collected).toEqual([1, 3, 6, 6]);
    },
    60_000
  );
});
