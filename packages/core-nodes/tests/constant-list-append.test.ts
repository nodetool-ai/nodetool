import { describe, it, expect } from "vitest";
import { WorkflowRunner } from "@nodetool-ai/kernel";
import { NodeRegistry, getNodeMetadata } from "@nodetool-ai/node-sdk";
import type { NodeDescriptor, Edge } from "@nodetool-ai/protocol";
import {
  ConstantImageListNode,
  ConstantStringNode,
  ConstantTextListNode
} from "../src/nodes/constant.js";

const img = (uri: string) => ({ type: "image", uri });

async function runIntoSink(
  nodes: NodeDescriptor[],
  edges: Edge[]
): Promise<unknown[]> {
  const registry = new NodeRegistry();
  registry.register(ConstantImageListNode);
  registry.register(ConstantTextListNode);
  registry.register(ConstantStringNode);
  const received: unknown[] = [];
  const runner = new WorkflowRunner("test-job", {
    resolveExecutor: (node) =>
      node.type === "test.Sink"
        ? {
            async process(inputs) {
              received.push(inputs.value);
              return {};
            }
          }
        : registry.resolve(node)
  });
  const result = await runner.run(
    { job_id: "j", params: {} },
    { nodes: [...nodes, { id: "sink", type: "test.Sink" }], edges }
  );
  expect(result.status).toBe("completed");
  return received;
}

const toSink = (source: string): Edge => ({
  source,
  sourceHandle: "output",
  target: "sink",
  targetHandle: "value"
});

describe("list constants keep their static items when connected", () => {
  it("outputs the connected images followed by the static images", async () => {
    const received = await runIntoSink(
      [
        {
          id: "upstream",
          type: "nodetool.constant.ImageList",
          properties: { value: [img("a"), img("b")] }
        },
        {
          id: "list",
          type: "nodetool.constant.ImageList",
          properties: { value: [img("c"), img("d"), img("e")] }
        }
      ],
      [
        {
          source: "upstream",
          sourceHandle: "output",
          target: "list",
          targetHandle: "value"
        },
        toSink("list")
      ]
    );
    expect(received).toEqual([
      [img("a"), img("b"), img("c"), img("d"), img("e")]
    ]);
  });

  it("outputs only the static items when nothing is connected", async () => {
    const received = await runIntoSink(
      [
        {
          id: "list",
          type: "nodetool.constant.ImageList",
          properties: { value: [img("c")] }
        }
      ],
      [toSink("list")]
    );
    expect(received).toEqual([[img("c")]]);
  });

  it("appends static text after a single connected value", async () => {
    const received = await runIntoSink(
      [
        {
          id: "text",
          type: "nodetool.constant.String",
          properties: { value: "first" }
        },
        {
          id: "list",
          type: "nodetool.constant.TextList",
          properties: { value: ["second"] }
        }
      ],
      [
        {
          source: "text",
          sourceHandle: "output",
          target: "list",
          targetHandle: "value"
        },
        toSink("list")
      ]
    );
    expect(received).toEqual([["first", "second"]]);
  });

  it("publishes the opt-in in node metadata", () => {
    expect(getNodeMetadata(ConstantImageListNode).append_static_inputs).toEqual(
      ["value"]
    );
    expect(
      getNodeMetadata(ConstantStringNode).append_static_inputs
    ).toBeUndefined();
  });
});
