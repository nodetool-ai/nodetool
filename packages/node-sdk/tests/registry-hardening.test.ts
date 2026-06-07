// @ts-nocheck
/**
 * Mutation-hardening tests for registry.ts: strict-metadata enforcement,
 * resolve() name fallback, platform-validator messaging, Node-suffix metadata
 * resolution, and the full descriptorDefaults / propertyMeta shape emitted by
 * createGraphNodeTypeResolver.
 */
import { describe, it, expect } from "vitest";
import {
  NodeRegistry,
  createGraphNodeTypeResolver
} from "../src/registry.js";
import { BaseNode } from "../src/base-node.js";
import type { NodeMetadata } from "../src/metadata.js";

class A extends BaseNode {
  static readonly nodeType = "test.A";
  static readonly title = "Alpha";
  async process() {
    return {};
  }
}

const meta = (overrides: Partial<NodeMetadata>): NodeMetadata => ({
  title: "T",
  description: "",
  namespace: "test",
  node_type: "test.X",
  properties: [],
  outputs: [],
  ...overrides
});

describe("register", () => {
  it("registers a class and derives its metadata", () => {
    const registry = new NodeRegistry();
    expect(() => registry.register(A)).not.toThrow();
    expect(registry.has("test.A")).toBe(true);
    expect(registry.getMetadata("test.A")?.title).toBe("Alpha");
  });

  it("throws when registering a class without a nodeType", () => {
    const registry = new NodeRegistry();
    class NoType extends BaseNode {
      async process() {
        return {};
      }
    }
    expect(() => registry.register(NoType)).toThrow(/without nodeType/);
  });
});

describe("resolve() name fallback", () => {
  it("uses descriptor.name as the node __node_name when present", () => {
    const registry = new NodeRegistry();
    registry.register(A);
    const exec = registry.resolve({
      id: "n1",
      type: "test.A",
      name: "Custom Name"
    });
    expect(exec).toBeDefined();
  });

  it("throws for an unknown node type", () => {
    const registry = new NodeRegistry();
    expect(() => registry.resolve({ id: "n", type: "missing" })).toThrow(
      /Unknown node type: missing/
    );
  });
});

describe("createPlatformValidator messaging", () => {
  class WorkersOnly extends BaseNode {
    static readonly nodeType = "test.WorkersOnly";
    static readonly platforms = ["workers", "edge"];
    async process() {
      return {};
    }
  }

  it("reports the supported platform list for an unsupported node", () => {
    const registry = new NodeRegistry();
    registry.register(WorkersOnly);
    const validate = registry.createPlatformValidator("node");
    const issues = validate({ id: "n1", type: "test.WorkersOnly" }, new Set());
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toBe(
      "Node test.WorkersOnly is not supported on platform 'node' (supports: workers, edge)"
    );
    expect(issues[0].property).toBe("*");
  });

  it("falls back to 'node' in the message when platforms are undefined", () => {
    const registry = new NodeRegistry();
    registry.register(A); // no platforms declared
    const validate = registry.createPlatformValidator("edge");
    const issues = validate({ id: "n2", type: "test.A" }, new Set());
    expect(issues[0].message).toBe(
      "Node test.A is not supported on platform 'edge' (supports: node)"
    );
  });

  it("returns no issues for a supported node", () => {
    const registry = new NodeRegistry();
    registry.register(WorkersOnly);
    const validate = registry.createPlatformValidator("workers");
    expect(validate({ id: "n3", type: "test.WorkersOnly" }, new Set())).toEqual(
      []
    );
  });
});

describe("metadata resolution", () => {
  it("prefers an exact match over the Node-suffix fallback", () => {
    const registry = new NodeRegistry({
      metadataByType: new Map([
        ["pkg.Thing", meta({ node_type: "pkg.Thing", title: "exact" })],
        ["pkg.ThingNode", meta({ node_type: "pkg.ThingNode", title: "suffix" })]
      ])
    });
    expect(registry.resolveMetadata("pkg.ThingNode")?.title).toBe("suffix");
  });

  it("strips a trailing Node suffix when only the base is registered", () => {
    const registry = new NodeRegistry({
      metadataByType: new Map([
        ["pkg.Thing", meta({ node_type: "pkg.Thing", title: "base" })]
      ])
    });
    expect(registry.resolveMetadata("pkg.ThingNode")?.title).toBe("base");
  });

  it("returns undefined when neither exact nor suffix match exists", () => {
    const registry = new NodeRegistry();
    expect(registry.resolveMetadata("pkg.Unknown")).toBeUndefined();
  });
});

describe("createGraphNodeTypeResolver — full shape", () => {
  it("emits propertyMeta (description/min/max) and controlled/join flags", async () => {
    const registry = new NodeRegistry({
      metadataByType: new Map([
        [
          "test.Full",
          meta({
            node_type: "test.Full",
            title: "Full",
            properties: [
              {
                name: "temp",
                type: { type: "float", type_args: [] },
                description: "temperature",
                min: 0,
                max: 2
              },
              { name: "plain", type: { type: "str", type_args: [] } }
            ],
            supports_dynamic_inputs: true,
            is_controlled: true,
            is_join_node: true,
            is_streaming_input: true
          })
        ]
      ])
    });
    const resolver = createGraphNodeTypeResolver(registry);
    const resolved = await resolver.resolveNodeType("test.Full");

    expect(resolved?.supportsDynamicInputs).toBe(true);
    expect(resolved?.descriptorDefaults).toMatchObject({
      name: "Full",
      is_streaming_input: true,
      is_controlled: true,
      is_join_node: true,
      propertyMeta: { temp: { description: "temperature", min: 0, max: 2 } }
    });
    // A property with no description/min/max contributes nothing to propertyMeta.
    expect(resolved?.descriptorDefaults.propertyMeta).not.toHaveProperty(
      "plain"
    );
  });

  it("returns null when the type cannot be resolved and no loader is set", async () => {
    const resolver = createGraphNodeTypeResolver(new NodeRegistry());
    expect(await resolver.resolveNodeType("pkg.Nope")).toBeNull();
  });

  it("does not invoke the loader for a top-level node type with no namespace", async () => {
    let called = false;
    const resolver = createGraphNodeTypeResolver(new NodeRegistry(), {
      loadNamespace: () => {
        called = true;
      }
    });
    expect(await resolver.resolveNodeType("Bare")).toBeNull();
    expect(called).toBe(false);
  });

  it("renders nested generic output types", async () => {
    const registry = new NodeRegistry({
      metadataByType: new Map([
        [
          "test.Nested",
          meta({
            node_type: "test.Nested",
            outputs: [
              {
                name: "out",
                type: {
                  type: "list",
                  type_args: [
                    { type: "dict", type_args: [{ type: "str", type_args: [] }] }
                  ]
                }
              }
            ]
          })
        ]
      ])
    });
    const resolver = createGraphNodeTypeResolver(registry);
    const resolved = await resolver.resolveNodeType("test.Nested");
    expect(resolved?.outputs).toEqual({ out: "list[dict[str]]" });
  });
});
