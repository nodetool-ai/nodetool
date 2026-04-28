/**
 * Regression tests for parity gaps #3 and #14 — these tests document expected
 * Python-parity behavior. Some will fail until the gaps are fixed.
 *
 * Gap #3: Graph Validation Pipeline
 *   Python runs: (1) _filter_invalid_edges (removes edges with missing
 *   source/target nodes), (2) validate_graph with type compatibility checking.
 *   TypeScript only calls graph.validate() which checks endpoint existence but
 *   NOT type compatibility and does NOT remove invalid edges before execution.
 *
 * Gap #14: Graph Deserialization
 *   Python's Graph.from_dict() has skip_errors flag, property filtering for
 *   nodes with incoming edges, and allow_undefined_properties flag. TypeScript
 *   constructs Graph directly with no validation during load.
 */

import { describe, it, expect } from "vitest";
import { Graph, GraphValidationError } from "../src/graph.js";
import { WorkflowRunner } from "../src/runner.js";
import type { NodeDescriptor, Edge } from "@nodetool-ai/protocol";
import type { NodeExecutor } from "../src/actor.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(
  id: string,
  overrides: Partial<NodeDescriptor> = {}
): NodeDescriptor {
  return { id, type: `test.${id}`, ...overrides };
}

function makeEdge(
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
  overrides: Partial<Edge> = {}
): Edge {
  return { source, sourceHandle, target, targetHandle, ...overrides };
}

function simpleExecutor(
  fn: (inputs: Record<string, unknown>) => Record<string, unknown>
): NodeExecutor {
  return {
    async process(inputs) {
      return fn(inputs);
    }
  };
}

function makeRunner(executorMap: Record<string, NodeExecutor>): WorkflowRunner {
  return new WorkflowRunner("test-job", {
    resolveExecutor: (node) => {
      const exec = executorMap[node.id] ?? executorMap[node.type];
      if (!exec) {
        return simpleExecutor(() => ({}));
      }
      return exec;
    }
  });
}

// ===========================================================================
// Gap #3: Graph Validation Pipeline
// ===========================================================================

describe("Gap #3 – _filter_invalid_edges (silent removal of dangling edges)", () => {
  it("runner silently removes edges with non-existent source nodes", async () => {
    // Python behavior: _filter_invalid_edges removes edges that reference
    // missing nodes, then proceeds with execution.
    const nodes: NodeDescriptor[] = [
      { id: "a", type: "test.Input", name: "a_in" },
      { id: "b", type: "test.Output", name: "result" }
    ];
    const edges: Edge[] = [
      makeEdge("a", "out", "b", "in"),
      makeEdge("ghost", "out", "b", "extra") // dangling source
    ];

    const runner = makeRunner({
      "test.Output": simpleExecutor((inputs) => ({ value: inputs.in }))
    });

    const result = await runner.run(
      { job_id: "j1", params: { a_in: 42 } },
      { nodes, edges }
    );
    expect(result.status).toBe("completed");
  });

  it("runner silently removes edges with non-existent target nodes", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "a", type: "test.Input", name: "a_in" },
      { id: "b", type: "test.Output", name: "result" }
    ];
    const edges: Edge[] = [
      makeEdge("a", "out", "b", "in"),
      makeEdge("a", "extra", "ghost", "in") // dangling target
    ];

    const runner = makeRunner({
      "test.Output": simpleExecutor((inputs) => ({ value: inputs.in }))
    });

    const result = await runner.run(
      { job_id: "j1", params: { a_in: 7 } },
      { nodes, edges }
    );
    expect(result.status).toBe("completed");
  });

  it("runner should complete when graph has dangling edges (after filtering)", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "out", type: "test.Output", name: "result" }
    ];
    const edges: Edge[] = [
      {
        source: "in",
        sourceHandle: "value",
        target: "out",
        targetHandle: "value"
      },
      {
        source: "ghost",
        sourceHandle: "out",
        target: "out",
        targetHandle: "extra"
      } // dangling
    ];

    const runner = makeRunner({
      "test.Output": simpleExecutor((inputs) => ({ value: inputs.value }))
    });

    const result = await runner.run(
      { job_id: "j1", params: { x: 42 } },
      { nodes, edges }
    );
    expect(result.status).toBe("completed");
    expect(result.outputs.result).toContain(42);
  });

  it("should remove ALL dangling edges and keep valid ones", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "a", type: "test.Input", name: "a_in" },
      { id: "b", type: "test.Proc" },
      { id: "c", type: "test.Output", name: "result" }
    ];
    const edges: Edge[] = [
      makeEdge("a", "out", "b", "in"), // valid
      makeEdge("b", "out", "c", "in"), // valid
      makeEdge("ghost1", "out", "b", "extra"), // dangling source
      makeEdge("c", "out", "ghost2", "in"), // dangling target
      makeEdge("ghost1", "out", "ghost2", "in") // both dangling
    ];

    const runner = makeRunner({
      "test.Proc": simpleExecutor((inputs) => ({ out: inputs.in })),
      "test.Output": simpleExecutor((inputs) => ({ value: inputs.in }))
    });

    const result = await runner.run(
      { job_id: "j1", params: { a_in: 99 } },
      { nodes, edges }
    );
    expect(result.status).toBe("completed");
  });
});

