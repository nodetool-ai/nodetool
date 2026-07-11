/**
 * Mutation-focused tests for Graph: validation error messages/branches in
 * fromDict / loadFromDict / validate*, the hydration flag defaults, schema
 * type mapping, lookups, topological sort, and control-edge cycle detection.
 */

import { describe, it, expect } from "vitest";
import {
  Graph,
  GraphValidationError,
  withExplicitNodeFlags,
  type ResolvedNodeType
} from "../src/graph.js";
import type { Edge, NodeDescriptor } from "@nodetool-ai/protocol";

function n(id: string, type: string, extra: Partial<NodeDescriptor> = {}): NodeDescriptor {
  return { id, type, ...extra };
}
function e(
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
  extra: Partial<Edge> = {}
): Edge {
  return { source, sourceHandle, target, targetHandle, ...extra };
}
function ctrl(source: string, target: string, extra: Partial<Edge> = {}): Edge {
  return {
    source,
    sourceHandle: "ctrl",
    target,
    targetHandle: "__control__",
    edge_type: "control",
    ...extra
  };
}

describe("GraphValidationError", () => {
  it("defaults issues to an empty array and stores provided ones", () => {
    expect(new GraphValidationError("m").issues).toEqual([]);
    const err = new GraphValidationError("m", [{ message: "x" }]);
    expect(err.name).toBe("GraphValidationError");
    expect(err.issues).toEqual([{ message: "x" }]);
  });
});

describe("Graph – schema type mapping", () => {
  const schemaFor = (outputType: string | undefined) => {
    const node = n("o1", "test.Output", outputType ? { outputs: { out: outputType } } : {});
    return new Graph({ nodes: [node], edges: [] }).getOutputSchema();
  };

  it("maps declared output types to JSON Schema types", () => {
    expect(schemaFor("int").properties.o1).toEqual({ type: "number" });
    expect(schemaFor("float").properties.o1).toEqual({ type: "number" });
    expect(schemaFor("number").properties.o1).toEqual({ type: "number" });
    expect(schemaFor("str").properties.o1).toEqual({ type: "string" });
    expect(schemaFor("string").properties.o1).toEqual({ type: "string" });
    expect(schemaFor("bool").properties.o1).toEqual({ type: "boolean" });
    expect(schemaFor("boolean").properties.o1).toEqual({ type: "boolean" });
    expect(schemaFor("something-else").properties.o1).toEqual({ type: "string" });
    expect(schemaFor(undefined).properties.o1).toEqual({ type: "string" });
  });

  it("uses node.name when present and lists it as required", () => {
    const node = n("id1", "test.Input", { name: "myField", outputs: { out: "int" } });
    const schema = new Graph({ nodes: [node], edges: [] }).getInputSchema();
    expect(schema.properties.myField).toEqual({ type: "number" });
    expect(schema.required).toEqual(["myField"]);
    expect(schema.properties.id1).toBeUndefined();
  });

  it("getInputSchema filters to Input-typed nodes only", () => {
    const nodes = [
      n("i", "test.Input", { outputs: { out: "str" } }),
      n("o", "test.Output", { outputs: { out: "str" } })
    ];
    const schema = new Graph({ nodes, edges: [] }).getInputSchema();
    expect(Object.keys(schema.properties)).toEqual(["i"]);
  });
});

describe("Graph.fromDict – validation throws (skipErrors: false)", () => {
  const bad = (data: unknown, msg: RegExp) =>
    expect(() => Graph.fromDict(data, { skipErrors: false })).toThrow(msg);

  it("rejects non-object data", () => {
    bad(null, /must be an object/);
    bad(42, /must be an object/);
  });
  it("rejects data missing nodes or edges", () => {
    bad({ nodes: [] }, /must have 'nodes' and 'edges'/);
    bad({ edges: [] }, /must have 'nodes' and 'edges'/);
  });
  it("rejects non-array nodes/edges", () => {
    bad({ nodes: {}, edges: [] }, /'nodes' must be an array/);
    bad({ nodes: [], edges: {} }, /'edges' must be an array/);
  });
  it("rejects a non-object node entry", () => {
    bad({ nodes: [42], edges: [] }, /Node entries must be objects/);
  });
  it("rejects a node without string id/type", () => {
    bad({ nodes: [{ id: "a" }], edges: [] }, /must have string 'id' and 'type'/);
    bad({ nodes: [{ type: "t" }], edges: [] }, /must have string 'id' and 'type'/);
  });
  it("rejects an invalid node type via validateNodeType", () => {
    expect(() =>
      Graph.fromDict(
        { nodes: [{ id: "a", type: "bad" }], edges: [] },
        { skipErrors: false, validateNodeType: (t) => t === "ok" }
      )
    ).toThrow(/Invalid node type: bad/);
  });
  it("rejects an undefined property when allowUndefinedProperties is false", () => {
    expect(() =>
      Graph.fromDict(
        {
          nodes: [{ id: "a", type: "t", propertyTypes: { known: "int" }, properties: { unknown: 1 } }],
          edges: []
        },
        { skipErrors: false, allowUndefinedProperties: false }
      )
    ).toThrow(/Property unknown does not exist on node a/);
  });
  it("rejects a non-object edge entry", () => {
    bad({ nodes: [], edges: [42] }, /Edge entries must be objects/);
  });
  it("rejects an edge missing required string fields", () => {
    bad(
      { nodes: [{ id: "a", type: "t" }], edges: [{ source: "a" }] },
      /Each edge must have string 'source', 'sourceHandle', 'target', and 'targetHandle'/
    );
  });
});

