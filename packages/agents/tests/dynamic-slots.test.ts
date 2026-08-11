import { describe, it, expect } from "vitest";
import { GraphBuilder } from "../src/graph-builder.js";
import {
  declareDynamicOutputsFromEdges,
  declareDynamicSlotsFromEdges,
  type SlotTypeLookup
} from "../src/dynamic-slots.js";

type Handle = { name: string; type?: { type: string; type_args?: unknown[] } };

function mockRegistry(
  defs: Record<
    string,
    {
      properties?: Handle[];
      outputs?: Handle[];
      supports_dynamic_inputs?: boolean;
      supports_dynamic_outputs?: boolean;
    }
  >
): SlotTypeLookup {
  return {
    getMetadata: (t: string) =>
      t in defs
        ? ({
            node_type: t,
            properties: defs[t].properties ?? [],
            outputs: defs[t].outputs ?? [],
            supports_dynamic_inputs: defs[t].supports_dynamic_inputs ?? false,
            supports_dynamic_outputs: defs[t].supports_dynamic_outputs ?? false
          } as never)
        : undefined
  };
}

const registry = mockRegistry({
  "test.Str": { outputs: [{ name: "output", type: { type: "str" } }] },
  "test.Img": { outputs: [{ name: "output", type: { type: "image" } }] },
  "test.Template": {
    properties: [{ name: "template", type: { type: "str" } }],
    supports_dynamic_inputs: true
  },
  "test.Static": { properties: [{ name: "value", type: { type: "str" } }] },
  "test.Code": {
    properties: [{ name: "code", type: { type: "str" } }],
    outputs: [{ name: "output", type: { type: "any" } }],
    supports_dynamic_inputs: true,
    supports_dynamic_outputs: true
  }
});

describe("declareDynamicSlotsFromEdges", () => {
  it("types a dynamic slot from the single source feeding it", () => {
    const builder = new GraphBuilder();
    builder.addNode("s", "test.Str");
    builder.addNode("tpl", "test.Template");
    builder.addEdge("s", "output", "tpl", "name");

    declareDynamicSlotsFromEdges(builder, registry);

    expect(builder.getNode("tpl")?.dynamic_inputs).toEqual({
      name: { type: { type: "str" } }
    });
  });

  it("leaves a slot fed by conflicting types untyped", () => {
    const builder = new GraphBuilder();
    builder.addNode("s", "test.Str");
    builder.addNode("i", "test.Img");
    builder.addNode("tpl", "test.Template");
    builder.addEdge("s", "output", "tpl", "field");
    builder.addEdge("i", "output", "tpl", "field");

    declareDynamicSlotsFromEdges(builder, registry);

    expect(builder.getNode("tpl")?.dynamic_inputs).toBeUndefined();
  });

  it("ignores static properties and non-dynamic nodes", () => {
    const builder = new GraphBuilder();
    builder.addNode("s", "test.Str");
    builder.addNode("tpl", "test.Template");
    builder.addNode("st", "test.Static");
    builder.addEdge("s", "output", "tpl", "template");
    builder.addEdge("s", "output", "st", "value");

    declareDynamicSlotsFromEdges(builder, registry);

    expect(builder.getNode("tpl")?.dynamic_inputs).toBeUndefined();
    expect(builder.getNode("st")?.dynamic_inputs).toBeUndefined();
  });

  it("keeps an existing declaration", () => {
    const builder = new GraphBuilder();
    builder.addNode("s", "test.Str");
    builder.addNode("tpl", "test.Template");
    builder.declareDynamicInput("tpl", "name", { type: { type: "image" } });
    builder.addEdge("s", "output", "tpl", "name");

    declareDynamicSlotsFromEdges(builder, registry);

    expect(builder.getNode("tpl")?.dynamic_inputs?.["name"]).toEqual({
      type: { type: "image" }
    });
  });
});

describe("declareDynamicOutputsFromEdges", () => {
  it("declares the handle an outgoing edge reads", () => {
    const builder = new GraphBuilder();
    builder.addNode("code", "test.Code");
    builder.addNode("tpl", "test.Template");
    builder.addEdge("code", "line", "tpl", "name");

    declareDynamicOutputsFromEdges(builder, registry);

    expect(builder.getNode("code")?.dynamic_outputs).toEqual({
      line: { type: "any" }
    });
  });

  it("declares one entry for two edges off the same handle", () => {
    const builder = new GraphBuilder();
    builder.addNode("code", "test.Code");
    builder.addNode("a", "test.Template");
    builder.addNode("b", "test.Template");
    builder.addEdge("code", "line", "a", "name");
    builder.addEdge("code", "line", "b", "name");

    declareDynamicOutputsFromEdges(builder, registry);

    expect(builder.getNode("code")?.dynamic_outputs).toEqual({
      line: { type: "any" }
    });
  });

  it("declares each dynamic handle a separate edge reads", () => {
    const builder = new GraphBuilder();
    builder.addNode("code", "test.Code");
    builder.addNode("a", "test.Template");
    builder.addNode("b", "test.Template");
    builder.addEdge("code", "line", "a", "name");
    builder.addEdge("code", "count", "b", "name");

    declareDynamicOutputsFromEdges(builder, registry);

    expect(builder.getNode("code")?.dynamic_outputs).toEqual({
      line: { type: "any" },
      count: { type: "any" }
    });
  });

  it("leaves an existing declaration alone", () => {
    const builder = new GraphBuilder();
    builder.addNode("code", "test.Code");
    builder.addNode("tpl", "test.Template");
    builder.declareDynamicOutput("code", "line", { type: "str" });
    builder.addEdge("code", "line", "tpl", "name");

    declareDynamicOutputsFromEdges(builder, registry);

    expect(builder.getNode("code")?.dynamic_outputs).toEqual({
      line: { type: "str" }
    });
  });

  it("never declares a static handle on an ordinary node", () => {
    const builder = new GraphBuilder();
    builder.addNode("s", "test.Str");
    builder.addNode("tpl", "test.Template");
    builder.addEdge("s", "output", "tpl", "name");

    declareDynamicOutputsFromEdges(builder, registry);

    expect(builder.getNode("s")?.dynamic_outputs).toBeUndefined();
  });

  it("never declares a static handle on a dynamic-output node", () => {
    const builder = new GraphBuilder();
    builder.addNode("code", "test.Code");
    builder.addNode("tpl", "test.Template");
    builder.addEdge("code", "output", "tpl", "name");

    declareDynamicOutputsFromEdges(builder, registry);

    expect(builder.getNode("code")?.dynamic_outputs).toBeUndefined();
  });

  it("ignores a reserved handle", () => {
    const builder = new GraphBuilder();
    builder.addNode("code", "test.Code");
    builder.addNode("tpl", "test.Template");
    builder.addEdge("code", "__value__", "tpl", "name");

    declareDynamicOutputsFromEdges(builder, registry);

    expect(builder.getNode("code")?.dynamic_outputs).toBeUndefined();
  });

  it("ignores a node type the registry does not know", () => {
    const builder = new GraphBuilder();
    builder.addNode("x", "test.Unknown");
    builder.addNode("tpl", "test.Template");
    builder.addEdge("x", "line", "tpl", "name");

    declareDynamicOutputsFromEdges(builder, registry);

    expect(builder.getNode("x")?.dynamic_outputs).toBeUndefined();
  });
});