describe("Gap #3 – type compatibility checking (validateEdgeTypes)", () => {
  it("rejects edge connecting incompatible types (image output to str input)", () => {
    const nodes = [
      makeNode("a", { outputs: { out: "image" } }),
      makeNode("b", { properties: { in: { type: "str" } } })
    ];
    const edges = [makeEdge("a", "out", "b", "in")];
    const graph = new Graph({ nodes, edges });
    expect(() => graph.validateEdgeTypes()).toThrow(GraphValidationError);
    expect(() => graph.validateEdgeTypes()).toThrow(/Type mismatch/);
  });

  it("accepts edge connecting compatible types (int output to float input)", () => {
    const nodes = [
      makeNode("a", { outputs: { out: "int" } }),
      makeNode("b", { properties: { in: { type: "float" } } })
    ];
    const edges = [makeEdge("a", "out", "b", "in")];
    const graph = new Graph({ nodes, edges });
    expect(() => graph.validateEdgeTypes()).not.toThrow();
  });

  it("accepts edge connecting same types", () => {
    const nodes = [
      makeNode("a", { outputs: { out: "int" } }),
      makeNode("b", { properties: { in: { type: "int" } } })
    ];
    const edges = [makeEdge("a", "out", "b", "in")];
    const graph = new Graph({ nodes, edges });
    expect(() => graph.validateEdgeTypes()).not.toThrow();
  });

  it("accepts edge where either type is 'any'", () => {
    const nodes = [
      makeNode("a", { outputs: { out: "image" } }),
      makeNode("b", { properties: { in: { type: "any" } } })
    ];
    const edges = [makeEdge("a", "out", "b", "in")];
    const graph = new Graph({ nodes, edges });
    expect(() => graph.validateEdgeTypes()).not.toThrow();
  });

  it("skips type check when type info is missing", () => {
    const nodes = [
      makeNode("a"), // no outputs type info
      makeNode("b", { properties: { in: { type: "str" } } })
    ];
    const edges = [makeEdge("a", "out", "b", "in")];
    const graph = new Graph({ nodes, edges });
    expect(() => graph.validateEdgeTypes()).not.toThrow();
  });
});

// ===========================================================================
// Gap #14: Graph Deserialization
// ===========================================================================

describe("Gap #14 – Graph.fromDict() with skip_errors", () => {
  it("should drop unrecognized node types when skip_errors=true", () => {
    // Python: Graph.from_dict(data, skip_errors=True) silently drops nodes
    // whose types are not registered. TypeScript's fromDict() supports the
    // same via the validateNodeType callback: unknown types are dropped when
    // skipErrors=true.
    const data = {
      nodes: [
        { id: "known", type: "test.KnownType" },
        { id: "unknown", type: "test.UnknownType" }
      ],
      edges: []
    };

    const graph = Graph.fromDict(data, {
      skipErrors: true,
      validateNodeType: (type) => type === "test.KnownType"
    });

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].id).toBe("known");
  });

  it("should also remove edges connected to dropped nodes when skip_errors=true", () => {
    // When a node is dropped due to unrecognized type, all edges that
    // reference that node (as source or target) must also be dropped.
    const data = {
      nodes: [
        { id: "known", type: "test.KnownType" },
        { id: "unknown", type: "test.UnknownType" }
      ],
      edges: [
        // Edge pointing FROM the dropped node
        {
          source: "unknown",
          sourceHandle: "out",
          target: "known",
          targetHandle: "in"
        },
        // Edge pointing TO the dropped node
        {
          source: "known",
          sourceHandle: "out",
          target: "unknown",
          targetHandle: "in"
        }
      ]
    };

    const graph = Graph.fromDict(data, {
      skipErrors: true,
      validateNodeType: (type) => type === "test.KnownType"
    });

    expect(graph.nodes).toHaveLength(1);
    // Both edges reference "unknown" which was dropped, so both are removed
    expect(graph.edges).toHaveLength(0);
  });

  it("should throw on unrecognized node types when skip_errors=false", () => {
    // Python: Graph.from_dict(data) without skip_errors raises an error
    // when encountering unknown node types. TypeScript's fromDict() supports
    // the same via validateNodeType callback with skipErrors=false.
    const data = {
      nodes: [{ id: "a", type: "test.UnknownType" }],
      edges: []
    };

    expect(() =>
      Graph.fromDict(data, {
        skipErrors: false,
        validateNodeType: (type) => type === "test.KnownType"
      })
    ).toThrow(GraphValidationError);

    expect(() =>
      Graph.fromDict(data, {
        skipErrors: false,
        validateNodeType: (type) => type === "test.KnownType"
      })
    ).toThrow(/Invalid node type/);
  });
});