describe("Graph.fromDict – skipErrors: true behaviour", () => {
  it("skips malformed nodes and edges instead of throwing", () => {
    const graph = Graph.fromDict({
      nodes: [42, { id: "a", type: "t" }, { type: "noId" }],
      edges: [99, { source: "a" }]
    });
    expect(graph.nodes.map((node) => node.id)).toEqual(["a"]);
    expect(graph.edges).toHaveLength(0);
  });

  it("drops undefined properties when allowUndefinedProperties is false", () => {
    const graph = Graph.fromDict(
      {
        nodes: [
          { id: "a", type: "t", propertyTypes: { known: "int" }, properties: { known: 1, extra: 2 } }
        ],
        edges: []
      },
      { allowUndefinedProperties: false }
    );
    expect(graph.findNode("a")!.properties).toEqual({ known: 1 });
  });

  it("merges dynamic_properties and prefers properties over data", () => {
    const graph = Graph.fromDict({
      nodes: [
        { id: "a", type: "t", properties: { p: 1 }, data: { d: 2 }, dynamic_properties: { dyn: 3 } }
      ],
      edges: []
    });
    expect(graph.findNode("a")!.properties).toEqual({ p: 1, dyn: 3 });
  });

  it("falls back to data when properties is absent", () => {
    const graph = Graph.fromDict({
      nodes: [{ id: "a", type: "t", data: { d: 2 } }],
      edges: []
    });
    expect(graph.findNode("a")!.properties).toEqual({ d: 2 });
  });

  it("removes properties that are fed by an incoming edge", () => {
    const graph = Graph.fromDict({
      nodes: [
        { id: "a", type: "t", outputs: { out: "any" } },
        { id: "b", type: "t", properties: { in: 5, keep: 9 } }
      ],
      edges: [{ source: "a", sourceHandle: "out", target: "b", targetHandle: "in" }]
    });
    expect(graph.findNode("b")!.properties).toEqual({ keep: 9 });
  });

  it("skips edges whose endpoints are not valid nodes", () => {
    const graph = Graph.fromDict({
      nodes: [{ id: "a", type: "t" }],
      edges: [{ source: "a", sourceHandle: "o", target: "ghost", targetHandle: "i" }]
    });
    expect(graph.edges).toHaveLength(0);
  });
});

describe("Graph.loadFromDict – hydration", () => {
  const resolverFor = (over: Partial<ResolvedNodeType> = {}) => ({
    resolveNodeType(nodeType: string): ResolvedNodeType | null {
      if (nodeType === "missing") return null;
      return { nodeType, ...over };
    }
  });

  it("skips unresolved nodes (skipErrors) and throws otherwise", async () => {
    const data = { nodes: [{ id: "a", type: "missing" }], edges: [] };
    const g = await Graph.loadFromDict(data, { resolver: resolverFor() });
    expect(g.nodes).toHaveLength(0);
    await expect(
      Graph.loadFromDict(data, { resolver: resolverFor(), skipErrors: false })
    ).rejects.toThrow(/Invalid node type: missing/);
  });

  it("prefers registry descriptorDefaults for streaming/controlled flags", async () => {
    const resolver = resolverFor({
      descriptorDefaults: {
        is_streaming_input: true,
        is_streaming_output: true,
        is_controlled: true
      }
    });
    const g = await Graph.loadFromDict(
      {
        nodes: [
          {
            id: "a",
            type: "t",
            is_streaming_input: false,
            is_streaming_output: false,
            is_controlled: false
          }
        ],
        edges: []
      },
      { resolver }
    );
    const node = g.findNode("a")!;
    expect(node.is_streaming_input).toBe(true);
    expect(node.is_streaming_output).toBe(true);
    expect(node.is_controlled).toBe(true);
  });

  it("lets an explicit registry false override a stale saved true flag", async () => {
    // A node type migrated from streaming to buffered: the registry now
    // declares is_streaming_input false, so the stale saved true must lose.
    const resolver = resolverFor({
      descriptorDefaults: { is_streaming_input: false }
    });
    const g = await Graph.loadFromDict(
      {
        nodes: [{ id: "a", type: "t", is_streaming_input: true }],
        edges: []
      },
      { resolver }
    );
    expect(g.findNode("a")!.is_streaming_input).toBe(false);
  });

  it("keeps the saved flag when the registry omits it", async () => {
    // Resolver returns no behavior flag (undefined) — the saved value survives.
    const g = await Graph.loadFromDict(
      {
        nodes: [{ id: "a", type: "t", is_streaming_output: true }],
        edges: []
      },
      { resolver: resolverFor({ descriptorDefaults: { name: "T" } }) }
    );
    expect(g.findNode("a")!.is_streaming_output).toBe(true);
  });

  it("uses the registry flag when the saved node omits it", async () => {
    const g = await Graph.loadFromDict(
      { nodes: [{ id: "a", type: "t" }], edges: [] },
      { resolver: resolverFor({ descriptorDefaults: { is_streaming_input: true } }) }
    );
    expect(g.findNode("a")!.is_streaming_input).toBe(true);
  });

  it("falls back to saved node flags, then to false", async () => {
    const fromNode = await Graph.loadFromDict(
      { nodes: [{ id: "a", type: "t", is_streaming_output: true }], edges: [] },
      { resolver: resolverFor() }
    );
    expect(fromNode.findNode("a")!.is_streaming_output).toBe(true);

    const def = await Graph.loadFromDict(
      { nodes: [{ id: "a", type: "t" }], edges: [] },
      { resolver: resolverFor() }
    );
    expect(def.findNode("a")!.is_streaming_output).toBe(false);
    expect(def.findNode("a")!.is_streaming_input).toBe(false);
    expect(def.findNode("a")!.is_controlled).toBe(false);
  });

  it("merges resolver propertyTypes/outputs under saved values", async () => {
    const resolver = resolverFor({
      propertyTypes: { a: "int", b: "str" },
      outputs: { out: "int" }
    });
    const g = await Graph.loadFromDict(
      {
        nodes: [{ id: "x", type: "t", propertyTypes: { b: "float" }, outputs: { extra: "bool" } }],
        edges: []
      },
      { resolver }
    );
    const node = g.findNode("x")!;
    expect(node.propertyTypes).toEqual({ a: "int", b: "float" }); // saved wins
    expect(node.outputs).toEqual({ out: "int", extra: "bool" });
  });

  it("validates properties against resolver types unless dynamic inputs are supported", async () => {
    const data = {
      nodes: [{ id: "x", type: "t", data: { known: 1, extra: 2 } }],
      edges: []
    };
    const strict = await Graph.loadFromDict(data, {
      resolver: resolverFor({ propertyTypes: { known: "int" } }),
      allowUndefinedProperties: false
    });
    expect(strict.findNode("x")!.properties).toEqual({ known: 1 });

    const dynamic = await Graph.loadFromDict(data, {
      resolver: resolverFor({ propertyTypes: { known: "int" }, supportsDynamicInputs: true }),
      allowUndefinedProperties: false
    });
    expect(dynamic.findNode("x")!.properties).toEqual({ known: 1, extra: 2 });

    await expect(
      Graph.loadFromDict(data, {
        resolver: resolverFor({ propertyTypes: { known: "int" } }),
        allowUndefinedProperties: false,
        skipErrors: false
      })
    ).rejects.toThrow(/Property extra does not exist on node x/);
  });

  it("drops edges whose endpoints did not resolve", async () => {
    const g = await Graph.loadFromDict(
      {
        nodes: [
          { id: "a", type: "t" },
          { id: "b", type: "missing" }
        ],
        edges: [{ source: "a", sourceHandle: "o", target: "b", targetHandle: "i" }]
      },
      { resolver: resolverFor() }
    );
    expect(g.edges).toHaveLength(0);
  });

  it("supports a bare-function resolver", async () => {
    const g = await Graph.loadFromDict(
      { nodes: [{ id: "a", type: "t" }], edges: [] },
      { resolver: (nodeType: string) => ({ nodeType }) }
    );
    expect(g.findNode("a")).toBeDefined();
  });
});

