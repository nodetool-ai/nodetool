/**
 * Additional WorkflowRunner tests for coverage:
 *  - dispatchControlEvent
 *  - dispatchControlEventToTarget
 *  - pushInputValue / finishInputStream errors
 *  - control edges in graph
 */

import { describe, it, expect } from "vitest";
import { WorkflowRunner } from "../src/runner.js";
import { Graph } from "../src/graph.js";
import type { NodeDescriptor, Edge, ControlEvent } from "@nodetool-ai/protocol";
import type { NodeExecutor } from "../src/actor.js";

type RunnerInternals = {
  _graph: Graph;
  _buildControlContext(nodeId: string): Record<string, unknown> | null;
  _buildControlActionProperties(
    node: NodeDescriptor
  ): Record<string, Record<string, unknown>>;
  _isOutputNode(node: NodeDescriptor): boolean;
  _isExternalInputNode(node: NodeDescriptor): boolean;
  _getExternalInputName(node: NodeDescriptor): string;
};
const internals = (r: WorkflowRunner) => r as unknown as RunnerInternals;
const bareRunner = () =>
  new WorkflowRunner("internals", {
    resolveExecutor: () => ({
      async process() {
        return {};
      }
    })
  });

function simpleExecutor(
  fn: (inputs: Record<string, unknown>) => Record<string, unknown>
): NodeExecutor {
  return {
    async process(inputs) {
      return fn(inputs);
    }
  };
}

describe("WorkflowRunner – dispatchControlEvent", () => {
  it("broadcasts control event to all controlled nodes", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "ctrl1", type: "test.Controlled", is_controlled: true },
      { id: "ctrl2", type: "test.Controlled", is_controlled: true }
    ];
    const edges: Edge[] = [
      {
        source: "in",
        sourceHandle: "value",
        target: "ctrl1",
        targetHandle: "a"
      },
      {
        source: "in",
        sourceHandle: "value",
        target: "ctrl2",
        targetHandle: "a"
      }
    ];

    const calls: Record<string, Array<Record<string, unknown>>> = {
      ctrl1: [],
      ctrl2: []
    };

    const runner = new WorkflowRunner("test-ctrl", {
      resolveExecutor: (node) => {
        if (node.is_controlled) {
          return {
            async process(inputs) {
              calls[node.id]?.push(inputs);
              return { out: "ok" };
            }
          };
        }
        return simpleExecutor(() => ({}));
      }
    });

    // Start running in background
    const runPromise = runner.run(
      { job_id: "j-ctrl", params: { x: 42 } },
      { nodes, edges }
    );

    // Give time for actors to start
    await new Promise((r) => setTimeout(r, 50));

    // Dispatch control event
    await runner.dispatchControlEvent({
      event_type: "run",
      properties: { val: 1 }
    } as ControlEvent);

    // Stop all controlled nodes
    await runner.dispatchControlEvent({
      event_type: "stop",
      properties: {}
    } as ControlEvent);

    const result = await runPromise;
    expect(result.status).toBe("completed");
  });
});

describe("WorkflowRunner – dispatchControlEventToTarget", () => {
  it("sends control event to specific target node", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "ctrl1", type: "test.Controlled", is_controlled: true }
    ];
    const edges: Edge[] = [
      {
        source: "in",
        sourceHandle: "value",
        target: "ctrl1",
        targetHandle: "a"
      }
    ];

    const runner = new WorkflowRunner("test-ctrl-target", {
      resolveExecutor: (node) => {
        if (node.is_controlled) {
          return {
            async process(inputs) {
              return { out: inputs };
            }
          };
        }
        return simpleExecutor(() => ({}));
      }
    });

    const runPromise = runner.run(
      { job_id: "j-ctrl-t", params: { x: 10 } },
      { nodes, edges }
    );

    await new Promise((r) => setTimeout(r, 50));

    await runner.dispatchControlEventToTarget(
      { event_type: "run", properties: { p: 1 } } as ControlEvent,
      "ctrl1"
    );

    await runner.dispatchControlEventToTarget(
      { event_type: "stop", properties: {} } as ControlEvent,
      "ctrl1"
    );

    const result = await runPromise;
    expect(result.status).toBe("completed");
  });

  it("does nothing when target inbox does not exist", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "out", type: "test.Output" }
    ];
    const edges: Edge[] = [
      {
        source: "in",
        sourceHandle: "value",
        target: "out",
        targetHandle: "value"
      }
    ];

    const runner = new WorkflowRunner("test-ctrl-miss", {
      resolveExecutor: () => simpleExecutor((inputs) => inputs)
    });

    const runPromise = runner.run(
      { job_id: "j-miss", params: { x: 1 } },
      { nodes, edges }
    );

    await new Promise((r) => setTimeout(r, 20));

    // Send to nonexistent node - should not throw
    await runner.dispatchControlEventToTarget(
      { event_type: "run", properties: {} } as ControlEvent,
      "nonexistent"
    );

    const result = await runPromise;
    expect(result.status).toBe("completed");
  });
});

