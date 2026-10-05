import { describe, it, expect } from "vitest";
import { Graph } from "@nodetool-ai/kernel";
import {
  NodeRegistry,
  createGraphNodeTypeResolver,
  hydrateGraphNodeFlags
} from "../src/registry.js";
import { BaseNode } from "../src/base-node.js";
import { prop } from "../src/decorators.js";

/**
 * A node whose slots follow from a property, the shape the Comfy runners take:
 * each name in `outputs` becomes an image output slot and `prompt` a str input.
 */
class PropertySlotsNode extends BaseNode {
  static readonly nodeType = "test.PropertySlots";
  static readonly title = "Property Slots";
  static readonly description = "";
  static readonly supportsDynamicInputs = true;
  static readonly supportsDynamicOutputs = true;
  static readonly metadataOutputTypes = { output: "dict[str, any]" };
  static readonly resolveDynamicSlots = (node: {
    properties?: Record<string, unknown>;
  }) => {
    const names = String(node.properties?.outputs ?? "")
      .split(",")
      .filter(Boolean);
    if (names.length === 0) return undefined;
    return {
      dynamic_inputs: {
        prompt: { type: { type: "str", type_args: [], optional: true } }
      },
      dynamic_outputs: Object.fromEntries(
        names.map((name) => [
          name,
          { type: "image", type_args: [], optional: false }
        ])
      )
    };
  };

  @prop({ type: "str", default: "" })
  declare outputs: string;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }
}

class ImageSinkNode extends BaseNode {
  static readonly nodeType = "test.ImageSink";
  static readonly title = "Image Sink";
  static readonly description = "";

  @prop({ type: "image", default: {} })
  declare image: unknown;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }
}

const registry = (): NodeRegistry => {
  const reg = new NodeRegistry();
  reg.register(PropertySlotsNode);
  reg.register(ImageSinkNode);
  return reg;
};

/** A graph built without the editor: no slots saved on the source node. */
const graphData = (outputs: string, sourceHandle = "a") => ({
  nodes: [
    { id: "src", type: "test.PropertySlots", properties: { outputs } },
    { id: "sink", type: "test.ImageSink", properties: {} }
  ],
  edges: [
    {
      id: "e1",
      source: "src",
      sourceHandle,
      target: "sink",
      targetHandle: "image"
    }
  ]
});

describe("hydrateGraphNodeFlags with resolveDynamicSlots", () => {
  it("declares slots derived from the node's properties", () => {
    const hydrated = hydrateGraphNodeFlags(graphData("a,b"), registry());
    expect(Object.keys(hydrated.nodes[0].dynamic_outputs ?? {})).toEqual([
      "a",
      "b"
    ]);
    expect(Object.keys(hydrated.nodes[0].dynamic_inputs ?? {})).toEqual([
      "prompt"
    ]);
  });

  it("lets a saved slot win over a derived one", () => {
    const data = graphData("a");
    const saved = { type: "video", type_args: [], optional: false };
    Object.assign(data.nodes[0], { dynamic_outputs: { a: saved } });
    const hydrated = hydrateGraphNodeFlags(data, registry());
    expect(hydrated.nodes[0].dynamic_outputs?.a).toBe(saved);
  });

  it("leaves nodes without the hook untouched", () => {
    const hydrated = hydrateGraphNodeFlags(graphData("a"), registry());
    expect(hydrated.nodes[1].dynamic_outputs).toBeUndefined();
    expect(hydrated.nodes[1].dynamic_inputs).toBeUndefined();
  });
});

describe("Graph.loadFromDict with resolveDynamicSlots", () => {
  const load = (outputs: string, sourceHandle?: string) =>
    Graph.loadFromDict(graphData(outputs, sourceHandle), {
      resolver: createGraphNodeTypeResolver(registry())
    });

  it("accepts an edge from a derived output slot", async () => {
    const graph = await load("a");
    expect(Object.keys(graph.findNode("src")?.dynamic_outputs ?? {})).toEqual([
      "a"
    ]);
    expect(graph.findNode("src")?.propertyTypes?.prompt).toBe("str");
    expect(() => graph.validate()).not.toThrow();
  });

  it("still rejects an edge from an output nothing declares", async () => {
    const graph = await load("");
    expect(() => graph.validate()).toThrow(/unknown output "a"/);
  });

  it("exposes resolveInstanceSlots only for a class with the hook", async () => {
    const resolver = createGraphNodeTypeResolver(registry());
    const withHook = await resolver.resolveNodeType("test.PropertySlots");
    const withoutHook = await resolver.resolveNodeType("test.ImageSink");
    expect(withHook?.resolveInstanceSlots).toBe(
      PropertySlotsNode.resolveDynamicSlots
    );
    expect(withoutHook?.resolveInstanceSlots).toBeUndefined();
  });
});
