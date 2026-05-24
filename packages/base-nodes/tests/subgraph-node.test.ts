import { describe, it, expect } from "vitest";
import { NodeRegistry, hasStreamingOutput } from "@nodetool-ai/node-sdk";
import type { NodeDescriptor } from "@nodetool-ai/protocol";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { registerBaseNodes, SubgraphNode } from "../src/index.js";

function makeRegistry(): NodeRegistry {
  const registry = new NodeRegistry();
  registerBaseNodes(registry);
  return registry;
}

function makeResolveExecutor(registry: NodeRegistry) {
  return (node: { id: string; type: string; [key: string]: unknown }) => {
    if (!registry.has(node.type)) {
      return {
        async process(inputs: Record<string, unknown>) {
          return inputs;
        }
      };
    }
    return registry.resolve(node as NodeDescriptor);
  };
}

function makeContext(registry: NodeRegistry): ProcessingContext {
  const ctx = new ProcessingContext({ jobId: "test-job" });
  ctx.setResolveExecutor(makeResolveExecutor(registry));
  return ctx;
}

// String passthrough: StringInput("text") -> Output("result")
function makeStringPassthroughGraph() {
  return {
    nodes: [
      {
        id: "inp1",
        type: "nodetool.input.StringInput",
        data: { name: "text", value: "default_value" }
      },
      {
        id: "out1",
        type: "nodetool.output.Output",
        data: { name: "result", value: "" }
      }
    ],
    edges: [
      {
        source: "inp1",
        sourceHandle: "output",
        target: "out1",
        targetHandle: "value"
      }
    ]
  };
}

describe("SubgraphNode", () => {
  it("is registered with the correct node type", () => {
    const registry = makeRegistry();
    expect(registry.has("nodetool.workflows.subgraph.Subgraph")).toBe(true);
  });

  it("has correct static properties", () => {
    expect(SubgraphNode.nodeType).toBe("nodetool.workflows.subgraph.Subgraph");
    expect(SubgraphNode.isDynamic).toBe(true);
    expect(hasStreamingOutput(SubgraphNode)).toBe(true);
  });

  it("returns empty output when graph is empty", async () => {
    const registry = makeRegistry();
    const ctx = makeContext(registry);
    const node = new SubgraphNode({ graph: { nodes: [], edges: [] } });
    const result = await node.process(ctx);
    expect(result).toEqual({});
  });

  it("throws when no resolveExecutor on context", async () => {
    const ctx = new ProcessingContext({ jobId: "test" });
    const node = new SubgraphNode({ graph: makeStringPassthroughGraph() });
    await expect(node.process(ctx)).rejects.toThrow("resolveExecutor");
  });

  it("passes default value through when no dynamic input provided", async () => {
    const registry = makeRegistry();
    const ctx = makeContext(registry);
    const node = new SubgraphNode({ graph: makeStringPassthroughGraph() });
    const result = await node.process(ctx);

    const values = Object.values(result);
    expect(values.length).toBeGreaterThan(0);
    const hasDefault = values.some(
      (v) =>
        v === "default_value" ||
        JSON.stringify(v).includes("default_value")
    );
    expect(hasDefault).toBe(true);
  });

  it("overrides input value via dynamic props", async () => {
    const registry = makeRegistry();
    const ctx = makeContext(registry);
    const node = new SubgraphNode({
      graph: makeStringPassthroughGraph(),
      text: "overridden_value"
    });
    const result = await node.process(ctx);

    const values = Object.values(result);
    expect(values.length).toBeGreaterThan(0);
    const hasOverridden = values.some(
      (v) =>
        v === "overridden_value" ||
        JSON.stringify(v).includes("overridden_value")
    );
    expect(hasOverridden).toBe(true);
  });

  it("passes integer input through", async () => {
    const registry = makeRegistry();
    const ctx = makeContext(registry);
    const node = new SubgraphNode({
      graph: {
        nodes: [
          {
            id: "inp1",
            type: "nodetool.input.IntegerInput",
            data: { name: "count", value: 42 }
          },
          {
            id: "out1",
            type: "nodetool.output.Output",
            data: { name: "result", value: 0 }
          }
        ],
        edges: [
          {
            source: "inp1",
            sourceHandle: "output",
            target: "out1",
            targetHandle: "value"
          }
        ]
      }
    });
    const result = await node.process(ctx);
    const values = Object.values(result);
    expect(values).toContain(42);
  });

  it("supports multiple inputs and multiple outputs", async () => {
    const registry = makeRegistry();
    const ctx = makeContext(registry);
    // a -> outA, b -> outB
    const node = new SubgraphNode({
      graph: {
        nodes: [
          {
            id: "inpA",
            type: "nodetool.input.StringInput",
            data: { name: "a", value: "A_default" }
          },
          {
            id: "inpB",
            type: "nodetool.input.StringInput",
            data: { name: "b", value: "B_default" }
          },
          {
            id: "outA",
            type: "nodetool.output.Output",
            data: { name: "outA", value: "" }
          },
          {
            id: "outB",
            type: "nodetool.output.Output",
            data: { name: "outB", value: "" }
          }
        ],
        edges: [
          {
            source: "inpA",
            sourceHandle: "output",
            target: "outA",
            targetHandle: "value"
          },
          {
            source: "inpB",
            sourceHandle: "output",
            target: "outB",
            targetHandle: "value"
          }
        ]
      },
      a: "hello",
      b: "world"
    });
    const result = await node.process(ctx);
    expect(result.outA).toBe("hello");
    expect(result.outB).toBe("world");
  });

  it("supports nested subgraphs", async () => {
    const registry = makeRegistry();
    const ctx = makeContext(registry);
    // Outer subgraph contains an inner subgraph (passthrough).
    const innerGraph = makeStringPassthroughGraph();
    const node = new SubgraphNode({
      graph: {
        nodes: [
          {
            id: "outer_inp",
            type: "nodetool.input.StringInput",
            data: { name: "msg", value: "" }
          },
          {
            id: "inner_sub",
            type: "nodetool.workflows.subgraph.Subgraph",
            data: { graph: innerGraph }
          },
          {
            id: "outer_out",
            type: "nodetool.output.Output",
            data: { name: "result", value: "" }
          }
        ],
        edges: [
          {
            source: "outer_inp",
            sourceHandle: "output",
            target: "inner_sub",
            targetHandle: "text"
          },
          {
            source: "inner_sub",
            sourceHandle: "result",
            target: "outer_out",
            targetHandle: "value"
          }
        ]
      },
      msg: "nested_hello"
    });
    const result = await node.process(ctx);
    expect(result.result).toBe("nested_hello");
  });
});
