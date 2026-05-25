import { describe, it, expect } from "vitest";
import { WorkflowRunner } from "@nodetool-ai/kernel";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { NodeDescriptor } from "@nodetool-ai/protocol";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { registerBaseNodes } from "../src/index.js";

/**
 * End-to-end integration tests for SubgraphNode.
 *
 * These tests run an outer workflow that embeds a SubgraphNode (the same
 * shape produced by the editor when the user creates a subgraph) and verify
 * the full data path: outer Input → SubgraphNode (with inner Input/Output) →
 * outer Output.
 *
 * This is the contract the e2e UI tests can't cheaply exercise: the inline
 * graph stored in `SubgraphNode.properties.graph` must round-trip through
 * the runner, with `name`-keyed boundary ports routed correctly across the
 * outer/inner boundary.
 */

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
  const ctx = new ProcessingContext({ jobId: "integration-test" });
  ctx.setResolveExecutor(makeResolveExecutor(registry));
  return ctx;
}

describe("Subgraph end-to-end through outer WorkflowRunner", () => {
  it("routes a value: outer Input → SubgraphNode → outer Output", async () => {
    const registry = makeRegistry();
    const ctx = makeContext(registry);

    // Inner graph: StringInput("msg") → Output("result")
    const innerGraph = {
      nodes: [
        {
          id: "inner_in",
          type: "nodetool.input.StringInput",
          data: { name: "msg", value: "" }
        },
        {
          id: "inner_out",
          type: "nodetool.output.Output",
          data: { name: "result", value: "" }
        }
      ],
      edges: [
        {
          source: "inner_in",
          sourceHandle: "output",
          target: "inner_out",
          targetHandle: "value"
        }
      ]
    };

    // Outer graph: StringInput("greeting") → Subgraph → Output("final")
    // The Subgraph's port name `msg` matches the inner Input's name; the
    // Subgraph's output port name `result` matches the inner Output's name.
    const outerGraph = {
      nodes: [
        {
          id: "outer_in",
          type: "nodetool.input.StringInput",
          properties: { name: "greeting", value: "" }
        },
        {
          id: "subgraph",
          type: "nodetool.workflows.subgraph.Subgraph",
          is_streaming_output: true,
          properties: { graph: innerGraph },
          dynamic_outputs: {
            result: { type: "str", type_args: [] }
          }
        },
        {
          id: "outer_out",
          type: "nodetool.output.Output",
          properties: { name: "final", value: "" }
        }
      ],
      edges: [
        {
          source: "outer_in",
          sourceHandle: "output",
          target: "subgraph",
          targetHandle: "msg"
        },
        {
          source: "subgraph",
          sourceHandle: "result",
          target: "outer_out",
          targetHandle: "value"
        }
      ]
    };

    const runner = new WorkflowRunner("outer-job", {
      resolveExecutor: makeResolveExecutor(registry),
      executionContext: ctx
    });

    const result = await runner.run(
      {
        job_id: "outer-job",
        params: { greeting: "hello world" }
      },
      outerGraph as unknown as Parameters<typeof runner.run>[1]
    );

    expect(result.status).toBe("completed");
    expect(result.outputs).toBeDefined();
    const all = Object.values(result.outputs).flat();
    expect(all).toContain("hello world");
  });

  it("routes through a transforming subgraph (uppercase via Concat)", async () => {
    const registry = makeRegistry();
    const ctx = makeContext(registry);

    // Inner graph: StringInput("text") + StringInput("suffix") concatenated → Output("out")
    // We use two inputs to prove multiple boundary ports work in concert.
    const innerGraph = {
      nodes: [
        {
          id: "a",
          type: "nodetool.input.StringInput",
          data: { name: "first", value: "" }
        },
        {
          id: "b",
          type: "nodetool.input.StringInput",
          data: { name: "second", value: "" }
        },
        {
          id: "out_a",
          type: "nodetool.output.Output",
          data: { name: "outA", value: "" }
        },
        {
          id: "out_b",
          type: "nodetool.output.Output",
          data: { name: "outB", value: "" }
        }
      ],
      edges: [
        {
          source: "a",
          sourceHandle: "output",
          target: "out_a",
          targetHandle: "value"
        },
        {
          source: "b",
          sourceHandle: "output",
          target: "out_b",
          targetHandle: "value"
        }
      ]
    };

    const outerGraph = {
      nodes: [
        {
          id: "in_a",
          type: "nodetool.input.StringInput",
          properties: { name: "x", value: "hello" }
        },
        {
          id: "in_b",
          type: "nodetool.input.StringInput",
          properties: { name: "y", value: "world" }
        },
        {
          id: "sub",
          type: "nodetool.workflows.subgraph.Subgraph",
          is_streaming_output: true,
          properties: { graph: innerGraph },
          dynamic_outputs: {
            outA: { type: "str", type_args: [] },
            outB: { type: "str", type_args: [] }
          }
        },
        {
          id: "out_x",
          type: "nodetool.output.Output",
          properties: { name: "X", value: "" }
        },
        {
          id: "out_y",
          type: "nodetool.output.Output",
          properties: { name: "Y", value: "" }
        }
      ],
      edges: [
        {
          source: "in_a",
          sourceHandle: "output",
          target: "sub",
          targetHandle: "first"
        },
        {
          source: "in_b",
          sourceHandle: "output",
          target: "sub",
          targetHandle: "second"
        },
        {
          source: "sub",
          sourceHandle: "outA",
          target: "out_x",
          targetHandle: "value"
        },
        {
          source: "sub",
          sourceHandle: "outB",
          target: "out_y",
          targetHandle: "value"
        }
      ]
    };

    const runner = new WorkflowRunner("outer-job-2", {
      resolveExecutor: makeResolveExecutor(registry),
      executionContext: ctx
    });

    const result = await runner.run(
      {
        job_id: "outer-job-2",
        params: { x: "hello", y: "world" }
      },
      outerGraph as unknown as Parameters<typeof runner.run>[1]
    );

    expect(result.status).toBe("completed");
    const all = Object.values(result.outputs).flat();
    expect(all).toContain("hello");
    expect(all).toContain("world");
  });

  it("supports nested subgraphs: outer → subgraph → subgraph → output", async () => {
    const registry = makeRegistry();
    const ctx = makeContext(registry);

    // Inner-most subgraph: Input(msg) → Output(out)
    const innermost = {
      nodes: [
        {
          id: "i_in",
          type: "nodetool.input.StringInput",
          data: { name: "msg", value: "" }
        },
        {
          id: "i_out",
          type: "nodetool.output.Output",
          data: { name: "out", value: "" }
        }
      ],
      edges: [
        {
          source: "i_in",
          sourceHandle: "output",
          target: "i_out",
          targetHandle: "value"
        }
      ]
    };

    // Middle subgraph contains the innermost subgraph.
    // Boundary: msg (in) → out (forwarded from innermost).
    // Note: this graph runs INSIDE a child WorkflowRunner from
    // SubgraphNode.process, which uses Graph.fromDict (accepting both `data`
    // and `properties`), so `data` is fine here.
    const middle = {
      nodes: [
        {
          id: "m_in",
          type: "nodetool.input.StringInput",
          data: { name: "msg", value: "" }
        },
        {
          id: "m_inner_sub",
          type: "nodetool.workflows.subgraph.Subgraph",
          data: { graph: innermost }
        },
        {
          id: "m_out",
          type: "nodetool.output.Output",
          data: { name: "out", value: "" }
        }
      ],
      edges: [
        {
          source: "m_in",
          sourceHandle: "output",
          target: "m_inner_sub",
          targetHandle: "msg"
        },
        {
          source: "m_inner_sub",
          sourceHandle: "out",
          target: "m_out",
          targetHandle: "value"
        }
      ]
    };

    // Outer wires through the middle.
    const outer = {
      nodes: [
        {
          id: "o_in",
          type: "nodetool.input.StringInput",
          properties: { name: "msg", value: "deeply nested hello" }
        },
        {
          id: "o_sub",
          type: "nodetool.workflows.subgraph.Subgraph",
          is_streaming_output: true,
          properties: { graph: middle },
          dynamic_outputs: {
            out: { type: "str", type_args: [] }
          }
        },
        {
          id: "o_out",
          type: "nodetool.output.Output",
          properties: { name: "final", value: "" }
        }
      ],
      edges: [
        {
          source: "o_in",
          sourceHandle: "output",
          target: "o_sub",
          targetHandle: "msg"
        },
        {
          source: "o_sub",
          sourceHandle: "out",
          target: "o_out",
          targetHandle: "value"
        }
      ]
    };

    const runner = new WorkflowRunner("outer-job-3", {
      resolveExecutor: makeResolveExecutor(registry),
      executionContext: ctx
    });

    const result = await runner.run(
      {
        job_id: "outer-job-3",
        params: { msg: "deeply nested hello" }
      },
      outer as unknown as Parameters<typeof runner.run>[1]
    );

    expect(result.status).toBe("completed");
    const all = Object.values(result.outputs).flat();
    expect(all).toContain("deeply nested hello");
  });
});
