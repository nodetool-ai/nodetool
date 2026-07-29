/**
 * Additional WorkflowRunner tests for coverage:
 *  - dispatchControlEvent
 *  - dispatchControlEventToTarget
 *  - pushInputValue / finishInputStream errors
 *  - control edges in graph
 */

import { describe, it, expect } from "vitest";
import { WorkflowRunner } from "../src/runner.js";
import { Graph, GraphValidationError } from "../src/graph.js";
import { NodeInbox } from "../src/inbox.js";
import type { NodeDescriptor, Edge, ControlEvent } from "@nodetool-ai/protocol";
import type { NodeExecutor } from "../src/actor.js";

type RunnerInternals = {
  _graph: Graph;
  _messages: unknown[];
  _multiEdgeListInputs: Map<string, Set<string>>;
  _buildControlContext(nodeId: string): Record<string, unknown> | null;
  _buildControlActionProperties(
    node: NodeDescriptor
  ): Record<string, Record<string, unknown>>;
  _isOutputNode(node: NodeDescriptor): boolean;
  _isExternalInputNode(node: NodeDescriptor): boolean;
  _getExternalInputName(node: NodeDescriptor): string;
  _detectMultiEdgeListInputs(): void;
  _validateNodes(): void;
  _filterInvalidEdges(): void;
  _incrementEdgeCounter(edge: Edge): void;
  _flushEdgeCounters(): void;
  _emit(msg: unknown): void;
  _resolveInputNodes(name: string): NodeDescriptor[];
  _inboxes: Map<string, NodeInbox>;
  _sendMessages(
    sourceNodeId: string,
    outputs: Record<string, unknown>,
    routingHints?: Record<string, unknown>
  ): Promise<void>;
  _sendEOS(nodeId: string): Promise<void>;
  _routeControlOutput(sourceNodeId: string, controlOutput: unknown): Promise<void>;
  _drainActiveEdges(): void;
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
        // IntegerInput emits on its "output" handle — the handle the outgoing
        // edges read. Emitting there (not "value") keeps the double honest now
        // that the runner no longer leaks the raw input value onto edges whose
        // sourceHandle the process() record omits.
        if (node.type === "nodetool.input.IntegerInput") {
          return simpleExecutor((inputs) => ({ output: inputs.value }));
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
        // IntegerInput emits on its "output" handle (see the note in the
        // sibling test) so the outgoing edges receive its value.
        if (node.type === "nodetool.input.IntegerInput") {
          return simpleExecutor((inputs) => ({ output: inputs.value }));
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

describe("WorkflowRunner._detectMultiEdgeListInputs", () => {
  it("marks only list-typed handles that receive multiple data edges", () => {
    const nodes: NodeDescriptor[] = [
      { id: "a", type: "t" },
      { id: "b", type: "t" },
      {
        id: "sink",
        type: "t",
        propertyTypes: { lst: "list[int]", scalar: "int" }
      }
    ];
    const edges: Edge[] = [
      { source: "a", sourceHandle: "o", target: "sink", targetHandle: "lst" },
      { source: "b", sourceHandle: "o", target: "sink", targetHandle: "lst" },
      { source: "a", sourceHandle: "o", target: "sink", targetHandle: "scalar" },
      { source: "b", sourceHandle: "o", target: "sink", targetHandle: "scalar" },
      // a control edge into the same list handle must not be counted
      {
        source: "a",
        sourceHandle: "ctrl",
        target: "sink",
        targetHandle: "lst",
        edge_type: "control"
      }
    ];
    const r = bareRunner();
    internals(r)._graph = new Graph({ nodes, edges });
    internals(r)._detectMultiEdgeListInputs();

    const marked = internals(r)._multiEdgeListInputs.get("sink");
    expect(marked).toBeDefined();
    expect(marked!.has("lst")).toBe(true);
    expect(marked!.has("scalar")).toBe(false);
  });
});

describe("WorkflowRunner._validateNodes", () => {
  it("does nothing when no validator is configured", () => {
    const r = bareRunner();
    internals(r)._graph = new Graph({ nodes: [{ id: "a", type: "t" }], edges: [] });
    expect(() => internals(r)._validateNodes()).not.toThrow();
  });

  it("passes incoming data-edge handles to the validator and aggregates issues", () => {
    const seen: Array<{ id: string; handles: string[] }> = [];
    const r = new WorkflowRunner("v", {
      resolveExecutor: () => ({
        async process() {
          return {};
        }
      }),
      validateNode: (node, handles) => {
        seen.push({ id: node.id, handles: [...handles].sort() });
        return node.id === "bad"
          ? [{ message: "boom", property: "p" }]
          : [];
      }
    });
    const nodes: NodeDescriptor[] = [
      { id: "src", type: "t" },
      { id: "bad", type: "test.Bad" }
    ];
    const edges: Edge[] = [
      { source: "src", sourceHandle: "o", target: "bad", targetHandle: "h1" },
      { source: "src", sourceHandle: "o", target: "bad", targetHandle: "h2" }
    ];
    internals(r)._graph = new Graph({ nodes, edges });

    let caught: GraphValidationError | undefined;
    try {
      internals(r)._validateNodes();
    } catch (err) {
      caught = err as GraphValidationError;
    }
    expect(caught).toBeInstanceOf(GraphValidationError);
    expect(caught!.message).toMatch(/1 issue\(s\)/);
    expect(caught!.message).toMatch(/boom on node "bad" \(test\.Bad\)/);
    expect(caught!.issues).toEqual([
      { nodeId: "bad", nodeType: "test.Bad", property: "p", message: "boom" }
    ]);
    // The "bad" node's two incoming data-edge handles were passed through.
    expect(seen.find((s) => s.id === "bad")!.handles).toEqual(["h1", "h2"]);
  });
});

describe("WorkflowRunner._filterInvalidEdges", () => {
  it("drops edges that reference a missing node", () => {
    const r = bareRunner();
    internals(r)._graph = new Graph({
      nodes: [{ id: "a", type: "t" }, { id: "b", type: "t" }],
      edges: [
        { source: "a", sourceHandle: "o", target: "b", targetHandle: "i" },
        { source: "a", sourceHandle: "o", target: "ghost", targetHandle: "i" }
      ]
    });
    internals(r)._filterInvalidEdges();
    expect(internals(r)._graph.edges).toHaveLength(1);
    expect(internals(r)._graph.edges[0].target).toBe("b");
  });
});

describe("WorkflowRunner edge counters", () => {
  it("emits the first edge_update immediately and flushes the throttled final", () => {
    const r = bareRunner();
    const edge: Edge = { id: "e1", source: "a", sourceHandle: "o", target: "b", targetHandle: "i" };

    internals(r)._incrementEdgeCounter(edge); // counter 1 -> emitted
    internals(r)._incrementEdgeCounter(edge); // counter 2 -> throttled (dirty)

    const afterTwo = internals(r)._messages.filter(
      (m) => (m as { type?: string }).type === "edge_update"
    );
    expect(afterTwo).toHaveLength(1);
    expect(afterTwo[0]).toMatchObject({ edge_id: "e1", counter: 1, status: "active" });

    internals(r)._flushEdgeCounters(); // emits the exact final counter
    const all = internals(r)._messages.filter(
      (m) => (m as { type?: string }).type === "edge_update"
    );
    expect(all).toHaveLength(2);
    expect(all[1]).toMatchObject({ edge_id: "e1", counter: 2 });
  });

  it("derives an edge id from endpoints when the edge has no id", () => {
    const r = bareRunner();
    const edge: Edge = { source: "a", sourceHandle: "o", target: "b", targetHandle: "i" };
    internals(r)._incrementEdgeCounter(edge);
    const msg = internals(r)._messages.find(
      (m) => (m as { type?: string }).type === "edge_update"
    ) as { edge_id: string };
    expect(msg.edge_id).toBe("a:o->b:i");
  });
});

describe("WorkflowRunner._emit – audio-chunk firehose is not retained", () => {
  it("retains ordinary messages but drops streamed audio-chunk output updates", () => {
    const r = bareRunner();
    const audio = {
      type: "output_update",
      value: { type: "chunk", content_type: "audio" }
    };
    const textChunk = {
      type: "output_update",
      value: { type: "chunk", content_type: "text" }
    };
    const noValue = { type: "output_update" };
    const normal = { type: "node_update", status: "completed" };

    internals(r)._emit(audio); // dropped
    internals(r)._emit(textChunk); // retained (not audio)
    internals(r)._emit(noValue); // retained (no value object)
    internals(r)._emit(normal); // retained (not an output_update)

    expect(internals(r)._messages).toEqual([textChunk, noValue, normal]);
  });
});

describe("WorkflowRunner._resolveInputNodes", () => {
  it("matches input nodes by external name or by id", () => {
    const nodes: NodeDescriptor[] = [
      { id: "in1", type: "test.Input", properties: { name: "alpha" } },
      { id: "in2", type: "test.Input" }, // name falls back to id
      { id: "mid", type: "t" }
    ];
    const edges: Edge[] = [
      { source: "in1", sourceHandle: "value", target: "mid", targetHandle: "a" }
    ];
    const r = bareRunner();
    internals(r)._graph = new Graph({ nodes, edges });

    expect(internals(r)._resolveInputNodes("alpha").map((n) => n.id)).toEqual(["in1"]);
    expect(internals(r)._resolveInputNodes("in2").map((n) => n.id)).toEqual(["in2"]);
    expect(internals(r)._resolveInputNodes("nope")).toEqual([]);
  });
});

describe("WorkflowRunner._sendMessages – control-edge routing", () => {
  const setup = (controllerOutHandle: string) => {
    const r = bareRunner();
    const inbox = new NodeInbox();
    inbox.addUpstream("__control__", 1);
    internals(r)._inboxes = new Map([["controlled", inbox]]);
    internals(r)._graph = new Graph({
      nodes: [
        { id: "controller", type: "t" },
        { id: "controlled", type: "t" }
      ],
      edges: [
        {
          source: "controller",
          sourceHandle: controllerOutHandle,
          target: "controlled",
          targetHandle: "__control__",
          edge_type: "control"
        }
      ]
    });
    return { r, inbox };
  };

  it("wraps a raw property dict as a run event", async () => {
    const { r, inbox } = setup("cmd");
    await internals(r)._sendMessages("controller", { cmd: { brightness: 5 } });
    expect(inbox.drainHandle("__control__").map((e) => e.data)).toEqual([
      { event_type: "run", properties: { brightness: 5 } }
    ]);
  });

  it("unwraps a nested { properties } shape", async () => {
    const { r, inbox } = setup("cmd");
    await internals(r)._sendMessages("controller", {
      cmd: { properties: { gain: 2 } }
    });
    expect(inbox.drainHandle("__control__").map((e) => e.data)).toEqual([
      { event_type: "run", properties: { gain: 2 } }
    ]);
  });

  it("passes through a value that already has a string event_type", async () => {
    const { r, inbox } = setup("cmd");
    const event = { event_type: "stop", properties: {} };
    await internals(r)._sendMessages("controller", { cmd: event });
    expect(inbox.drainHandle("__control__").map((e) => e.data)).toEqual([event]);
  });

  it("skips non-object and undefined control values", async () => {
    const { r, inbox } = setup("cmd");
    await internals(r)._sendMessages("controller", { cmd: "not-an-object" });
    await internals(r)._sendMessages("controller", { other: 1 }); // no cmd
    expect(inbox.drainHandle("__control__")).toEqual([]);
  });
});

describe("WorkflowRunner._sendMessages – data delivery", () => {
  it("delivers values to the target inbox and increments the edge counter", async () => {
    const r = bareRunner();
    const inbox = new NodeInbox();
    inbox.addUpstream("in", 1);
    internals(r)._inboxes = new Map([["b", inbox]]);
    internals(r)._graph = new Graph({
      nodes: [
        { id: "a", type: "t", outputs: { value: "int" } },
        { id: "b", type: "t" }
      ],
      edges: [
        { id: "e1", source: "a", sourceHandle: "value", target: "b", targetHandle: "in" }
      ]
    });

    await internals(r)._sendMessages("a", { value: 42, skip: undefined });

    expect(inbox.drainHandle("in").map((e) => e.data)).toEqual([42]);
    const edgeMsgs = internals(r)._messages.filter(
      (m) => (m as { type?: string }).type === "edge_update"
    );
    expect(edgeMsgs).toHaveLength(1);
    expect(edgeMsgs[0]).toMatchObject({ edge_id: "e1", counter: 1 });
  });
});

describe("WorkflowRunner._sendMessages – output_update emission", () => {
  const emitFor = async (
    node: NodeDescriptor,
    outputs: Record<string, unknown>,
    extraNodes: NodeDescriptor[] = [],
    extraEdges: Edge[] = []
  ) => {
    const r = bareRunner();
    internals(r)._inboxes = new Map();
    internals(r)._graph = new Graph({
      nodes: [node, ...extraNodes],
      edges: extraEdges
    });
    await internals(r)._sendMessages(node.id, outputs);
    return internals(r)._messages.filter(
      (m) => (m as { type?: string }).type === "output_update"
    ) as Array<{ output_name: string; value: unknown; output_type: string }>;
  };

  it("maps an Output node's handle to its workflow name", async () => {
    const msgs = await emitFor(
      {
        id: "o",
        type: "nodetool.output.Output",
        name: "ignored",
        properties: { name: "result" },
        outputs: { output: "int" }
      },
      { output: 7 }
    );
    expect(msgs).toHaveLength(1);
    expect(msgs[0].output_name).toBe("result");
    expect(msgs[0].value).toBe(7);
    expect(msgs[0].output_type).toBe("int");
  });

  it("falls back to the handle when an Output node has no workflow name", async () => {
    const msgs = await emitFor(
      { id: "o", type: "x.output.Output", outputs: {} },
      { output: 1 }
    );
    expect(msgs[0].output_name).toBe("output");
  });

  it("maps Preview nodes by workflow name and plain nodes by handle", async () => {
    const prev = await emitFor(
      {
        id: "p",
        type: "nodetool.workflows.base_node.Preview",
        properties: { name: "peek" }
      },
      { output: 1 }
    );
    expect(prev[0].output_name).toBe("peek");

    const plain = await emitFor({ id: "n", type: "test.Plain" }, { out: 5 });
    expect(plain[0].output_name).toBe("out");
  });

  it("skips output_update for constant and input nodes", async () => {
    expect(
      await emitFor({ id: "c", type: "nodetool.constant.Number" }, { output: 1 })
    ).toHaveLength(0);
    expect(
      await emitFor({ id: "i", type: "nodetool.input.Text" }, { output: "x" })
    ).toHaveLength(0);
  });

  it("skips handles that have an outgoing data edge unless always_emit is set", async () => {
    // Plain node with a data edge on "out" → suppressed.
    const suppressed = await emitFor(
      { id: "a", type: "test.Plain", outputs: { out: "any" } },
      { out: 1 },
      [{ id: "b", type: "t" }],
      [{ source: "a", sourceHandle: "out", target: "b", targetHandle: "in" }]
    );
    expect(suppressed).toHaveLength(0);

    // Same graph but always_emit_output_updates → emitted anyway.
    const emitted = await emitFor(
      {
        id: "a",
        type: "test.Plain",
        outputs: { out: "any" },
        always_emit_output_updates: true
      } as NodeDescriptor,
      { out: 1 },
      [{ id: "b", type: "t" }],
      [{ source: "a", sourceHandle: "out", target: "b", targetHandle: "in" }]
    );
    expect(emitted).toHaveLength(1);
  });
});

describe("WorkflowRunner._sendEOS", () => {
  it("closes data handles once, dedups control targets, and emits completed", async () => {
    const r = bareRunner();
    const inB = new NodeInbox();
    inB.addUpstream("in", 1);
    const inC = new NodeInbox();
    inC.addUpstream("__control__", 2); // two controllers feed c
    internals(r)._inboxes = new Map([
      ["b", inB],
      ["c", inC]
    ]);
    internals(r)._graph = new Graph({
      nodes: [
        { id: "a", type: "t" },
        { id: "b", type: "t" },
        { id: "c", type: "t" }
      ],
      edges: [
        { id: "ed", source: "a", sourceHandle: "o", target: "b", targetHandle: "in" },
        { source: "a", sourceHandle: "c1", target: "c", targetHandle: "__control__", edge_type: "control" },
        { source: "a", sourceHandle: "c2", target: "c", targetHandle: "__control__", edge_type: "control" }
      ]
    });

    await internals(r)._sendEOS("a");

    expect(inB.isOpen("in")).toBe(false); // data handle closed
    // Only one of c's two __control__ upstreams decremented (per-target dedup).
    expect(inC.isOpen("__control__")).toBe(true);

    const completed = internals(r)._messages.filter(
      (m) =>
        (m as { type?: string; status?: string }).type === "edge_update" &&
        (m as { status?: string }).status === "completed"
    );
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({ edge_id: "ed" });
  });
});

describe("WorkflowRunner._routeControlOutput", () => {
  const setup = () => {
    const r = bareRunner();
    const inbox = new NodeInbox();
    inbox.addUpstream("__control__", 1);
    internals(r)._inboxes = new Map([["controlled", inbox]]);
    internals(r)._graph = new Graph({
      nodes: [
        { id: "ctrl", type: "t" },
        { id: "controlled", type: "t" }
      ],
      edges: [
        { source: "ctrl", sourceHandle: "c", target: "controlled", targetHandle: "__control__", edge_type: "control" }
      ]
    });
    return { r, inbox };
  };

  it("wraps a raw dict, and unwraps a nested properties wrapper", async () => {
    const { r, inbox } = setup();
    await internals(r)._routeControlOutput("ctrl", { brightness: 9 });
    await internals(r)._routeControlOutput("ctrl", { properties: { gain: 3 } });
    expect(inbox.drainHandle("__control__").map((e) => e.data)).toEqual([
      { event_type: "run", properties: { brightness: 9 } },
      { event_type: "run", properties: { gain: 3 } }
    ]);
  });

  it("ignores non-object control output", async () => {
    const { r, inbox } = setup();
    await internals(r)._routeControlOutput("ctrl", "nope");
    await internals(r)._routeControlOutput("ctrl", null);
    expect(inbox.drainHandle("__control__")).toEqual([]);
  });
});

describe("WorkflowRunner._drainActiveEdges", () => {
  it("posts a drained update for edges whose target still has buffered or open input", async () => {
    const r = bareRunner();
    const inB = new NodeInbox();
    inB.addUpstream("in", 1);
    await inB.put("in", 1); // buffered → active
    const inC = new NodeInbox();
    inC.addUpstream("in", 1);
    inC.markSourceDone("in"); // not open, not buffered → quiet
    internals(r)._inboxes = new Map([
      ["b", inB],
      ["c", inC]
    ]);
    internals(r)._graph = new Graph({
      nodes: [
        { id: "a", type: "t" },
        { id: "b", type: "t" },
        { id: "c", type: "t" }
      ],
      edges: [
        { id: "e1", source: "a", sourceHandle: "o", target: "b", targetHandle: "in" },
        { id: "e2", source: "a", sourceHandle: "o", target: "c", targetHandle: "in" }
      ]
    });

    internals(r)._drainActiveEdges();

    const drained = internals(r)._messages.filter(
      (m) => (m as { status?: string }).status === "drained"
    );
    expect(drained).toHaveLength(1);
    expect(drained[0]).toMatchObject({ edge_id: "e1" });
  });
});

describe("WorkflowRunner.run – job lifecycle and failure paths", () => {
  it("propagates the request workflow_id into every job_update", async () => {
    const runner = new WorkflowRunner("wfid", {
      resolveExecutor: () => simpleExecutor((i) => i)
    });
    const result = await runner.run(
      { job_id: "j", workflow_id: "wf-123", params: { x: 1 } },
      {
        nodes: [
          { id: "in", type: "test.Input", name: "x" },
          { id: "out", type: "test.Output", name: "r" }
        ],
        edges: [
          { source: "in", sourceHandle: "value", target: "out", targetHandle: "value" }
        ]
      }
    );
    const jobMsgs = result.messages.filter(
      (m) => (m as { type?: string }).type === "job_update"
    ) as Array<{ workflow_id: unknown }>;
    expect(jobMsgs.length).toBeGreaterThan(0);
    for (const m of jobMsgs) expect(m.workflow_id).toBe("wf-123");
  });

  it("fails the run when pre-flight node validation reports issues", async () => {
    const runner = new WorkflowRunner("vfail", {
      resolveExecutor: () => simpleExecutor(() => ({})),
      validateNode: (node) =>
        node.id === "bad" ? [{ message: "missing field", property: "p" }] : []
    });
    const result = await runner.run(
      { job_id: "jv" },
      { nodes: [{ id: "bad", type: "test.Bad" }], edges: [] }
    );
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/missing field/);
  });

  it("fails the run when correlation analysis reports an issue (data self-loop)", async () => {
    const runner = new WorkflowRunner("cfail", {
      resolveExecutor: () => simpleExecutor(() => ({}))
    });
    const result = await runner.run(
      { job_id: "jc" },
      {
        nodes: [{ id: "a", type: "test.Node", outputs: { value: "any" } }],
        edges: [
          { source: "a", sourceHandle: "value", target: "a", targetHandle: "in" }
        ]
      }
    );
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/Correlation analysis failed|Cycle/);
  });
});
