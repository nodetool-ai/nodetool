import { describe, it, expect } from "vitest";
import { WorkflowRunner } from "@nodetool-ai/kernel";
import { NodeRegistry, createGraphNodeTypeResolver } from "@nodetool-ai/node-sdk";
import type { Edge, NodeDescriptor, ProcessingMessage } from "@nodetool-ai/protocol";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { registerBaseNodes } from "@nodetool-ai/base-nodes";
import { streamInnerGraph } from "../src/nodes/run-inner-graph.js";

const APP_NODE_TYPE = "nodetool.workflows.app_node.App";

function makeRegistry(): NodeRegistry {
  const registry = new NodeRegistry();
  registerBaseNodes(registry);
  return registry;
}

/** Registry nodes, plus a passthrough for the parent's `test.Input`. */
function makeResolveExecutor(registry: NodeRegistry) {
  return (node: { id: string; type: string; [key: string]: unknown }) =>
    registry.has(node.type)
      ? registry.resolve(node as NodeDescriptor)
      : {
          async process(inputs: Record<string, unknown>) {
            return inputs;
          }
        };
}

/** Wired like the server: inner graphs hydrate their streaming flags. */
function makeContext(registry: NodeRegistry): ProcessingContext {
  const ctx = new ProcessingContext({ jobId: "parent-job" });
  ctx.setResolveExecutor(makeResolveExecutor(registry));
  ctx.setResolveNodeType(createGraphNodeTypeResolver(registry).resolveNodeType);
  return ctx;
}

/** Inner workflow: two inputs, a prefix and a list, streamed item by item. */
const streamingGraph = {
  nodes: [
    {
      id: "items_in",
      type: "nodetool.input.StringListInput",
      data: { name: "items", value: [] }
    },
    {
      id: "label_in",
      type: "nodetool.input.StringInput",
      data: { name: "label", value: "default" }
    },
    { id: "each", type: "nodetool.control.ForEach", data: {} },
    {
      id: "item_out",
      type: "nodetool.output.Output",
      data: { name: "item", value: "" }
    },
    {
      id: "label_out",
      type: "nodetool.output.Output",
      data: { name: "label", value: "" }
    }
  ],
  edges: [
    {
      source: "items_in",
      sourceHandle: "output",
      target: "each",
      targetHandle: "input_list"
    },
    {
      source: "each",
      sourceHandle: "output",
      target: "item_out",
      targetHandle: "value"
    },
    {
      source: "label_in",
      sourceHandle: "output",
      target: "label_out",
      targetHandle: "value"
    }
  ]
};

function appGraph(snapshot: Record<string, unknown>): {
  nodes: NodeDescriptor[];
  edges: Edge[];
} {
  return {
    nodes: [
      { id: "parent_in", type: "test.Input", name: "list" },
      {
        id: "app",
        type: APP_NODE_TYPE,
        is_streaming_output: true,
        properties: { app_id: "app-1", app_json: snapshot },
        dynamic_outputs: {
          item: { type: "any", type_args: [] },
          label: { type: "any", type_args: [] }
        },
        // What the editor stores for an output its inner workflow streams.
        dynamic_output_correlation: {
          item: { kind: "chunk", source: "__execution__" }
        }
      },
      {
        id: "items_final",
        type: "nodetool.output.Output",
        name: "items_final",
        properties: { name: "items_final", value: "" }
      },
      {
        id: "label_final",
        type: "nodetool.output.Output",
        name: "label_final",
        properties: { name: "label_final", value: "" }
      }
    ],
    edges: [
      {
        source: "parent_in",
        sourceHandle: "value",
        target: "app",
        targetHandle: "items"
      },
      {
        source: "app",
        sourceHandle: "item",
        target: "items_final",
        targetHandle: "value"
      },
      {
        source: "app",
        sourceHandle: "label",
        target: "label_final",
        targetHandle: "value"
      }
    ]
  };
}

function outputUpdates(messages: ProcessingMessage[], nodeId: string): unknown[] {
  return messages.flatMap((msg) =>
    msg.type === "output_update" && msg.node_id === nodeId ? [msg.value] : []
  );
}

