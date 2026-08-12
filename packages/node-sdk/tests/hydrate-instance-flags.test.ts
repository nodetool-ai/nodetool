import { describe, it, expect } from "vitest";
import {
  NodeRegistry,
  createGraphNodeTypeResolver,
  hydrateGraphNodeFlags
} from "../src/registry.js";
import { BaseNode } from "../src/base-node.js";
import { prop } from "../src/decorators.js";
import { usesStreamInputContract } from "../src/code-body.js";

/**
 * A node whose input mode lives in its own properties, not in its type — the
 * shape `nodetool.code.Code` takes: the body decides whether it streams.
 */
class BodyModeNode extends BaseNode {
  static readonly nodeType = "test.BodyMode";
  static readonly title = "Body Mode";
  static readonly description = "";
  static readonly supportsDynamicInputs = true;
  static readonly resolveStreamingInput = (node: {
    properties?: Record<string, unknown>;
  }): boolean => usesStreamInputContract(String(node.properties?.code ?? ""));

  @prop({ type: "str", default: "" })
  declare code: string;

  async process() {
    return {};
  }
}

/** The same node without the hook — today's per-type resolution. */
class TypeModeNode extends BaseNode {
  static readonly nodeType = "test.TypeMode";
  static readonly title = "Type Mode";
  static readonly description = "";

  @prop({ type: "str", default: "" })
  declare code: string;

  async process() {
    return {};
  }
}

const registryWith = (...classes: typeof BodyModeNode[]): NodeRegistry => {
  const registry = new NodeRegistry();
  for (const cls of classes) registry.register(cls as never);
  return registry;
};

const hydrateOne = (
  registry: NodeRegistry,
  node: Record<string, unknown>
): boolean =>
  hydrateGraphNodeFlags({ nodes: [node], edges: [] } as never, registry).nodes[0]
    .is_streaming_input === true;

describe("hydrateGraphNodeFlags with resolveStreamingInput", () => {
  it("resolves the flag per instance from the node's own properties", () => {
    const registry = registryWith(BodyModeNode);
    expect(
      hydrateOne(registry, {
        id: "n1",
        type: "test.BodyMode",
        properties: { code: 'for await (const x of stream("a")) {}' }
      })
    ).toBe(true);
  });

  it("flips back when the stream call is edited out", () => {
    const registry = registryWith(BodyModeNode);
    expect(
      hydrateOne(registry, {
        id: "n1",
        type: "test.BodyMode",
        properties: { code: 'return { out: inputs.a };' }
      })
    ).toBe(false);
  });

  it("beats a stale saved flag in both directions", () => {
    const registry = registryWith(BodyModeNode);
    // Saved true, body no longer streams.
    expect(
      hydrateOne(registry, {
        id: "n1",
        type: "test.BodyMode",
        properties: { code: "return {};" },
        is_streaming_input: true
      })
    ).toBe(false);
    // Saved false, body streams.
    expect(
      hydrateOne(registry, {
        id: "n1",
        type: "test.BodyMode",
        properties: { code: 'await stream.first("a");' },
        is_streaming_input: false
      })
    ).toBe(true);
  });

  it("falls back to the static for a class with no hook", () => {
    const registry = registryWith(TypeModeNode);
    // The identical body: without the hook the answer is the type's static.
    expect(
      hydrateOne(registry, {
        id: "n1",
        type: "test.TypeMode",
        properties: { code: 'for await (const x of stream("a")) {}' }
      })
    ).toBe(false);
  });

  it("leaves every other flag on a hook class untouched", () => {
    const registry = registryWith(BodyModeNode);
    const hydrated = hydrateGraphNodeFlags(
      {
        nodes: [
          {
            id: "n1",
            type: "test.BodyMode",
            properties: { code: 'stream("a");' },
            is_controlled: true,
            is_join_node: true,
            is_trigger: true
          }
        ],
        edges: []
      } as never,
      registry
    );
    expect(hydrated.nodes[0]).toMatchObject({
      is_streaming_input: true,
      is_streaming_output: false,
      is_controlled: false,
      is_join_node: false,
      is_trigger: false,
      retry_safe: false
    });
  });
});

describe("createGraphNodeTypeResolver instance flags", () => {
  it("exposes resolveInstanceFlags only for a class that declares the hook", async () => {
    const registry = registryWith(BodyModeNode, TypeModeNode as never);
    const resolver = createGraphNodeTypeResolver(registry);

    const withHook = await resolver.resolveNodeType("test.BodyMode");
    const withoutHook = await resolver.resolveNodeType("test.TypeMode");

    expect(typeof withHook?.resolveInstanceFlags).toBe("function");
    expect(withoutHook?.resolveInstanceFlags).toBeUndefined();
    // The per-type default keeps saying what the static says; the closure is
    // what carries the per-instance answer to the merge site.
    expect(withHook?.descriptorDefaults?.is_streaming_input).toBe(false);
  });

  it("answers from the node it is handed", async () => {
    const resolver = createGraphNodeTypeResolver(registryWith(BodyModeNode));
    const resolved = await resolver.resolveNodeType("test.BodyMode");

    expect(
      resolved?.resolveInstanceFlags?.({
        properties: { code: 'for await (const x of stream("a")) {}' }
      })
    ).toEqual({ is_streaming_input: true });
    expect(
      resolved?.resolveInstanceFlags?.({ properties: { code: "return {};" } })
    ).toEqual({ is_streaming_input: false });
  });

  it("is absent for a class-less (metadata-only) node type", async () => {
    const registry = new NodeRegistry();
    registry.loadMetadata("python.pkg.Node", {
      node_type: "python.pkg.Node",
      title: "Py Node",
      description: "",
      namespace: "python.pkg",
      properties: [],
      outputs: []
    } as never);
    const resolved =
      await createGraphNodeTypeResolver(registry).resolveNodeType(
        "python.pkg.Node"
      );
    expect(resolved?.resolveInstanceFlags).toBeUndefined();
  });
});