describe("Graph – control detection & lookups", () => {
  it("auto-detects is_controlled from incoming control edges", () => {
    const nodes = [n("a", "t"), n("b", "t")];
    const g = new Graph({ nodes, edges: [ctrl("a", "b")] });
    expect(g.findNode("b")!.is_controlled).toBe(true);
    expect(g.findNode("a")!.is_controlled).toBeFalsy();
  });

  it("does not mutate the caller's node objects when marking controlled", () => {
    const target = n("b", "t");
    const nodes = [n("a", "t"), target];
    const g = new Graph({ nodes, edges: [ctrl("a", "b")] });
    // The Graph carries a copy with the flag set...
    expect(g.findNode("b")!.is_controlled).toBe(true);
    expect(g.findNode("b")).not.toBe(target);
    // ...while the caller-owned original is left untouched.
    expect(target.is_controlled).toBeUndefined();
    // Unaffected nodes keep their identity (no whole-graph copy).
    expect(g.findNode("a")).toBe(nodes[0]);
  });

  it("findEdges / findDataEdges narrow by handle and edge type", () => {
    const nodes = [n("a", "t"), n("b", "t")];
    const edges = [e("a", "out", "b", "in", { id: "d1" }), ctrl("a", "b", { id: "c1" })];
    const g = new Graph({ nodes, edges });
    expect(g.findEdges("a", "out").map((x) => x.id)).toEqual(["d1"]);
    expect(g.findEdges("a", "nope")).toEqual([]);
    expect(g.findDataEdges("b").map((x) => x.id)).toEqual(["d1"]);
  });

  it("getControlEdges/getControllerNodes/getControlledNodes resolve relationships", () => {
    const nodes = [n("ctl", "t"), n("a", "t"), n("b", "t")];
    const edges = [ctrl("ctl", "a"), ctrl("ctl", "b"), e("a", "o", "b", "i")];
    const g = new Graph({ nodes, edges });
    expect(g.getControlEdges()).toHaveLength(2);
    expect(g.getControlEdges("a")).toHaveLength(1);
    expect(g.getControllerNodes().map((x) => x.id)).toEqual(["ctl"]);
    expect(g.getControllerNodes("a").map((x) => x.id)).toEqual(["ctl"]);
    expect(g.getControlledNodes("ctl").sort()).toEqual(["a", "b"]);
    expect(
      g
        .getControlledNodes()
        .map((x) => (x as NodeDescriptor).id)
        .sort()
    ).toEqual(["a", "b"]);
  });

  it("inputNodes/outputNodes use data edges only", () => {
    const nodes = [n("a", "t"), n("b", "t"), n("c", "t")];
    const edges = [e("a", "o", "b", "i"), ctrl("b", "c")];
    const g = new Graph({ nodes, edges });
    expect(g.inputNodes().map((x) => x.id).sort()).toEqual(["a", "c"]);
    expect(g.outputNodes().map((x) => x.id).sort()).toEqual(["b", "c"]);
  });
});

describe("Graph – streaming upstream", () => {
  it("marks all data-descendants of a streaming-output node", () => {
    const nodes = [
      n("s", "t", { is_streaming_output: true }),
      n("a", "t"),
      n("b", "t"),
      n("iso", "t")
    ];
    const edges = [e("s", "o", "a", "i"), e("a", "o", "b", "i"), ctrl("b", "iso")];
    const g = new Graph({ nodes, edges });
    expect(g.hasStreamingUpstream("a")).toBe(true);
    expect(g.hasStreamingUpstream("b")).toBe(true); // transitive
    expect(g.hasStreamingUpstream("s")).toBe(false);
    expect(g.hasStreamingUpstream("iso")).toBe(false); // only a control edge
  });
});

describe("Graph – topologicalSort", () => {
  it("groups nodes into dependency levels", () => {
    const nodes = [n("a", "t"), n("b", "t"), n("c", "t")];
    const edges = [e("a", "o", "b", "i"), e("b", "o", "c", "i")];
    const levels = new Graph({ nodes, edges }).topologicalSort();
    expect(levels.map((lvl) => lvl.map((node) => node.id))).toEqual([
      ["a"],
      ["b"],
      ["c"]
    ]);
  });

  it("puts independent nodes in the same level", () => {
    const nodes = [n("a", "t"), n("b", "t"), n("sink", "t")];
    const edges = [e("a", "o", "sink", "i"), e("b", "o", "sink", "j")];
    const levels = new Graph({ nodes, edges }).topologicalSort();
    expect(levels[0].map((x) => x.id).sort()).toEqual(["a", "b"]);
    expect(levels[1].map((x) => x.id)).toEqual(["sink"]);
  });

  it("does not loop forever on a cycle and returns the acyclic prefix", () => {
    const nodes = [n("a", "t"), n("b", "t")];
    const edges = [e("a", "o", "b", "i"), e("b", "o", "a", "i")];
    const levels = new Graph({ nodes, edges }).topologicalSort();
    expect(levels.flat()).toHaveLength(0); // both stuck in the cycle
  });

  it("scopes a parent level to children of GroupNodes when parentId is null", () => {
    const nodes = [
      n("g", "GroupNode"),
      n("child", "t", { parent_id: "g" }),
      n("top", "t")
    ];
    const levels = new Graph({ nodes, edges: [] }).topologicalSort(null);
    const ids = levels.flat().map((x) => x.id).sort();
    expect(ids).toEqual(["child", "g", "top"]);
  });

  it("scopes to a specific parentId when provided", () => {
    const nodes = [
      n("g", "test.GroupNode"),
      n("child", "t", { parent_id: "g" }),
      n("top", "t")
    ];
    const levels = new Graph({ nodes, edges: [] }).topologicalSort("g");
    expect(levels.flat().map((x) => x.id)).toEqual(["child"]);
  });
});

