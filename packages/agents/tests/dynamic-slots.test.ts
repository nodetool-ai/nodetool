import { describe, it, expect } from "vitest";
import { GraphBuilder } from "../src/graph-builder.js";
import {
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
            supports_dynamic_inputs: defs[t].supports_dynamic_inputs ?? false
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
  "test.Static": { properties: [{ name: "value", type: { type: "str" } }] }
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
