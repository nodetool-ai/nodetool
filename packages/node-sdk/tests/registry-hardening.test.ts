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
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BaseNode } from "../src/base-node.js";
import { prop } from "../src/decorators.js";
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

describe("validateNode", () => {
  class Req extends BaseNode {
    static readonly nodeType = "test.ReqNode";
    @prop({ type: "str", default: "", required: true })
    declare text: string;
    async process() {
      return {};
    }
  }

  it("defaults missing descriptor properties to an empty object", () => {
    const registry = new NodeRegistry();
    registry.register(Req);
    // descriptor has no `properties` → required field is reported, not a throw.
    const issues = registry.validateNode({ id: "n1", type: "test.ReqNode" });
    expect(issues).toHaveLength(1);
    expect(issues[0].property).toBe("text");
  });

  it("returns [] for an unregistered descriptor type", () => {
    expect(new NodeRegistry().validateNode({ id: "n", type: "ghost" })).toEqual([]);
  });
});

describe("resolve()", () => {
  class NameNode extends BaseNode {
    static readonly nodeType = "test.NameNode";
    async process() {
      return {
        name: this.__node_name,
        dyn: (this as any)._dynamic_outputs
      };
    }
  }

  it("uses descriptor.name as __node_name, falling back to the type", async () => {
    const registry = new NodeRegistry();
    registry.register(NameNode);
    const withName = await registry
      .resolve({ id: "n1", type: "test.NameNode", name: "Given" })
      .process({});
    expect(withName.name).toBe("Given");
    const noName = await registry
      .resolve({ id: "n2", type: "test.NameNode" })
      .process({});
    expect(noName.name).toBe("test.NameNode");
  });

  it("attaches dynamic_outputs only when the descriptor carries them", async () => {
    const registry = new NodeRegistry();
    registry.register(NameNode);
    const withDyn = await registry
      .resolve({ id: "n", type: "test.NameNode", dynamic_outputs: { a: "str" } })
      .process({});
    expect(withDyn.dyn).toEqual({ a: "str" });
    const noDyn = await registry
      .resolve({ id: "n", type: "test.NameNode" })
      .process({});
    expect(noDyn.dyn).toBeUndefined();
  });

  it("throws for an unknown node type", () => {
    const registry = new NodeRegistry();
    expect(() => registry.resolve({ id: "n", type: "missing" })).toThrow(
      /Unknown node type: missing/
    );
  });
});