describe("Graph – validation methods", () => {
  it("validateEdgeEndpoints throws on unknown source/target with the id in the message", () => {
    const g1 = new Graph({ nodes: [n("b", "t")], edges: [e("ghost", "o", "b", "i")] });
    expect(() => g1.validateEdgeEndpoints()).toThrow(/unknown source node: ghost/);
    const g2 = new Graph({ nodes: [n("a", "t")], edges: [e("a", "o", "ghost", "i")] });
    expect(() => g2.validateEdgeEndpoints()).toThrow(/unknown target node: ghost/);
  });

  it("validateControlEdges requires the __control__ target handle", () => {
    const nodes = [n("a", "t"), n("b", "t")];
    const bad = e("a", "o", "b", "wrong", { edge_type: "control", id: "c1" });
    const g = new Graph({ nodes, edges: [bad] });
    expect(() => g.validateControlEdges()).toThrow(/must be "__control__".*c1/s);
  });

  it("validateControlEdges accepts well-formed control edges", () => {
    const g = new Graph({ nodes: [n("a", "t"), n("b", "t")], edges: [ctrl("a", "b")] });
    expect(() => g.validateControlEdges()).not.toThrow();
  });

  it("detects a cycle in control edges", () => {
    const nodes = [n("a", "t"), n("b", "t")];
    const edges = [ctrl("a", "b"), ctrl("b", "a")];
    const g = new Graph({ nodes, edges });
    expect(() => g.validateControlEdges()).toThrow(/cycle in control edges/);
  });

  it("validateEdgeTypes throws on incompatible types with both types in the message", () => {
    const nodes = [
      n("a", "t", { outputs: { out: "str" } }),
      n("b", "t", { properties: { in: { type: "int" } } })
    ];
    const g = new Graph({ nodes, edges: [e("a", "out", "b", "in", { id: "ed" })] });
    expect(() => g.validateEdgeTypes()).toThrow(
      /Type mismatch on edge ed.*"str".*"int"/s
    );
  });

  it("validateEdgeTypes accepts compatible and string-form types and skips missing info", () => {
    const nodes = [
      n("a", "t", { outputs: { out: "int" } }),
      n("b", "t", { properties: { in: "float" } }), // string-form type, numeric widen
      n("c", "t") // no type info
    ];
    const edges = [
      e("a", "out", "b", "in"),
      e("a", "out", "c", "in") // target no type -> skipped
    ];
    expect(() => new Graph({ nodes, edges }).validateEdgeTypes()).not.toThrow();
  });

  it("validate() runs all three checks", () => {
    const g = new Graph({ nodes: [n("a", "t")], edges: [e("a", "o", "ghost", "i")] });
    expect(() => g.validate()).toThrow(GraphValidationError);
  });

  it("validateDataEdgeSourceHandles rejects a prototype-named output handle", () => {
    // Regression: the guard used `in`, so a sourceHandle matching an
    // Object.prototype member ("toString") passed as if it were a real output
    // and the edge would hang at runtime. Own-property check must reject it.
    const nodes = [
      n("a", "t", { outputs: { output: "str" } }),
      n("b", "t", { properties: { in: { type: "str" } } })
    ];
    const g = new Graph({
      nodes,
      edges: [e("a", "toString", "b", "in", { id: "ed" })]
    });
    expect(() => g.validateDataEdgeSourceHandles()).toThrow(
      /unknown output "toString"/
    );
  });

  it("validateEdgeTypes ignores a prototype-named output handle instead of crashing", () => {
    // Regression: `outputs["toString"]` returned the inherited function, which
    // is truthy, so it reached TypeMetadata.fromString with a non-string.
    const nodes = [
      n("a", "t", { outputs: { out: "str" } }),
      n("b", "t", { properties: { in: { type: "str" } } })
    ];
    const g = new Graph({
      nodes,
      edges: [e("a", "constructor", "b", "in")]
    });
    // No declared "constructor" output ⇒ no source type ⇒ edge skipped, no throw.
    expect(() => g.validateEdgeTypes()).not.toThrow();
  });
});

describe("Graph.fromDict – malformed entry handling", () => {
  it("skips a null edge without crashing (typeof null === 'object')", () => {
    const graph = Graph.fromDict({
      nodes: [{ id: "a", type: "t" }],
      edges: [null]
    });
    expect(graph.edges).toHaveLength(0);
  });

  it("throws on a null edge when skipErrors is false", () => {
    expect(() =>
      Graph.fromDict(
        { nodes: [{ id: "a", type: "t" }], edges: [null] },
        { skipErrors: false }
      )
    ).toThrow(/Edge entries must be objects/);
  });

  it("ignores a non-object properties field and falls back to data", () => {
    const graph = Graph.fromDict({
      nodes: [{ id: "a", type: "t", properties: 5, data: { d: 1 } }],
      edges: []
    });
    expect(graph.findNode("a")!.properties).toEqual({ d: 1 });
  });

  it("ignores a non-object dynamic_properties field", () => {
    const graph = Graph.fromDict({
      nodes: [{ id: "a", type: "t", properties: { p: 1 }, dynamic_properties: 7 }],
      edges: []
    });
    expect(graph.findNode("a")!.properties).toEqual({ p: 1 });
  });

  it("does not validate properties when propertyTypes is an empty object", () => {
    const graph = Graph.fromDict(
      {
        nodes: [{ id: "a", type: "t", propertyTypes: {}, properties: { anything: 1 } }],
        edges: []
      },
      { allowUndefinedProperties: false }
    );
    expect(graph.findNode("a")!.properties).toEqual({ anything: 1 });
  });
});

