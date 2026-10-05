import { describe, it, expect } from "vitest";
import { Graph, type ResolvedNodeType } from "../src/graph.js";
import { mergeDerivedSlots } from "../src/dynamic-slots.js";

const image = { type: "image", type_args: [], optional: false };
const str = { type: { type: "str", type_args: [], optional: true } };

/**
 * A resolver whose type declares only `output` but whose nodes derive more
 * slots from their `slots` property, the way node-sdk's resolver does for a
 * class declaring `resolveDynamicSlots`.
 */
const resolver = {
  async resolveNodeType(nodeType: string): Promise<ResolvedNodeType | null> {
    if (nodeType === "test.Sink") {
      return { nodeType, propertyTypes: { image: "image" }, outputs: {} };
    }
    if (nodeType !== "test.Derived") return null;
    return {
      nodeType,
      propertyTypes: { slots: "str" },
      outputs: { output: "dict" },
      resolveInstanceSlots: (node: { properties?: Record<string, unknown> }) =>
        node.properties?.slots === "on"
          ? {
              dynamic_inputs: { "4:text": str },
              dynamic_outputs: { "9:image": image }
            }
          : undefined
    };
  }
};

const load = (slots: string, saved?: Record<string, unknown>) =>
  Graph.loadFromDict(
    {
      nodes: [
        { id: "src", type: "test.Derived", properties: { slots }, ...saved },
        { id: "sink", type: "test.Sink", properties: {} }
      ],
      edges: [
        {
          id: "e1",
          source: "src",
          sourceHandle: "9:image",
          target: "sink",
          targetHandle: "image"
        }
      ]
    },
    { resolver }
  );

describe("Graph.loadFromDict resolveInstanceSlots", () => {
  it("declares derived slots, types their inputs, and validates the edge", async () => {
    const graph = await load("on");
    const src = graph.findNode("src");
    expect(src?.dynamic_outputs).toEqual({ "9:image": image });
    expect(src?.dynamic_inputs).toEqual({ "4:text": str });
    expect(src?.propertyTypes?.["4:text"]).toBe("str");
    expect(() => graph.validate()).not.toThrow();
  });

  it("rejects the edge when the node derives no such slot", async () => {
    const graph = await load("off");
    expect(graph.findNode("src")?.dynamic_outputs).toBeUndefined();
    expect(() => graph.validate()).toThrow(/unknown output "9:image"/);
  });

  it("keeps a saved slot over a derived one", async () => {
    const savedImage = { type: "image", type_args: [], optional: true };
    const graph = await load("on", {
      dynamic_outputs: { "9:image": savedImage, extra: image }
    });
    expect(graph.findNode("src")?.dynamic_outputs).toEqual({
      "9:image": savedImage,
      extra: image
    });
  });
});

describe("mergeDerivedSlots", () => {
  it("returns the saved map itself when nothing was derived", () => {
    const saved = { a: 1 };
    expect(mergeDerivedSlots(undefined, saved)).toBe(saved);
    expect(mergeDerivedSlots({}, saved)).toBe(saved);
    expect(mergeDerivedSlots(undefined, undefined)).toBeUndefined();
  });

  it("puts saved entries over derived ones", () => {
    expect(mergeDerivedSlots({ a: 1, b: 2 }, { b: 3 })).toEqual({ a: 1, b: 3 });
    expect(mergeDerivedSlots({ a: 1 }, undefined)).toEqual({ a: 1 });
  });
});