describe("WorkflowRunner – pushInputValue errors", () => {
  it("throws when workflow has not been started", async () => {
    const runner = new WorkflowRunner("test-no-start", {
      resolveExecutor: () => simpleExecutor(() => ({}))
    });

    await expect(runner.pushInputValue("x", 1)).rejects.toThrow(
      "Workflow has not been started"
    );
  });

  it("throws for nonexistent input name", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "out", type: "test.Output" }
    ];
    const edges: Edge[] = [
      {
        source: "in",
        sourceHandle: "value",
        target: "out",
        targetHandle: "value"
      }
    ];

    const runner = new WorkflowRunner("test-bad-input", {
      resolveExecutor: () => simpleExecutor((inputs) => inputs)
    });

    const runPromise = runner.run(
      { job_id: "j-bad", params: {} },
      { nodes, edges }
    );

    await new Promise((r) => setTimeout(r, 20));

    await expect(runner.pushInputValue("nonexistent", 1)).rejects.toThrow(
      "Input node not found"
    );

    // Finish the stream to complete
    runner.finishInputStream("x");
    await runPromise;
  });
});

describe("WorkflowRunner – finishInputStream errors", () => {
  it("throws when workflow has not been started", () => {
    const runner = new WorkflowRunner("test-finish-no-start", {
      resolveExecutor: () => simpleExecutor(() => ({}))
    });

    expect(() => runner.finishInputStream("x")).toThrow(
      "Workflow has not been started"
    );
  });

  it("throws for nonexistent input name", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "out", type: "test.Output" }
    ];
    const edges: Edge[] = [
      {
        source: "in",
        sourceHandle: "value",
        target: "out",
        targetHandle: "value"
      }
    ];

    const runner = new WorkflowRunner("test-finish-bad", {
      resolveExecutor: () => simpleExecutor((inputs) => inputs)
    });

    const runPromise = runner.run(
      { job_id: "j-finish-bad", params: {} },
      { nodes, edges }
    );

    await new Promise((r) => setTimeout(r, 20));

    expect(() => runner.finishInputStream("nonexistent")).toThrow(
      "Input node not found"
    );

    runner.finishInputStream("x");
    await runPromise;
  });
});

describe("WorkflowRunner – pushInputValue with sourceHandle filter", () => {
  it("filters by sourceHandle when provided", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "out1", type: "test.Output", name: "out1" },
      { id: "out2", type: "test.Output", name: "out2" }
    ];
    const edges: Edge[] = [
      {
        source: "in",
        sourceHandle: "value",
        target: "out1",
        targetHandle: "value"
      },
      {
        source: "in",
        sourceHandle: "other",
        target: "out2",
        targetHandle: "value"
      }
    ];

    const runner = new WorkflowRunner("test-source-handle", {
      resolveExecutor: () => simpleExecutor((inputs) => inputs)
    });

    const runPromise = runner.run(
      { job_id: "j-sh", params: {} },
      { nodes, edges }
    );

    await new Promise((r) => setTimeout(r, 20));

    // Push only to "value" handle
    await runner.pushInputValue("x", 42, "value");
    runner.finishInputStream("x", "value");
    runner.finishInputStream("x", "other");

    const result = await runPromise;
    expect(result.status).toBe("completed");
  });
});

describe("WorkflowRunner – multi-edge list detection", () => {
  it("detects and handles multiple edges to the same target handle", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "src1", type: "test.Src" },
      { id: "src2", type: "test.Src" },
      // The collector aggregates two incoming edges on handle "items", so the
      // handle must be declared as a list type for correlation analysis.
      {
        id: "collector",
        type: "test.Collector",
        propertyTypes: { items: "list[any]" }
      }
    ];
    // Two edges to the same target handle "items"
    const edges: Edge[] = [
      {
        source: "src1",
        sourceHandle: "out",
        target: "collector",
        targetHandle: "items"
      },
      {
        source: "src2",
        sourceHandle: "out",
        target: "collector",
        targetHandle: "items"
      }
    ];

    const runner = new WorkflowRunner("test-multi-edge", {
      resolveExecutor: (node) => {
        if (node.type === "test.Src") {
          return simpleExecutor(() => ({ out: node.id }));
        }
        return simpleExecutor((inputs) => ({ collected: inputs.items }));
      }
    });

    const result = await runner.run(
      { job_id: "j-multi", params: {} },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
  });
});