describe("Graph – controller targeting", () => {
  it("getControllerNodes(targetId) returns only that target's controllers", () => {
    const nodes = [n("c1", "t"), n("c2", "t"), n("a", "t"), n("b", "t")];
    const edges = [ctrl("c1", "a"), ctrl("c2", "b")];
    const g = new Graph({ nodes, edges });
    expect(g.getControllerNodes("a").map((x) => x.id)).toEqual(["c1"]);
    expect(g.getControllerNodes("b").map((x) => x.id)).toEqual(["c2"]);
    expect(g.getControllerNodes().map((x) => x.id).sort()).toEqual(["c1", "c2"]);
  });

  it("getControlledNodes(sourceId) lists only that source's targets", () => {
    const nodes = [n("c1", "t"), n("c2", "t"), n("a", "t"), n("b", "t")];
    const edges = [ctrl("c1", "a"), ctrl("c2", "b")];
    const g = new Graph({ nodes, edges });
    expect(g.getControlledNodes("c1")).toEqual(["a"]);
    expect(g.getControlledNodes("c2")).toEqual(["b"]);
  });
});

describe("Graph – validation edge cases (batch 3)", () => {
  it("validateEdgeTypes rejects a propertyTypes target type mismatch", () => {
    const nodes = [
      n("a", "t", { outputs: { out: "str" } }),
      n("b", "t", { propertyTypes: { in: "int" } })
    ];
    const g = new Graph({ nodes, edges: [e("a", "out", "b", "in", { id: "ed" })] });
    expect(() => g.validateEdgeTypes()).toThrow(/Type mismatch on edge ed/);
  });

  it("validateEdgeTypes treats plain string property values as data, not types", () => {
    // Regression: a saved literal like "hello world" on a connected handle
    // must not be parsed as a type name and fail a valid graph.
    const nodes = [
      n("a", "t", { outputs: { out: "str" } }),
      n("b", "t", { properties: { in: "hello world" } })
    ];
    const g = new Graph({ nodes, edges: [e("a", "out", "b", "in")] });
    expect(() => g.validateEdgeTypes()).not.toThrow();
  });

  it("validateEdgeTypes prefers propertyTypes over a stale value descriptor", () => {
    const nodes = [
      n("a", "t", { outputs: { out: "str" } }),
      n("b", "t", {
        propertyTypes: { in: "str" },
        properties: { in: { type: "int" } }
      })
    ];
    const g = new Graph({ nodes, edges: [e("a", "out", "b", "in")] });
    expect(() => g.validateEdgeTypes()).not.toThrow();
  });

  it("validateEdgeTypes skips a non-string, non-typed target property", () => {
    const nodes = [
      n("a", "t", { outputs: { out: "str" } }),
      n("b", "t", { properties: { in: 123 } } as never) // neither string nor {type}
    ];
    const g = new Graph({ nodes, edges: [e("a", "out", "b", "in")] });
    expect(() => g.validateEdgeTypes()).not.toThrow();
  });

  it("does not flag a control diamond (BLACK-visited node) as a cycle", () => {
    const nodes = [n("a", "t"), n("b", "t"), n("c", "t"), n("d", "t")];
    const edges = [ctrl("a", "b"), ctrl("a", "c"), ctrl("b", "d"), ctrl("c", "d")];
    const g = new Graph({ nodes, edges });
    expect(() => g.validateControlEdges()).not.toThrow();
  });

  it("rejects edges missing each individual required field", () => {
    const base = { nodes: [{ id: "a", type: "t" }] };
    const cases = [
      { source: "a", target: "a", targetHandle: "i" }, // no sourceHandle
      { source: "a", sourceHandle: "o", targetHandle: "i" }, // no target
      { source: "a", sourceHandle: "o", target: "a" } // no targetHandle
    ];
    for (const edge of cases) {
      expect(() =>
        Graph.fromDict({ ...base, edges: [edge] }, { skipErrors: false })
      ).toThrow(/Each edge must have string/);
    }
  });

  it("validateEdgeEndpoints passes when all endpoints exist", () => {
    const g = new Graph({
      nodes: [n("a", "t"), n("b", "t")],
      edges: [e("a", "o", "b", "i")]
    });
    expect(() => g.validateEdgeEndpoints()).not.toThrow();
  });
});

describe("Graph.topologicalSort – filtering (batch 4)", () => {
  it("excludes edges that cross the parent-scope boundary", () => {
    const nodes = [
      n("g", "GroupNode"),
      n("child", "t", { parent_id: "g" }),
      n("top", "t")
    ];
    // child -> top crosses out of group "g"; it must not pull top into the level
    const edges = [e("child", "o", "top", "i")];
    const levels = new Graph({ nodes, edges }).topologicalSort("g");
    expect(levels.flat().map((x) => x.id)).toEqual(["child"]);
  });

  it("detects a dotted .GroupNode type in null parent mode", () => {
    const nodes = [
      n("g", "pkg.GroupNode"),
      n("child", "t", { parent_id: "g" })
    ];
    const ids = new Graph({ nodes, edges: [] })
      .topologicalSort(null)
      .flat()
      .map((x) => x.id)
      .sort();
    expect(ids).toEqual(["child", "g"]);
  });
});

describe("Graph.loadFromDict – streaming flag from saved data only", () => {
  it("keeps a saved is_streaming_input when the registry does not set it", async () => {
    const resolver = {
      resolveNodeType: (nodeType: string) => ({ nodeType })
    };
    const g = await Graph.loadFromDict(
      { nodes: [{ id: "a", type: "t", is_streaming_input: true }], edges: [] },
      { resolver }
    );
    expect(g.findNode("a")!.is_streaming_input).toBe(true);
  });
});

describe("Graph.fromDict – non-string field rejection (batch 5)", () => {
  it("rejects a numeric id or type when skipErrors is false", () => {
    expect(() =>
      Graph.fromDict({ nodes: [{ id: 5, type: "t" }], edges: [] }, { skipErrors: false })
    ).toThrow(/string 'id' and 'type'/);
    expect(() =>
      Graph.fromDict({ nodes: [{ id: "a", type: 9 }], edges: [] }, { skipErrors: false })
    ).toThrow(/string 'id' and 'type'/);
  });

  it("rejects a non-string edge field when skipErrors is false", () => {
    expect(() =>
      Graph.fromDict(
        { nodes: [{ id: "a", type: "t" }], edges: [{ source: "a", sourceHandle: 1, target: "a", targetHandle: "i" }] },
        { skipErrors: false }
      )
    ).toThrow(/Each edge must have string/);
  });
});