describe("registry bookkeeping methods", () => {
  it("lists, fetches and round-trips loaded + registered metadata", () => {
    const registry = new NodeRegistry();
    registry.register(A, { metadata: meta({ node_type: "test.A", title: "Alpha" }) });
    registry.loadMetadata("py.Only", meta({ node_type: "py.Only", title: "Py" }));

    expect(registry.getClass("test.A")).toBe(A);
    expect(registry.has("py.Only")).toBe(false);
    expect(registry.list()).toEqual(["test.A"]);
    expect(registry.getMetadata("test.A")?.title).toBe("Alpha");
    expect(registry.getMetadata("py.Only")?.title).toBe("Py");
    expect(registry.listMetadata().map((m) => m.node_type).sort()).toEqual([
      "py.Only",
      "test.A"
    ]);
  });

  it("unregister removes class + both metadata maps and reports prior presence", () => {
    const registry = new NodeRegistry();
    registry.register(A);
    registry.loadMetadata("test.A", meta({ node_type: "test.A", title: "L" }));
    expect(registry.unregister("test.A")).toBe(true);
    expect(registry.has("test.A")).toBe(false);
    expect(registry.getMetadata("test.A")).toBeUndefined();
    expect(registry.unregister("test.A")).toBe(false);
  });

  it("clear empties the registry", () => {
    const registry = new NodeRegistry();
    registry.register(A);
    registry.loadMetadata("x.Y", meta({ node_type: "x.Y" }));
    registry.clear();
    expect(registry.list()).toEqual([]);
    expect(registry.listMetadata()).toEqual([]);
  });

  it("forPlatform carries registered and loaded metadata for kept nodes", () => {
    class Portable extends BaseNode {
      static readonly nodeType = "test.Portable";
      static readonly platforms = ["node", "edge"];
      async process() {
        return {};
      }
    }
    const registry = new NodeRegistry();
    const registered = meta({ node_type: "test.Portable", title: "Reg" });
    registry.register(Portable, { metadata: registered });
    registry.loadMetadata("test.Portable", meta({ node_type: "test.Portable", title: "Loaded" }));

    const filtered = registry.forPlatform("edge");
    expect(filtered.has("test.Portable")).toBe(true);
    // registered metadata wins over loaded, and both were copied across.
    expect(filtered.getMetadata("test.Portable")).toEqual(registered);
  });

  it("forPlatform drops nodes that do not support the target", () => {
    class WorkersOnly extends BaseNode {
      static readonly nodeType = "test.WO";
      static readonly platforms = ["workers"];
      async process() {
        return {};
      }
    }
    const registry = new NodeRegistry();
    registry.register(WorkersOnly);
    expect(registry.forPlatform("node").has("test.WO")).toBe(false);
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

  it("falls back to metadata platforms when the class declares none", () => {
    // Class has no `platforms` static; the registered metadata supplies them.
    class NoStaticPlatforms extends BaseNode {
      static readonly nodeType = "test.MetaPlatforms";
      async process() {
        return {};
      }
    }
    const registry = new NodeRegistry();
    registry.register(NoStaticPlatforms, {
      metadata: meta({ node_type: "test.MetaPlatforms", platforms: ["edge"] })
    });
    const validate = registry.createPlatformValidator("edge");
    expect(validate({ id: "n", type: "test.MetaPlatforms" }, new Set())).toEqual(
      []
    );
  });

  it("lists an empty supported set as '' for a node with no platforms", () => {
    class EmptyPlatforms extends BaseNode {
      static readonly nodeType = "test.EmptyPlatforms";
      static readonly platforms = [];
      async process() {
        return {};
      }
    }
    const registry = new NodeRegistry();
    registry.register(EmptyPlatforms);
    const issues = registry.createPlatformValidator("edge")(
      { id: "n", type: "test.EmptyPlatforms" },
      new Set()
    );
    expect(issues[0].message).toBe(
      "Node test.EmptyPlatforms is not supported on platform 'edge' (supports: node)"
    );
  });
});

describe("resolveMetadata Node-suffix boundary", () => {
  it("does not strip four characters from a type that lacks a Node suffix", () => {
    // "abcd" is registered; "abcdefgh" has no exact match and no "Node" suffix,
    // so it must resolve to undefined (not to "abcd" via a blind 4-char strip).
    const registry = new NodeRegistry({
      metadataByType: new Map([["abcd", meta({ node_type: "abcd" })]])
    });
    expect(registry.resolveMetadata("abcdefgh")).toBeUndefined();
  });
});

describe("loadPythonMetadata", () => {
  it("returns the load result and populates loaded metadata from disk", () => {
    const root = mkdtempSync(join(tmpdir(), "reg-py-"));
    try {
      const dir = join(root, "src", "nodetool", "package_metadata");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "pkg.json"),
        JSON.stringify({
          name: "pkg",
          nodes: [{ node_type: "py.Loaded", title: "Loaded", properties: [], outputs: [] }]
        })
      );
      const registry = new NodeRegistry();
      const result = registry.loadPythonMetadata({ roots: [root] });
      expect(result.nodesByType.has("py.Loaded")).toBe(true);
      // The for-loop must copy each loaded node into the registry.
      expect(registry.getMetadata("py.Loaded")?.title).toBe("Loaded");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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

  it("emits propertyMeta entries for description-only and bound-only props", async () => {
    const registry = new NodeRegistry({
      metadataByType: new Map([
        [
          "test.PM",
          meta({
            node_type: "test.PM",
            properties: [
              { name: "d", type: { type: "str", type_args: [] }, description: "desc" },
              { name: "lo", type: { type: "int", type_args: [] }, min: 1 },
              { name: "hi", type: { type: "int", type_args: [] }, max: 9 }
            ]
          })
        ]
      ])
    });
    const resolved = await createGraphNodeTypeResolver(registry).resolveNodeType("test.PM");
    expect(resolved?.descriptorDefaults.propertyMeta).toEqual({
      d: { description: "desc" },
      lo: { min: 1 },
      hi: { max: 9 }
    });
  });

  it("invokes the namespace loader for an unresolved namespaced type", async () => {
    const registry = new NodeRegistry();
    const seen: string[] = [];
    const resolver = createGraphNodeTypeResolver(registry, {
      loadNamespace: (ns, reg) => {
        seen.push(ns);
        reg.loadMetadata("a.b.Late", meta({ node_type: "a.b.Late", title: "Late" }));
      }
    });
    const resolved = await resolver.resolveNodeType("a.b.Late");
    expect(seen).toEqual(["a.b"]);
    expect(resolved?.nodeType).toBe("a.b.Late");
  });

  it("tolerates metadata that omits properties and outputs arrays", async () => {
    const registry = new NodeRegistry({
      metadataByType: new Map([
        ["test.Sparse", meta({ node_type: "test.Sparse", properties: undefined, outputs: undefined }) as any]
      ])
    });
    const resolved = await createGraphNodeTypeResolver(registry).resolveNodeType("test.Sparse");
    expect(resolved?.propertyTypes).toEqual({});
    expect(resolved?.outputs).toEqual({});
  });

  it("renders an output type that omits its type_args array", async () => {
    const registry = new NodeRegistry({
      metadataByType: new Map([
        ["test.NoArgs", meta({ node_type: "test.NoArgs", outputs: [{ name: "o", type: { type: "str" } }] }) as any]
      ])
    });
    const resolved = await createGraphNodeTypeResolver(registry).resolveNodeType("test.NoArgs");
    expect(resolved?.outputs).toEqual({ o: "str" });
  });

  it("does not invoke the namespace loader when metadata already resolves", async () => {
    const registry = new NodeRegistry({
      metadataByType: new Map([["a.b.Known", meta({ node_type: "a.b.Known" })]])
    });
    let called = false;
    const resolver = createGraphNodeTypeResolver(registry, {
      loadNamespace: () => {
        called = true;
      }
    });
    await resolver.resolveNodeType("a.b.Known");
    expect(called).toBe(false);
  });

  it("omits min/max from propertyMeta when the property has neither", async () => {
    const registry = new NodeRegistry({
      metadataByType: new Map([
        [
          "test.DescOnly",
          meta({
            node_type: "test.DescOnly",
            properties: [{ name: "d", type: { type: "str", type_args: [] }, description: "x" }]
          })
        ]
      ])
    });
    const resolved = await createGraphNodeTypeResolver(registry).resolveNodeType("test.DescOnly");
    const pm = resolved?.descriptorDefaults.propertyMeta?.d as Record<string, unknown>;
    expect("min" in pm).toBe(false);
    expect("max" in pm).toBe(false);
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

  it("joins multiple type args with ', '", async () => {
    const registry = new NodeRegistry({
      metadataByType: new Map([
        [
          "test.TwoArgs",
          meta({
            node_type: "test.TwoArgs",
            outputs: [
              {
                name: "out",
                type: {
                  type: "dict",
                  type_args: [
                    { type: "str", type_args: [] },
                    { type: "int", type_args: [] }
                  ]
                }
              }
            ]
          })
        ]
      ])
    });
    const resolved = await createGraphNodeTypeResolver(registry).resolveNodeType("test.TwoArgs");
    expect(resolved?.outputs).toEqual({ out: "dict[str, int]" });
  });
});