describe("WorkflowRunner – control edges initialize __control__ handle (lines 270-274)", () => {
  it("sets up __control__ upstream count from control edges", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "controller", type: "test.Controller", is_streaming_output: true },
      { id: "controlled", type: "test.Controlled", is_controlled: true }
    ];
    const edges: Edge[] = [
      {
        source: "controller",
        sourceHandle: "__control__",
        target: "controlled",
        targetHandle: "__control__",
        edge_type: "control"
      }
    ];

    const calls: Array<Record<string, unknown>> = [];
    const runner = new WorkflowRunner("test-ctrl-init", {
      resolveExecutor: (node) => {
        if (node.type === "test.Controller") {
          // Controller emits a RunEvent through __control__ output handle
          return {
            async process() {
              return {};
            },
            async *genProcess() {
              yield {
                __control__: { event_type: "run", properties: { p: 1 } }
              };
            }
          };
        }
        return {
          async process(inputs) {
            calls.push(inputs);
            return { out: "ok" };
          }
        };
      }
    });

    const result = await runner.run(
      { job_id: "j-ctrl-init", params: {} },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("WorkflowRunner – edge without id", () => {
  it("generates edge id from source/target when no id provided", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "mid", type: "test.Pass" },
      { id: "out", type: "test.Output" }
    ];
    // Edges without explicit id
    const edges: Edge[] = [
      {
        source: "in",
        sourceHandle: "value",
        target: "mid",
        targetHandle: "value"
      },
      {
        source: "mid",
        sourceHandle: "value",
        target: "out",
        targetHandle: "value"
      }
    ];

    const runner = new WorkflowRunner("test-edge-id", {
      resolveExecutor: () =>
        simpleExecutor((inputs) => ({ value: inputs.value }))
    });

    const result = await runner.run(
      { job_id: "j-eid", params: { x: 1 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    // Check that edge_update messages use generated ids
    const edgeMsgs = result.messages.filter((m) => m.type === "edge_update");
    expect(edgeMsgs.length).toBeGreaterThan(0);
  });
});

describe("WorkflowRunner – repeated runs on the same instance", () => {
  it("starts each run with fresh outputs and messages", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "input", type: "test.Input", name: "x" },
      { id: "output", type: "test.Output", name: "result" }
    ];
    const edges: Edge[] = [
      {
        source: "input",
        sourceHandle: "value",
        target: "output",
        targetHandle: "value"
      }
    ];

    const runner = new WorkflowRunner("test-repeat", {
      resolveExecutor: () =>
        simpleExecutor((inputs) => ({
          value: inputs.value
        }))
    });

    const first = await runner.run(
      { job_id: "repeat-1", params: { x: 1 } },
      { nodes, edges }
    );
    const firstOutputs = structuredClone(first.outputs);
    const firstMessageValues = first.messages
      .filter((message) => message.type === "output_update")
      .map((message) => message.value);
    const second = await runner.run(
      { job_id: "repeat-2", params: { x: 2 } },
      { nodes, edges }
    );

    expect(firstOutputs.result).toEqual([1]);
    expect(firstMessageValues).toEqual([1]);
    expect(second.outputs.result).toEqual([2]);
    expect(
      second.messages
        .filter((message) => message.type === "output_update")
        .map((message) => message.value)
    ).toEqual([2]);
  });
});