describe("Graph.validateEdgeTypes – missing endpoints", () => {
  it("skips (does not crash on) an edge whose source node is missing", () => {
    const g = new Graph({
      nodes: [n("b", "t", { properties: { in: "int" } })],
      edges: [e("ghost", "out", "b", "in")]
    });
    expect(() => g.validateEdgeTypes()).not.toThrow();
  });

  it("skips an edge whose source output type is undefined", () => {
    const g = new Graph({
      nodes: [n("a", "t"), n("b", "t", { properties: { in: "int" } })],
      edges: [e("a", "out", "b", "in")]
    });
    expect(() => g.validateEdgeTypes()).not.toThrow();
  });
});

describe("Graph – remaining edge/control coverage (batch 6)", () => {
  it("rejects a non-string edge source when skipErrors is false", () => {
    expect(() =>
      Graph.fromDict(
        { nodes: [{ id: "a", type: "t" }], edges: [{ source: 1, sourceHandle: "o", target: "a", targetHandle: "i" }] },
        { skipErrors: false }
      )
    ).toThrow(/Each edge must have string/);
  });

  it("detects a longer control cycle (a->b->c->a)", () => {
    const nodes = [n("a", "t"), n("b", "t"), n("c", "t")];
    const edges = [ctrl("a", "b"), ctrl("b", "c"), ctrl("c", "a")];
    expect(() => new Graph({ nodes, edges }).validateControlEdges()).toThrow(
      /cycle in control edges/
    );
  });

  it("control validation passes for a self-disjoint forest", () => {
    const nodes = [n("a", "t"), n("b", "t"), n("c", "t"), n("d", "t")];
    const edges = [ctrl("a", "b"), ctrl("c", "d")];
    expect(() => new Graph({ nodes, edges }).validateControlEdges()).not.toThrow();
  });
});

describe("Graph – topologicalSort & streaming (batch 7)", () => {
  it("excludes children whose parent is not a GroupNode", () => {
    const nodes = [n("top", "t"), n("x", "t", { parent_id: "ghost" })];
    // "ghost" is referenced as a parent but is not a GroupNode (and absent)
    const ids = new Graph({ nodes, edges: [] })
      .topologicalSort(null)
      .flat()
      .map((node) => node.id);
    expect(ids).toEqual(["top"]);
  });

  it("treats only exact/dotted GroupNode types as groups", () => {
    const nodes = [
      n("reg", "Regular"),
      n("child", "t", { parent_id: "reg" }) // reg is NOT a group -> child excluded
    ];
    const ids = new Graph({ nodes, edges: [] })
      .topologicalSort(null)
      .flat()
      .map((node) => node.id);
    expect(ids).toEqual(["reg"]);
  });

  it("does not mark a node fed only by non-streaming sources", () => {
    const nodes = [
      n("s", "t", { is_streaming_output: true }),
      n("a", "t"),
      n("p", "t"),
      n("q", "t")
    ];
    const edges = [e("s", "o", "a", "i"), e("p", "o", "q", "i")]; // p->q is non-streaming
    const g = new Graph({ nodes, edges });
    expect(g.hasStreamingUpstream("a")).toBe(true);
    expect(g.hasStreamingUpstream("q")).toBe(false);
  });
});

describe("Graph.loadFromDict – edge retention", () => {
  it("keeps edges whose endpoints both resolve", async () => {
    const resolver = { resolveNodeType: (nodeType: string) => ({ nodeType }) };
    const g = await Graph.loadFromDict(
      {
        nodes: [{ id: "a", type: "t" }, { id: "b", type: "t" }],
        edges: [{ source: "a", sourceHandle: "o", target: "b", targetHandle: "i" }]
      },
      { resolver }
    );
    expect(g.edges).toHaveLength(1);
  });
});

describe("Graph – final coverage (batch 8)", () => {
  it("fromDict defaults allowUndefinedProperties to true (keeps extra props)", () => {
    const graph = Graph.fromDict({
      nodes: [{ id: "a", type: "t", propertyTypes: { known: "int" }, properties: { known: 1, extra: 2 } }],
      edges: []
    });
    expect(graph.findNode("a")!.properties).toEqual({ known: 1, extra: 2 });
  });

  it("loadFromDict defaults allowUndefinedProperties to true", async () => {
    const resolver = { resolveNodeType: (nodeType: string) => ({ nodeType, propertyTypes: { known: "int" } }) };
    const g = await Graph.loadFromDict(
      { nodes: [{ id: "a", type: "t", data: { known: 1, extra: 2 } }], edges: [] },
      { resolver }
    );
    expect(g.findNode("a")!.properties).toEqual({ known: 1, extra: 2 });
  });

  it("collects every handle fed by an edge to the same target", () => {
    const graph = Graph.fromDict({
      nodes: [
        { id: "a", type: "t", outputs: { out: "any" } },
        { id: "b", type: "t", properties: { h1: 1, h2: 2, keep: 3 } }
      ],
      edges: [
        { source: "a", sourceHandle: "out", target: "b", targetHandle: "h1" },
        { source: "a", sourceHandle: "out", target: "b", targetHandle: "h2" }
      ]
    });
    expect(graph.findNode("b")!.properties).toEqual({ keep: 3 });
  });

  it("computes group membership even for a non-null parentId scope", () => {
    const nodes = [
      n("g", "GroupNode"),
      n("child", "t", { parent_id: "g" }),
      n("x", "t", { parent_id: "other" })
    ];
    const ids = new Graph({ nodes, edges: [] })
      .topologicalSort("other")
      .flat()
      .map((node) => node.id);
    expect(ids).toEqual(["x"]); // child (parent is group g) is NOT pulled in
  });

  it("control-edge handle error includes (no id) when the edge has no id", () => {
    const nodes = [n("a", "t"), n("b", "t")];
    const bad = e("a", "o", "b", "wrong", { edge_type: "control" }); // no id
    expect(() => new Graph({ nodes, edges: [bad] }).validateControlEdges()).toThrow(
      /\(no id\)/
    );
  });

  it("type-mismatch message uses the source->target descriptor when the edge has no id", () => {
    const nodes = [
      n("a", "t", { outputs: { out: "str" } }),
      n("b", "t", { properties: { in: { type: "int" } } })
    ];
    const g = new Graph({ nodes, edges: [e("a", "out", "b", "in")] }); // no id
    expect(() => g.validateEdgeTypes()).toThrow(/a:out->b:in/);
  });

  it("validateEdgeTypes does not crash on a null target property", () => {
    const nodes = [
      n("a", "t", { outputs: { out: "str" } }),
      n("b", "t", { properties: { in: null } } as never)
    ];
    expect(() => new Graph({ nodes, edges: [e("a", "out", "b", "in")] }).validateEdgeTypes()).not.toThrow();
  });

  it("detects a control cycle that runs through a non-first edge of a source", () => {
    // a has edges to b and c; the cycle runs a -> c -> a (c is a's SECOND edge),
    // so dropping non-first adjacency entries would hide it.
    const nodes = [n("a", "t"), n("b", "t"), n("c", "t")];
    const edges = [ctrl("a", "b"), ctrl("a", "c"), ctrl("c", "a")];
    expect(() => new Graph({ nodes, edges }).validateControlEdges()).toThrow(
      /cycle in control edges/
    );
  });
});