describe("Gap #14 – property filtering for nodes with incoming edges", () => {
  it("nodes with incoming edges should have those property values overridden by edge data", async () => {
    // Python behavior: When a node has a property value AND an incoming edge
    // for that same property, the edge value takes precedence. During
    // deserialization, Python filters out the static property value for
    // properties that receive input via an edge.
    //
    // TypeScript: No such filtering exists. The node's static property
    // value is passed through, and the edge value overwrites it at runtime.
    // The runner does handle this correctly at runtime (edge values override
    // node properties), so this test documents that the runtime behavior
    // is already correct even without explicit deserialization filtering.
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      {
        id: "proc",
        type: "test.Proc",
        properties: { value: 999 } // static property that should be overridden
      },
      { id: "out", type: "test.Output", name: "result" }
    ];
    const edges: Edge[] = [
      {
        source: "in",
        sourceHandle: "value",
        target: "proc",
        targetHandle: "value"
      },
      {
        source: "proc",
        sourceHandle: "result",
        target: "out",
        targetHandle: "value"
      }
    ];

    const runner = makeRunner({
      "test.Proc": simpleExecutor((inputs) => ({
        result: inputs.value // should receive edge value (5), not static (999)
      })),
      "test.Output": simpleExecutor((inputs) => ({
        value: inputs.value
      }))
    });

    const result = await runner.run(
      { job_id: "j2", params: { x: 5 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    // The edge value (5) should take precedence over the static property (999).
    // This works at runtime because the runner dispatches edge values, which
    // override whatever was in the node's properties.
    expect(result.outputs.result).toContain(5);
  });

  it("property filtering should strip static values during deserialization for edge-connected inputs", () => {
    // Python explicitly removes the static property value from the node
    // during Graph.from_dict() if that property has an incoming edge.
    // TypeScript's fromDict() implements the same behavior: property keys
    // that appear as targetHandle in any incoming edge are stripped from
    // the node's static properties map.
    //
    // This matters when a node's process() reads from node.properties
    // directly (as a fallback) rather than from the inputs dict.
    const data = {
      nodes: [
        { id: "src", type: "test.Source" },
        {
          id: "proc",
          type: "test.Proc",
          properties: { value: 999, other: "static" } // "value" has an edge, "other" does not
        }
      ],
      edges: [
        {
          source: "src",
          sourceHandle: "out",
          target: "proc",
          targetHandle: "value"
        }
      ]
    };

    const graph = Graph.fromDict(data);
    const procNode = graph.findNode("proc");

    // "value" should be stripped because it has an incoming edge
    expect(procNode!.properties).not.toHaveProperty("value");
    // "other" should remain because it has no incoming edge
    expect(procNode!.properties).toHaveProperty("other", "static");
  });
});

describe("Gap #14 – allow_undefined_properties flag", () => {
  it("should silently keep unknown properties on nodes when allow_undefined_properties=true", () => {
    // When allowUndefinedProperties=true (the default), all properties are
    // kept regardless of what is declared in propertyTypes. This is used for
    // forward compatibility — loading graphs saved with a newer version that
    // has properties the current version doesn't know about.
    const data = {
      nodes: [
        {
          id: "a",
          type: "test.Node",
          properties: { known: 1, unknown_prop: 42 },
          propertyTypes: { known: "int" } // only "known" is declared
        }
      ],
      edges: []
    };

    // Should not throw; all properties are preserved
    const graph = Graph.fromDict(data, { allowUndefinedProperties: true });
    const node = graph.findNode("a");

    expect(node!.properties).toHaveProperty("known", 1);
    expect(node!.properties).toHaveProperty("unknown_prop", 42);
  });

  it("should raise on unknown properties when allow_undefined_properties=false", () => {
    // When allowUndefinedProperties=false and skipErrors=false, properties
    // not listed in propertyTypes trigger a GraphValidationError.
    // When skipErrors=true, they are silently stripped instead of throwing.
    const data = {
      nodes: [
        {
          id: "a",
          type: "test.Node",
          properties: { known: 1, unknown_prop: 42 },
          propertyTypes: { known: "int" } // only "known" is declared
        }
      ],
      edges: []
    };

    // skipErrors=false → should throw
    expect(() =>
      Graph.fromDict(data, {
        allowUndefinedProperties: false,
        skipErrors: false
      })
    ).toThrow(GraphValidationError);

    expect(() =>
      Graph.fromDict(data, {
        allowUndefinedProperties: false,
        skipErrors: false
      })
    ).toThrow(/does not exist on node/);

    // skipErrors=true → should strip instead of throw
    const graph = Graph.fromDict(data, {
      allowUndefinedProperties: false,
      skipErrors: true
    });
    const node = graph.findNode("a");
    expect(node!.properties).toHaveProperty("known", 1);
    expect(node!.properties).not.toHaveProperty("unknown_prop");
  });
});