describe("AppNode", () => {
  it("is registered", () => {
    expect(makeRegistry().has(APP_NODE_TYPE)).toBe(true);
  });

  it("streams each inner output out of the node and applies the app's constants", async () => {
    const registry = makeRegistry();
    const ctx = makeContext(registry);
    const messages: ProcessingMessage[] = [];
    ctx.addMessageListener((msg) => messages.push(msg));

    const runner = new WorkflowRunner("parent-job", {
      resolveExecutor: makeResolveExecutor(registry),
      executionContext: ctx
    });
    const result = await runner.run(
      { job_id: "parent-job", params: { list: ["a", "b", "c"] } },
      appGraph({
        name: "Lister",
        operation_id: "main",
        workflow_id: "wf-streaming",
        graph: streamingGraph,
        constants: { label: "fixed by the app" }
      })
    );

    expect(result.status).toBe("completed");
    expect(outputUpdates(messages, "items_final")).toEqual(["a", "b", "c"]);
    expect(outputUpdates(messages, "label_final")).toEqual(["fixed by the app"]);
    // The inner run's lifecycle stays inside the node: the parent's clients
    // see exactly one job, the parent's.
    const jobIds = new Set(
      messages.flatMap((msg) => (msg.type === "job_update" ? [msg.job_id] : []))
    );
    expect([...jobIds]).toEqual(["parent-job"]);
  });

  it("fails the run with a pointer to the app when no app is selected", async () => {
    const registry = makeRegistry();
    const ctx = makeContext(registry);
    const runner = new WorkflowRunner("parent-job", {
      resolveExecutor: makeResolveExecutor(registry),
      executionContext: ctx
    });
    const result = await runner.run(
      { job_id: "parent-job", params: { list: [] } },
      appGraph({})
    );
    expect(result.status).toBe("failed");
    expect(result.error).toContain("Select the app again");
  });

  it("refuses an app whose workflow runs itself", async () => {
    const registry = makeRegistry();
    const ctx = makeContext(registry);
    const selfReferencing = {
      nodes: [
        {
          id: "inner_app",
          type: APP_NODE_TYPE,
          data: {
            app_id: "app-1",
            app_json: { workflow_id: "wf-loop", graph: { nodes: [], edges: [] } }
          }
        }
      ],
      edges: []
    };
    selfReferencing.nodes[0].data.app_json.graph = selfReferencing;

    const stream = streamInnerGraph(ctx, selfReferencing, {
      params: {},
      jobPrefix: "app",
      workflowId: "wf-loop",
      failureLabel: "App"
    });
    await expect(stream.next()).rejects.toThrow(/runs itself/);
  });
});

describe("streamInnerGraph", () => {
  it("leaves the parent context's cancellation signal and channels alone", async () => {
    const registry = makeRegistry();
    const ctx = makeContext(registry);
    const parentSignal = ctx.signal;
    ctx.registerChannelWriters("parent-channel", 1);
    const channel = ctx.getChannel("parent-channel");

    const stream = streamInnerGraph(ctx, streamingGraph, {
      params: { items: ["x"], label: "l" },
      jobPrefix: "app",
      failureLabel: "App"
    });
    const yielded: Array<Record<string, unknown>> = [];
    let step = await stream.next();
    while (!step.done) {
      yielded.push(step.value);
      step = await stream.next();
    }

    expect(yielded).toEqual(expect.arrayContaining([{ item: "x" }, { label: "l" }]));
    expect(step.value).toMatchObject({ item: "x", label: "l" });
    expect(ctx.signal).toBe(parentSignal);
    expect(channel.closed).toBe(false);
  });

  it("cancels the inner run when the parent run is cancelled", async () => {
    const registry = makeRegistry();
    const ctx = makeContext(registry);
    const controller = new AbortController();
    ctx.signal = controller.signal;

    // A list long enough that the inner run is still streaming when the
    // parent cancels after the first item.
    const items = Array.from({ length: 10_000 }, (_, i) => `item-${i}`);
    const stream = streamInnerGraph(ctx, streamingGraph, {
      params: { items, label: "l" },
      jobPrefix: "app",
      failureLabel: "App"
    });
    const first = await stream.next();
    expect(first.done).toBe(false);
    controller.abort();

    let count = 1;
    let step = await stream.next();
    while (!step.done) {
      count++;
      step = await stream.next();
    }
    expect(count).toBeLessThan(items.length);
  });
});