describe("Graph – final coverage (batch 9)", () => {
  it("loadFromDict forwards skipErrors:false to the normalize pass", async () => {
    const resolver = { resolveNodeType: (nodeType: string) => ({ nodeType }) };
    await expect(
      Graph.loadFromDict(
        { nodes: [42], edges: [] }, // malformed node, caught by fromDict
        { resolver, skipErrors: false }
      )
    ).rejects.toThrow(/Node entries must be objects/);
  });

  it("null-mode topo includes only the requested parent scope", () => {
    // top-level node + a node parented to a non-group: only the top-level one.
    const nodes = [n("top", "t"), n("orphan", "t", { parent_id: "nope" })];
    const ids = new Graph({ nodes, edges: [] })
      .topologicalSort(null)
      .flat()
      .map((node) => node.id);
    expect(ids).toEqual(["top"]);
  });
});

describe("Graph – final coverage (batch 10)", () => {
  it("detects a control cycle through a source's first edge", () => {
    // a -> b is a's FIRST edge and is part of the cycle a -> b -> a; an
    // adjacency overwrite that keeps only the last edge would hide it.
    const nodes = [n("a", "t"), n("b", "t"), n("c", "t")];
    const edges = [ctrl("a", "b"), ctrl("a", "c"), ctrl("b", "a")];
    expect(() => new Graph({ nodes, edges }).validateControlEdges()).toThrow(
      /cycle in control edges/
    );
  });

  it("null-mode topo includes a group's child but excludes a non-group's child", () => {
    const nodes = [
      n("g", "GroupNode"),
      n("ingroup", "t", { parent_id: "g" }), // included (g is a group)
      n("outgroup", "t", { parent_id: "plain" }) // excluded (plain is not a group)
    ];
    const ids = new Graph({ nodes, edges: [] })
      .topologicalSort(null)
      .flat()
      .map((node) => node.id)
      .sort();
    expect(ids).toEqual(["g", "ingroup"]);
  });
});

describe("withExplicitNodeFlags", () => {
  it("defaults missing behavior flags to false and preserves set ones, copying edges", () => {
    const graph = {
      nodes: [
        {
          id: "set",
          type: "t",
          is_streaming_input: true,
          is_streaming_output: true,
          is_controlled: true,
          is_join_node: true
        },
        { id: "unset", type: "t" }
      ],
      edges: [e("set", "out", "unset", "in")]
    } as Parameters<typeof withExplicitNodeFlags>[0];

    const hydrated = withExplicitNodeFlags(graph);

    const set = hydrated.nodes.find((n) => n.id === "set")!;
    expect(set.is_streaming_input).toBe(true);
    expect(set.is_streaming_output).toBe(true);
    expect(set.is_controlled).toBe(true);
    expect(set.is_join_node).toBe(true);

    const unset = hydrated.nodes.find((n) => n.id === "unset")!;
    expect(unset.is_streaming_input).toBe(false);
    expect(unset.is_streaming_output).toBe(false);
    expect(unset.is_controlled).toBe(false);
    expect(unset.is_join_node).toBe(false);

    expect(hydrated.edges).toHaveLength(1);
    expect(hydrated.edges[0]).toMatchObject({ source: "set", target: "unset" });
  });
});

describe("Graph.loadFromDict – is_join_node hydration", () => {
  const resolverFor = (over: Partial<ResolvedNodeType> = {}) => ({
    resolveNodeType: (nodeType: string): ResolvedNodeType | null => ({
      nodeType,
      ...over
    })
  });

  it("prefers the registry default, then the saved flag, then false", async () => {
    const fromRegistry = await Graph.loadFromDict(
      { nodes: [{ id: "a", type: "t" }], edges: [] },
      { resolver: resolverFor({ descriptorDefaults: { is_join_node: true } }) }
    );
    expect(fromRegistry.findNode("a")!.is_join_node).toBe(true);

    const fromSaved = await Graph.loadFromDict(
      { nodes: [{ id: "a", type: "t", is_join_node: true }], edges: [] },
      { resolver: resolverFor() }
    );
    expect(fromSaved.findNode("a")!.is_join_node).toBe(true);

    const def = await Graph.loadFromDict(
      { nodes: [{ id: "a", type: "t" }], edges: [] },
      { resolver: resolverFor() }
    );
    expect(def.findNode("a")!.is_join_node).toBe(false);
  });
});

describe("Graph.validateEdgeEndpoints – self-loops", () => {
  it("rejects a self-loop edge, naming the edge by id when present", () => {
    const g = new Graph({
      nodes: [n("a", "t")],
      edges: [e("a", "out", "a", "in", { id: "self1" })]
    });
    let caught: GraphValidationError | undefined;
    try {
      g.validateEdgeEndpoints();
    } catch (err) {
      caught = err as GraphValidationError;
    }
    expect(caught).toBeInstanceOf(GraphValidationError);
    expect(caught!.message).toMatch(/Edge self1/);
    expect(caught!.message).toMatch(/connects node "a" to itself/);
    // The structured issue carries node/handle context, not an empty list.
    expect(caught!.issues).toEqual([
      { nodeId: "a", property: "in", message: "Self-loop edges are not supported" }
    ]);
  });

  it("falls back to a source:handle->target:handle label when the edge has no id", () => {
    const g = new Graph({
      nodes: [n("a", "t")],
      edges: [e("a", "out", "a", "in")]
    });
    expect(() => g.validateEdgeEndpoints()).toThrow(/Edge a:out->a:in/);
  });
});

