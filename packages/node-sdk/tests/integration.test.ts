import { describe, it, expect } from "vitest";
import { WorkflowRunner } from "@nodetool/kernel";
import type { NodeDescriptor, Edge } from "@nodetool/protocol";
import { NodeRegistry } from "../src/registry.js";
import {
  Add,
  ErrorNode,
  StreamingCounter,
  Passthrough,
  ALL_TEST_NODES
} from "../src/nodes/test-nodes.js";

function makeRegistry(): NodeRegistry {
  const registry = new NodeRegistry();
  for (const nodeClass of ALL_TEST_NODES) {
    registry.register(nodeClass);
  }
  return registry;
}

function makeRunner(registry: NodeRegistry): WorkflowRunner {
  return new WorkflowRunner("test-job", {
    resolveExecutor: (node) => {
      if (!registry.has(node.type)) {
        // Fallback for unregistered types (e.g. raw input/output nodes)
        return {
          async process(inputs) {
            return inputs;
          }
        };
      }
      return registry.resolve(node);
    }
  });
}

/**
 * In the WorkflowRunner model:
 * - Nodes with NO incoming data edges are "source nodes" – the runner dispatches
 *   `params[node.name]` directly onto their outgoing edges (no executor called).
 * - Nodes WITH incoming edges are spawned as actors that run their executor.
 *
 * So we structure pipelines as:
 *   Source (name=X, no incoming) --value--> ActorNode --result--> Sink (no outgoing)
 */

describe("Integration: simple linear pipeline", () => {
  it("params flow through Add to output", async () => {
    // Source nodes "in_a" and "in_b" receive params and forward them
    // to the Add actor, whose result flows to the sink Passthrough.
    const nodes: NodeDescriptor[] = [
      { id: "in_a", type: "test.Input", name: "a" },
      { id: "in_b", type: "test.Input", name: "b" },
      { id: "add", type: Add.nodeType },
      { id: "sink", type: Passthrough.nodeType, name: "result" }
    ];
    const edges: Edge[] = [
      {
        source: "in_a",
        sourceHandle: "value",
        target: "add",
        targetHandle: "a"
      },
      {
        source: "in_b",
        sourceHandle: "value",
        target: "add",
        targetHandle: "b"
      },
      {
        source: "add",
        sourceHandle: "result",
        target: "sink",
        targetHandle: "value"
      }
    ];

    const runner = makeRunner(makeRegistry());
    const result = await runner.run(
      { job_id: "j1", params: { a: 10, b: 5 } },
      { nodes, edges }
    );
    expect(result.status).toBe("completed");
    expect(result.outputs["result"]).toContain(15);
  });
});

describe("Integration: multiple inputs to Add node", () => {
  it("3 + 4 = 7 via params", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "src_a", type: "test.Input", name: "a" },
      { id: "src_b", type: "test.Input", name: "b" },
      { id: "add", type: Add.nodeType },
      { id: "out", type: Passthrough.nodeType, name: "sum" }
    ];
    const edges: Edge[] = [
      {
        source: "src_a",
        sourceHandle: "value",
        target: "add",
        targetHandle: "a"
      },
      {
        source: "src_b",
        sourceHandle: "value",
        target: "add",
        targetHandle: "b"
      },
      {
        source: "add",
        sourceHandle: "result",
        target: "out",
        targetHandle: "value"
      }
    ];

    const runner = makeRunner(makeRegistry());
    const result = await runner.run(
      { job_id: "j4", params: { a: 3, b: 4 } },
      { nodes, edges }
    );
    expect(result.status).toBe("completed");
    expect(result.outputs["sum"]).toContain(7);
  });
});

describe("Integration: error propagation", () => {
  it("ErrorNode causes node_update with error status", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "val" },
      {
        id: "err",
        type: ErrorNode.nodeType,
        properties: { message: "integration error" }
      }
    ];
    const edges: Edge[] = [
      {
        source: "in",
        sourceHandle: "value",
        target: "err",
        targetHandle: "value"
      }
    ];

    const runner = makeRunner(makeRegistry());
    const result = await runner.run(
      { job_id: "j2", params: { val: 1 } },
      { nodes, edges }
    );

    const hasError = result.messages.some(
      (m) =>
        m.type === "node_update" && (m as { status: string }).status === "error"
    );
    expect(hasError).toBe(true);
  });
});

describe("Integration: streaming output", () => {
  it("StreamingCounter yields values through sink", async () => {
    // A trigger source param routes into the counter's handle to activate it,
    // while `count` is set via node properties.
    const nodes: NodeDescriptor[] = [
      { id: "trigger", type: "test.Input", name: "trig" },
      {
        id: "counter",
        type: StreamingCounter.nodeType,
        is_streaming_output: true,
        properties: { count: 3, start: 0 }
      },
      { id: "sink", type: Passthrough.nodeType, name: "values" }
    ];
    const edges: Edge[] = [
      {
        source: "trigger",
        sourceHandle: "value",
        target: "counter",
        targetHandle: "start"
      },
      {
        source: "counter",
        sourceHandle: "value",
        target: "sink",
        targetHandle: "value"
      }
    ];

    const runner = makeRunner(makeRegistry());
    const result = await runner.run(
      { job_id: "j3", params: { trig: 0 } },
      { nodes, edges }
    );
    expect(result.status).toBe("completed");
    // At least one value should have been captured at the sink
    expect(result.outputs["values"]?.length).toBeGreaterThanOrEqual(1);
  });
});
