/**
 * Mutation-focused tests for Graph: validation error messages/branches in
 * fromDict / loadFromDict / validate*, the hydration flag defaults, schema
 * type mapping, lookups, topological sort, and control-edge cycle detection.
 */

import { describe, it, expect } from "vitest";
import {
  Graph,
  GraphValidationError,
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
  it("validateEdgeTypes rejects a string-form target type mismatch", () => {
    const nodes = [
      n("a", "t", { outputs: { out: "str" } }),
      n("b", "t", { properties: { in: "int" } }) // string-form type
    ];
    const g = new Graph({ nodes, edges: [e("a", "out", "b", "in", { id: "ed" })] });
    expect(() => g.validateEdgeTypes()).toThrow(/Type mismatch on edge ed/);
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
