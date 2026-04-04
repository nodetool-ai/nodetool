import { describe, it, expect } from "vitest";
import { WorkflowRunner } from "@nodetool/kernel";
import { NodeRegistry } from "@nodetool/node-sdk";
import type { NodeDescriptor, Edge } from "@nodetool/protocol";
import { ProcessingContext } from "@nodetool/runtime";
import { registerBaseNodes, WorkflowNode } from "../src/index.js";

function makeRegistry(): NodeRegistry {
  const registry = new NodeRegistry();
  registerBaseNodes(registry);
  return registry;
}

function makeResolveExecutor(registry: NodeRegistry) {
  return (node: { id: string; type: string; [key: string]: unknown }) => {
    if (!registry.has(node.type)) {
      // Fallback for unknown types: passthrough
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

function makeRunner(
  registry: NodeRegistry,
  ctx?: ProcessingContext
): WorkflowRunner {
  const context = ctx ?? makeContext(registry);
  return new WorkflowRunner("test-job", {
    resolveExecutor: makeResolveExecutor(registry),
    executionContext: context
  });
}

/**
 * Build a minimal sub-workflow graph: StringInput -> Output
 */
function makeStringPassthroughSubWorkflow() {
  return {
    id: "sub-wf-1",
    name: "Passthrough",
    graph: {
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
    }
  };
}

describe("WorkflowNode", () => {
  it("is registered with the correct node type", () => {
    const registry = makeRegistry();
    expect(registry.has("nodetool.workflows.workflow_node.Workflow")).toBe(
      true
    );
  });

  it("has correct static properties", () => {
    expect(WorkflowNode.nodeType).toBe(
      "nodetool.workflows.workflow_node.Workflow"
    );
    expect(WorkflowNode.isDynamic).toBe(true);
    expect(WorkflowNode.isStreamingOutput).toBe(true);
  });

  it("returns empty output when no workflow_json is set", async () => {
    const registry = makeRegistry();
    const ctx = makeContext(registry);
    const node = new WorkflowNode({ workflow_json: {} });
    const result = await node.process(ctx);
    expect(result).toEqual({});
  });

  it("throws when no resolveExecutor on context", async () => {
    const ctx = new ProcessingContext({ jobId: "test" });
    const subWf = makeStringPassthroughSubWorkflow();
    const node = new WorkflowNode({
      workflow_id: subWf.id,
      workflow_json: subWf
    });
    await expect(node.process(ctx)).rejects.toThrow("resolveExecutor");
  });
});

describe("WorkflowNode: string passthrough", () => {
  it("passes default value through when no dynamic input provided", async () => {
    const registry = makeRegistry();
    const ctx = makeContext(registry);
    const subWf = makeStringPassthroughSubWorkflow();

    const node = new WorkflowNode({
      workflow_id: subWf.id,
      workflow_json: subWf
    });
    const result = await node.process(ctx);

    // Output node "result" should have the default value
    const values = Object.values(result);
    expect(values.length).toBeGreaterThan(0);
    const hasDefault = values.some(
      (v) =>
        v === "default_value" || JSON.stringify(v).includes("default_value")
    );
    expect(hasDefault).toBe(true);
  });

  it("overrides input value via dynamic props", async () => {
    const registry = makeRegistry();
    const ctx = makeContext(registry);
    const subWf = makeStringPassthroughSubWorkflow();

    const node = new WorkflowNode({
      workflow_id: subWf.id,
      workflow_json: subWf,
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
});

describe("WorkflowNode: integer input type", () => {
  function makeIntSubWorkflow() {
    return {
      id: "sub-wf-int",
      name: "IntPassthrough",
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
    };
  }

  it("passes integer default value", async () => {
    const registry = makeRegistry();
    const ctx = makeContext(registry);
    const subWf = makeIntSubWorkflow();

    const node = new WorkflowNode({
      workflow_id: subWf.id,
      workflow_json: subWf
    });
    const result = await node.process(ctx);

    const values = Object.values(result);
    expect(values).toContain(42);
  });

  it("overrides integer input", async () => {
    const registry = makeRegistry();
    const ctx = makeContext(registry);
    const subWf = makeIntSubWorkflow();

    const node = new WorkflowNode({
      workflow_id: subWf.id,
      workflow_json: subWf,
      count: 99
    });
    const result = await node.process(ctx);

    const values = Object.values(result);
    expect(values).toContain(99);
  });
});

describe("WorkflowNode: float input type", () => {
  function makeFloatSubWorkflow() {
    return {
      id: "sub-wf-float",
      name: "FloatPassthrough",
      graph: {
        nodes: [
          {
            id: "inp1",
            type: "nodetool.input.FloatInput",
            data: { name: "ratio", value: 3.14 }
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
    };
  }

  it("passes float value through sub-workflow", async () => {
    const registry = makeRegistry();
    const ctx = makeContext(registry);
    const subWf = makeFloatSubWorkflow();

    const node = new WorkflowNode({
      workflow_id: subWf.id,
      workflow_json: subWf,
      ratio: 2.718
    });
    const result = await node.process(ctx);

    const values = Object.values(result);
    expect(values).toContain(2.718);
  });
});

describe("WorkflowNode: boolean input type", () => {
  function makeBoolSubWorkflow() {
    return {
      id: "sub-wf-bool",
      name: "BoolPassthrough",
      graph: {
        nodes: [
          {
            id: "inp1",
            type: "nodetool.input.BooleanInput",
            data: { name: "flag", value: false }
          },
          {
            id: "out1",
            type: "nodetool.output.Output",
            data: { name: "result", value: false }
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
    };
  }

  it("passes boolean value through sub-workflow", async () => {
    const registry = makeRegistry();
    const ctx = makeContext(registry);
    const subWf = makeBoolSubWorkflow();

    const node = new WorkflowNode({
      workflow_id: subWf.id,
      workflow_json: subWf,
      flag: true
    });
    const result = await node.process(ctx);

    const values = Object.values(result);
    expect(values).toContain(true);
  });
});

describe("WorkflowNode: multiple inputs and outputs", () => {
  function makeMultiIOSubWorkflow() {
    return {
      id: "sub-wf-multi",
      name: "MultiIO",
      graph: {
        nodes: [
          {
            id: "inp1",
            type: "nodetool.input.StringInput",
            data: { name: "greeting", value: "hello" }
          },
          {
            id: "inp2",
            type: "nodetool.input.IntegerInput",
            data: { name: "count", value: 1 }
          },
          {
            id: "out1",
            type: "nodetool.output.Output",
            data: { name: "message", value: "" }
          },
          {
            id: "out2",
            type: "nodetool.output.Output",
            data: { name: "number", value: 0 }
          }
        ],
        edges: [
          {
            source: "inp1",
            sourceHandle: "output",
            target: "out1",
            targetHandle: "value"
          },
          {
            source: "inp2",
            sourceHandle: "output",
            target: "out2",
            targetHandle: "value"
          }
        ]
      }
    };
  }

  it("handles multiple inputs and outputs", async () => {
    const registry = makeRegistry();
    const ctx = makeContext(registry);
    const subWf = makeMultiIOSubWorkflow();

    const node = new WorkflowNode({
      workflow_id: subWf.id,
      workflow_json: subWf,
      greeting: "hi",
      count: 5
    });
    const result = await node.process(ctx);

    expect(Object.keys(result).length).toBeGreaterThanOrEqual(2);
    const values = Object.values(result);
    expect(values).toContain("hi");
    expect(values).toContain(5);
  });

  it("uses defaults for unprovided inputs", async () => {
    const registry = makeRegistry();
    const ctx = makeContext(registry);
    const subWf = makeMultiIOSubWorkflow();

    const node = new WorkflowNode({
      workflow_id: subWf.id,
      workflow_json: subWf,
      greeting: "world"
    });
    const result = await node.process(ctx);

    const values = Object.values(result);
    expect(values).toContain("world");
    expect(values).toContain(1); // default
  });
});

describe("WorkflowNode: streaming via genProcess", () => {
  it("yields output via genProcess", async () => {
    const registry = makeRegistry();
    const ctx = makeContext(registry);
    const subWf = makeStringPassthroughSubWorkflow();

    const node = new WorkflowNode({
      workflow_id: subWf.id,
      workflow_json: subWf,
      text: "streamed"
    });

    const results: Record<string, unknown>[] = [];
    for await (const partial of node.genProcess(ctx)) {
      results.push(partial);
    }

    expect(results.length).toBeGreaterThan(0);
    const allValues = results.flatMap((r) => Object.values(r));
    expect(
      allValues.some(
        (v) => v === "streamed" || JSON.stringify(v).includes("streamed")
      )
    ).toBe(true);
  });
});

describe("WorkflowNode: embedded in parent workflow", () => {
  it("executes sub-workflow within a parent workflow graph", async () => {
    const registry = makeRegistry();
    const ctx = makeContext(registry);

    const subWf = makeStringPassthroughSubWorkflow();

    // Parent workflow: input -> WorkflowNode -> output
    const nodes: NodeDescriptor[] = [
      { id: "parent-inp", type: "test.Input", name: "text" },
      {
        id: "wf-node",
        type: "nodetool.workflows.workflow_node.Workflow",
        is_streaming_output: true,
        properties: {
          workflow_id: subWf.id,
          workflow_json: subWf
        },
        dynamic_outputs: {
          result: { type: "str", type_args: [] }
        }
      },
      {
        id: "parent-out",
        type: "nodetool.output.Output",
        name: "final",
        properties: { name: "final", value: "" }
      }
    ];
    const edges: Edge[] = [
      {
        source: "parent-inp",
        sourceHandle: "value",
        target: "wf-node",
        targetHandle: "text"
      },
      {
        source: "wf-node",
        sourceHandle: "result",
        target: "parent-out",
        targetHandle: "value"
      }
    ];

    const runner = makeRunner(registry, ctx);
    const result = await runner.run(
      { job_id: "parent-1", params: { text: "from_parent" } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    const outputValues = Object.values(result.outputs).flat();
    expect(
      outputValues.some(
        (v) => v === "from_parent" || JSON.stringify(v).includes("from_parent")
      )
    ).toBe(true);
  });
});

describe("WorkflowNode: dynamic_properties propagation (no edge)", () => {
  it("passes dynamic_properties values to sub-workflow inputs", async () => {
    const registry = makeRegistry();
    const ctx = makeContext(registry);

    const subWf = makeStringPassthroughSubWorkflow();

    // Parent workflow: WorkflowNode (with dynamic_properties) -> output
    // No edge feeding the "text" input — the value comes from dynamic_properties
    const nodes: NodeDescriptor[] = [
      {
        id: "wf-node",
        type: "nodetool.workflows.workflow_node.Workflow",
        is_streaming_output: true,
        properties: {
          workflow_id: subWf.id,
          workflow_json: subWf
        },
        dynamic_properties: {
          text: "from_dynamic_props"
        },
        dynamic_outputs: {
          result: { type: "str", type_args: [] }
        }
      },
      {
        id: "parent-out",
        type: "nodetool.output.Output",
        name: "final",
        properties: { name: "final", value: "" }
      }
    ];
    const edges: Edge[] = [
      {
        source: "wf-node",
        sourceHandle: "result",
        target: "parent-out",
        targetHandle: "value"
      }
    ];

    const runner = makeRunner(registry, ctx);
    const result = await runner.run(
      { job_id: "dynamic-props-1", params: {} },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    const outputValues = Object.values(result.outputs).flat();
    expect(
      outputValues.some(
        (v) =>
          v === "from_dynamic_props" ||
          JSON.stringify(v).includes("from_dynamic_props")
      )
    ).toBe(true);
  });
});

describe("WorkflowNode: error handling", () => {
  it("returns empty when workflow_json has no graph", async () => {
    const registry = makeRegistry();
    const ctx = makeContext(registry);

    const node = new WorkflowNode({
      workflow_id: "missing",
      workflow_json: { id: "missing", name: "Missing" }
    });
    const result = await node.process(ctx);
    expect(result).toEqual({});
  });

  it("returns empty when graph has no nodes", async () => {
    const registry = makeRegistry();
    const ctx = makeContext(registry);

    const node = new WorkflowNode({
      workflow_id: "empty",
      workflow_json: { id: "empty", name: "Empty", graph: {} }
    });
    const result = await node.process(ctx);
    expect(result).toEqual({});
  });

  it("returns empty when graph has no edges", async () => {
    const registry = makeRegistry();
    const ctx = makeContext(registry);

    const node = new WorkflowNode({
      workflow_id: "no-edges",
      workflow_json: {
        id: "no-edges",
        name: "NoEdges",
        graph: { nodes: [], edges: undefined }
      }
    });
    const result = await node.process(ctx);
    expect(result).toEqual({});
  });
});

describe("WorkflowNode: sub-workflow with intermediate node", () => {
  it("executes a sub-workflow with a reroute node", async () => {
    const registry = makeRegistry();
    const subWf = {
      id: "sub-wf-reroute",
      name: "WithReroute",
      graph: {
        nodes: [
          {
            id: "inp1",
            type: "nodetool.input.StringInput",
            data: { name: "text", value: "default" }
          },
          {
            id: "reroute1",
            type: "nodetool.control.Reroute",
            data: {}
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
            target: "reroute1",
            targetHandle: "input_value"
          },
          {
            source: "reroute1",
            sourceHandle: "output",
            target: "out1",
            targetHandle: "value"
          }
        ]
      }
    };

    const ctx = makeContext(registry);
    const node = new WorkflowNode({
      workflow_id: subWf.id,
      workflow_json: subWf,
      text: "through_reroute"
    });
    const result = await node.process(ctx);

    const values = Object.values(result);
    expect(
      values.some(
        (v) =>
          v === "through_reroute" ||
          JSON.stringify(v).includes("through_reroute")
      )
    ).toBe(true);
  });
});