describe("WorkflowRunner – external workflow inputs", () => {
  it("uses the input node property name to resolve runtime params", async () => {
    const nodes: NodeDescriptor[] = [
      {
        id: "input-a",
        type: "nodetool.input.IntegerInput",
        name: "Integer Input",
        properties: { name: "a", value: 0 }
      },
      {
        id: "input-b",
        type: "nodetool.input.IntegerInput",
        name: "Integer Input 2",
        properties: { name: "b", value: 0 }
      },
      { id: "sum", type: "test.Sum", sync_mode: "zip_all" },
      { id: "out", type: "test.Output", name: "result" }
    ];
    const edges: Edge[] = [
      {
        source: "input-a",
        sourceHandle: "output",
        target: "sum",
        targetHandle: "a"
      },
      {
        source: "input-b",
        sourceHandle: "output",
        target: "sum",
        targetHandle: "b"
      },
      {
        source: "sum",
        sourceHandle: "value",
        target: "out",
        targetHandle: "value"
      }
    ];

    const runner = new WorkflowRunner("test-external-input-names", {
      resolveExecutor: (node) => {
        if (node.id === "sum") {
          return simpleExecutor((inputs) => ({
            value: Number(inputs.a ?? 0) + Number(inputs.b ?? 0)
          }));
        }
        return simpleExecutor((inputs) => ({ value: inputs.value }));
      }
    });

    const result = await runner.run(
      { job_id: "j-ext-names", params: { a: 2, b: 3 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    expect(result.outputs.result).toEqual([5]);
  });

  it("uses configured default values for non-streaming input nodes", async () => {
    const nodes: NodeDescriptor[] = [
      {
        id: "input-a",
        type: "nodetool.input.IntegerInput",
        name: "Integer Input",
        properties: { name: "a", value: 4 }
      },
      {
        id: "input-b",
        type: "nodetool.input.IntegerInput",
        name: "Integer Input 2",
        properties: { name: "b", value: 6 }
      },
      { id: "sum", type: "test.Sum", sync_mode: "zip_all" },
      { id: "out", type: "test.Output", name: "result" }
    ];
    const edges: Edge[] = [
      {
        source: "input-a",
        sourceHandle: "output",
        target: "sum",
        targetHandle: "a"
      },
      {
        source: "input-b",
        sourceHandle: "output",
        target: "sum",
        targetHandle: "b"
      },
      {
        source: "sum",
        sourceHandle: "value",
        target: "out",
        targetHandle: "value"
      }
    ];

    const runner = new WorkflowRunner("test-external-input-defaults", {
      resolveExecutor: (node) => {
        if (node.id === "sum") {
          return simpleExecutor((inputs) => ({
            value: Number(inputs.a ?? 0) + Number(inputs.b ?? 0)
          }));
        }
        return simpleExecutor((inputs) => ({ value: inputs.value }));
      }
    });

    const result = await runner.run(
      { job_id: "j-ext-defaults", params: {} },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    expect(result.outputs.result).toEqual([10]);
  });
});

describe("WorkflowRunner._buildControlActionProperties", () => {
  it("maps declared types, infers from values, and attaches meta/default", () => {
    const node: NodeDescriptor = {
      id: "c",
      type: "test.Controlled",
      propertyTypes: {
        i: "int",
        f: "float",
        b: "bool",
        lst: "list[str]",
        dct: "dict[str,int]",
        s: "str"
      },
      properties: {
        i: 5,
        f: 1.5,
        b: true,
        lst: [],
        dct: {},
        s: "hi",
        numNoType: 3,
        floatNoType: 2.5,
        boolNoType: false,
        _hidden: 1,
        undef: undefined
      },
      propertyMeta: { i: { description: "the i", min: 0, max: 10 } }
    } as NodeDescriptor;

    const result = internals(bareRunner())._buildControlActionProperties(node);

    expect(result._hidden).toBeUndefined(); // underscore-prefixed skipped
    expect(result.i).toEqual({
      type: "integer",
      description: "the i",
      default: 5,
      minimum: 0,
      maximum: 10
    });
    expect(result.f).toEqual({
      type: "number",
      description: "Property 'f' (float)",
      default: 1.5
    });
    expect(result.b).toEqual({
      type: "boolean",
      description: "Property 'b' (bool)",
      default: true
    });
    expect(result.lst).toEqual({
      type: "array",
      description: "Property 'lst' (list[str])",
      default: []
    });
    expect(result.dct).toEqual({
      type: "object",
      description: "Property 'dct' (dict[str,int])",
      default: {}
    });
    expect(result.s.type).toBe("string");
    // Type inferred from the value when no declared type is present:
    expect(result.numNoType).toEqual({
      type: "integer",
      description: "Property 'numNoType' (integer)",
      default: 3
    });
    expect(result.floatNoType.type).toBe("number");
    expect(result.boolNoType).toEqual({
      type: "boolean",
      description: "Property 'boolNoType' (boolean)",
      default: false
    });
    // undefined value → no default key
    expect(result.undef).toEqual({
      type: "string",
      description: "Property 'undef' (string)"
    });
  });
});

describe("WorkflowRunner._buildControlContext", () => {
  const withGraph = (nodes: NodeDescriptor[], edges: Edge[]) => {
    const r = bareRunner();
    internals(r)._graph = new Graph({ nodes, edges });
    return internals(r);
  };
  const ctrlEdge = (source: string, target: string): Edge => ({
    source,
    sourceHandle: "ctrl",
    target,
    targetHandle: "__control__",
    edge_type: "control"
  });

  it("returns null for a node with no outgoing control edges", () => {
    const r = withGraph(
      [
        { id: "a", type: "t" },
        { id: "b", type: "t" }
      ],
      [{ source: "a", sourceHandle: "out", target: "b", targetHandle: "in" }]
    );
    expect(r._buildControlContext("a")).toBeNull();
  });

  it("describes each controlled target with its properties and run action", () => {
    const nodes: NodeDescriptor[] = [
      { id: "ctrlr", type: "t" },
      {
        id: "tgt",
        type: "test.Sink",
        name: "Sink Title",
        properties: { gain: 2, _secret: 9 },
        propertyTypes: { gain: "int" },
        propertyMeta: { gain: { description: "the gain", min: 1, max: 4 } }
      }
    ];
    const r = withGraph(nodes, [ctrlEdge("ctrlr", "tgt")]);

    const ctx = r._buildControlContext("ctrlr") as Record<
      string,
      Record<string, unknown>
    >;
    expect(ctx).not.toBeNull();
    const tgt = ctx.tgt;
    expect(tgt.node_id).toBe("tgt");
    expect(tgt.node_type).toBe("test.Sink");
    expect(tgt.node_title).toBe("Sink Title");
    expect(tgt.properties).toEqual({
      gain: { value: 2, type: "int", description: "the gain", min: 1, max: 4 }
    });
    expect(
      (tgt.control_actions as Record<string, Record<string, unknown>>).run
        .properties
    ).toHaveProperty("gain");
  });

  it("falls back to the node id for the title when unnamed", () => {
    const nodes: NodeDescriptor[] = [
      { id: "ctrlr", type: "t" },
      { id: "tgt", type: "t", properties: { a: 1 } }
    ];
    const r = withGraph(nodes, [ctrlEdge("ctrlr", "tgt")]);
    const ctx = r._buildControlContext("ctrlr") as Record<
      string,
      Record<string, unknown>
    >;
    expect(ctx.tgt.node_title).toBe("tgt");
  });
});

describe("WorkflowRunner – node predicates", () => {
  const withGraph = (nodes: NodeDescriptor[], edges: Edge[]) => {
    const r = bareRunner();
    internals(r)._graph = new Graph({ nodes, edges });
    return internals(r);
  };

  it("_isOutputNode is true only when a node has no outgoing DATA edges", () => {
    const nodes: NodeDescriptor[] = [
      { id: "a", type: "t" },
      { id: "b", type: "t" },
      { id: "sink", type: "t" }
    ];
    const edges: Edge[] = [
      { source: "a", sourceHandle: "o", target: "sink", targetHandle: "i" },
      // a's only OTHER outgoing edge is a control edge — must be ignored.
      {
        source: "a",
        sourceHandle: "ctrl",
        target: "b",
        targetHandle: "__control__",
        edge_type: "control"
      }
    ];
    const r = withGraph(nodes, edges);
    expect(r._isOutputNode(nodes[0])).toBe(false); // a has a data edge to sink
    expect(r._isOutputNode(nodes[2])).toBe(true); // sink has no outgoing edges
    // b has only an incoming control edge — no outgoing data edges → output.
    expect(r._isOutputNode(nodes[1])).toBe(true);
  });

  it("_isExternalInputNode recognizes input node types", () => {
    const r = internals(bareRunner());
    expect(r._isExternalInputNode({ id: "x", type: "test.Input" })).toBe(true);
    expect(
      r._isExternalInputNode({ id: "x", type: "nodetool.input.Text" })
    ).toBe(true);
    expect(r._isExternalInputNode({ id: "x", type: "test.Other" })).toBe(false);
  });

  it("_getExternalInputName prefers a string properties.name, else node.name, else id", () => {
    const r = internals(bareRunner());
    expect(
      r._getExternalInputName({
        id: "x",
        type: "test.Input",
        properties: { name: "  fromProp  " }
      } as NodeDescriptor)
    ).toBe("fromProp");
    expect(
      r._getExternalInputName({ id: "x", type: "test.Input", name: "fromName" })
    ).toBe("fromName");
    expect(r._getExternalInputName({ id: "x", type: "test.Input" })).toBe("x");
  });
});