describe("Graph.validateEdgeTypes – scalar-into-list aggregation", () => {
  it("accepts a scalar source feeding a typed list handle", () => {
    const nodes = [
      n("a", "t", { outputs: { out: "int" } }),
      n("b", "t", { propertyTypes: { items: "list[int]" } })
    ];
    const g = new Graph({ nodes, edges: [e("a", "out", "b", "items")] });
    expect(() => g.validateEdgeTypes()).not.toThrow();
  });

  it("accepts a scalar source feeding an untyped (bare) list handle", () => {
    const nodes = [
      n("a", "t", { outputs: { out: "int" } }),
      n("b", "t", { propertyTypes: { items: "list" } })
    ];
    const g = new Graph({ nodes, edges: [e("a", "out", "b", "items")] });
    expect(() => g.validateEdgeTypes()).not.toThrow();
  });

  it("rejects a scalar source incompatible with the list element type", () => {
    const nodes = [
      n("a", "t", { outputs: { out: "str" } }),
      n("b", "t", { propertyTypes: { items: "list[int]" } })
    ];
    const g = new Graph({ nodes, edges: [e("a", "out", "b", "items", { id: "ed" })] });
    expect(() => g.validateEdgeTypes()).toThrow(/Type mismatch on edge ed/);
  });

  it("accepts a list source feeding a list handle of the same element type", () => {
    const nodes = [
      n("a", "t", { outputs: { out: "list[int]" } }),
      n("b", "t", { propertyTypes: { items: "list[int]" } })
    ];
    const g = new Graph({ nodes, edges: [e("a", "out", "b", "items")] });
    expect(() => g.validateEdgeTypes()).not.toThrow();
  });
});

describe("Graph.fromDict – edge-fed property pruning", () => {
  it("deletes a node's saved default for an edge-fed handle by default", () => {
    const graph = Graph.fromDict({
      nodes: [
        { id: "src", type: "t" },
        { id: "dst", type: "t", properties: { in: "saved", keep: "yes" } }
      ],
      edges: [{ source: "src", sourceHandle: "out", target: "dst", targetHandle: "in" }]
    });
    const dst = graph.findNode("dst")!;
    expect((dst.properties as Record<string, unknown>).in).toBeUndefined();
    expect((dst.properties as Record<string, unknown>).keep).toBe("yes");
  });

  it("retains edge-fed defaults when pruning is disabled", () => {
    const graph = Graph.fromDict(
      {
        nodes: [
          { id: "src", type: "t" },
          { id: "dst", type: "t", properties: { in: "saved" } }
        ],
        edges: [{ source: "src", sourceHandle: "out", target: "dst", targetHandle: "in" }]
      },
      { pruneEdgeProperties: false }
    );
    expect((graph.findNode("dst")!.properties as Record<string, unknown>).in).toBe(
      "saved"
    );
  });

  it("does not throw when an edge-fed target node has no properties", () => {
    expect(() =>
      Graph.fromDict({
        nodes: [
          { id: "src", type: "t" },
          { id: "dst", type: "t" } // no properties object
        ],
        edges: [{ source: "src", sourceHandle: "out", target: "dst", targetHandle: "in" }]
      })
    ).not.toThrow();
  });
});

describe("Graph._detectControlledNodes – data edges do not mark control", () => {
  it("leaves a node uncontrolled when its only incoming edge is a data edge", () => {
    const g = new Graph({
      nodes: [n("a", "t"), n("b", "t")],
      edges: [e("a", "out", "b", "in")]
    });
    expect(g.findNode("b")!.is_controlled).not.toBe(true);
    expect(g.getControlledNodes()).toHaveLength(0);
  });
});

describe("Graph.topologicalSort – only data edges define ordering", () => {
  it("ignores control edges when computing levels", () => {
    // data A->B orders B after A; a control B->A feedback edge must NOT be
    // counted as a dependency (that would deadlock both into zero levels).
    const g = new Graph({
      nodes: [n("A", "t"), n("B", "t")],
      edges: [e("A", "out", "B", "in"), ctrl("B", "A")]
    });
    const levels = g.topologicalSort().map((lvl) => lvl.map((node) => node.id));
    expect(levels).toEqual([["A"], ["B"]]);
  });
});

describe("Graph.validateEdgeTypes – propertyTypes wins over property descriptors", () => {
  it("does not override an authoritative propertyTypes entry with a property's type descriptor", () => {
    // propertyTypes says the handle is "int" (matches the source). A stale
    // property descriptor {type:"str"} must not shadow it and force a mismatch.
    const nodes = [
      n("a", "t", { outputs: { out: "str" } }),
      n("b", "t", {
        propertyTypes: { in: "str" },
        properties: { in: { type: "int" } }
      })
    ];
    const g = new Graph({ nodes, edges: [e("a", "out", "b", "in")] });
    expect(() => g.validateEdgeTypes()).not.toThrow();
  });

  it("ignores a property descriptor whose `type` is not a string", () => {
    // The fallback only adopts a descriptor's `type` when it is a string.
    // A non-string type (here a number) must be ignored, leaving the edge
    // untyped and skipped — not fed into TypeMetadata.fromString.
    const nodes = [
      n("a", "t", { outputs: { out: "str" } }),
      n("b", "t", { properties: { in: { type: 42 } } })
    ];
    const g = new Graph({ nodes, edges: [e("a", "out", "b", "in")] });
    expect(() => g.validateEdgeTypes()).not.toThrow();
  });
});

describe("Graph.loadFromDict – defers edge-property pruning until after resolution", () => {
  it("keeps a saved default whose feeding edge is dropped when its source type is unresolved", async () => {
    const resolver = {
      resolveNodeType(nodeType: string): ResolvedNodeType | null {
        if (nodeType === "missing") return null;
        return { nodeType };
      }
    };
    const g = await Graph.loadFromDict(
      {
        nodes: [
          { id: "src", type: "missing" }, // dropped at resolution
          { id: "dst", type: "t", properties: { in: "saved" } }
        ],
        edges: [
          { source: "src", sourceHandle: "out", target: "dst", targetHandle: "in" }
        ]
      },
      { resolver }
    );
    // src is dropped and its edge with it, so "in" is never edge-fed in the
    // final graph: the saved default must survive (no premature pruning).
    expect(g.findNode("src")).toBeUndefined();
    expect((g.findNode("dst")!.properties as Record<string, unknown>).in).toBe(
      "saved"
    );
  });
});
