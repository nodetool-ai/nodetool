import { describe, expect, it } from "vitest";
import { BaseNode } from "../src/base-node.js";
import { prop } from "../src/decorators.js";
import { getNodeMetadata } from "../src/node-metadata.js";
import { NodeRegistry, type NodeCatalogEntry } from "../src/registry.js";
import { validateGraph } from "../src/graph-validation.js";
import { applyBuiltinNodePolicy } from "../src/builtin-node-policy.js";

class CatalogFixture extends BaseNode {
  static readonly nodeType = "nodetool.image.CatalogFixture";
  static readonly title = "Installed fixture";
  static readonly description = "";
  static readonly metadataOutputTypes = { output: "int" };
  static readonly platforms = ["node"] as const;

  @prop({ type: "str", default: "", required: true })
  declare value: string;

  @prop({ type: "int", default: 1, values: [1, 2], min: 1, max: 2 })
  declare mode: number;

  async process(): Promise<Record<string, unknown>> {
    return { output: 1 };
  }
}

function entry(): NodeCatalogEntry {
  return {
    node_type: CatalogFixture.nodeType,
    pack: "image",
    metadata: { ...getNodeMetadata(CatalogFixture), title: "Catalog fixture", required_settings: ["FIXTURE_API_KEY"] },
    declared: CatalogFixture.getDeclaredProperties()
  };
}

function catalogRegistry(): NodeRegistry {
  const registry = new NodeRegistry();
  registry.loadCatalog([entry()], [{ id: "image", installBytes: 1234 }]);
  return registry;
}

describe("catalog registry", () => {
  it("removes catalog metadata excluded by cloud and production policies", () => {
    const registry = new NodeRegistry();
    const catalogEntries = ["lib.browser.Screenshot", "transformers.Test", "fal.Test"].map((nodeType): NodeCatalogEntry => ({
      ...entry(), node_type: nodeType, metadata: { ...entry().metadata, node_type: nodeType }
    }));
    registry.loadCatalog(catalogEntries, [{ id: "image", installBytes: 0 }]);
    applyBuiltinNodePolicy(registry, { cloudProfile: true, production: true });
    expect(registry.getMetadata("lib.browser.Screenshot")).toBeUndefined();
    expect(registry.availability("lib.browser.Screenshot")).toBe("unknown");
    expect(registry.availability("transformers.Test")).toBe("unknown");
    expect(registry.availability("fal.Test")).toBe("catalog");
  });

  it("distinguishes every metadata origin from executable classes", () => {
    const registry = catalogRegistry();
    expect(registry.availability(CatalogFixture.nodeType)).toBe("catalog");
    expect(registry.has(CatalogFixture.nodeType)).toBe(false);
    expect(registry.getMetadataSource(CatalogFixture.nodeType)).toBe("catalog");
    expect(registry.getNodePackageId(CatalogFixture.nodeType)).toBe("image");
    expect(registry.catalogEntry(CatalogFixture.nodeType)).toEqual(entry());
    expect(registry.catalogPack(CatalogFixture.nodeType)).toEqual({ id: "image", installBytes: 1234 });
    for (const source of ["python-package", "python-bridge", "loaded-metadata"] as const) {
      const type = `test.${source}`;
      registry.loadMetadata(type, { ...entry().metadata, node_type: type }, { source });
      expect(registry.availability(type)).toBe(source === "loaded-metadata" ? "unknown" : "python");
    }
    expect(registry.availability("missing.Node")).toBe("unknown");
    registry.register(CatalogFixture);
    expect(registry.availability(CatalogFixture.nodeType)).toBe("executable");
    expect(registry.getMetadata(CatalogFixture.nodeType)?.title).toBe("Installed fixture");
    expect(registry.getMetadataSource(CatalogFixture.nodeType)).toBe("typescript");
  });

  it("preserves executable metadata when catalog loads after classes", () => {
    const registry = new NodeRegistry();
    registry.register(CatalogFixture);
    registry.loadCatalog([entry()]);
    expect(registry.availability(CatalogFixture.nodeType)).toBe("executable");
    expect(registry.getMetadata(CatalogFixture.nodeType)?.title).toBe("Installed fixture");
    expect(registry.listMetadata()).toHaveLength(1);
  });

  it("validates declared and typed dynamic properties without a class", () => {
    const registry = catalogRegistry();
    const descriptor = {
      id: "fixture", type: CatalogFixture.nodeType, properties: { dynamic: "invalid" },
      dynamic_inputs: { dynamic: { type: { type: "int", type_args: [] }, required: true } }
    };
    expect(registry.validateNode(descriptor).map((issue) => issue.code)).toEqual(["required", "dynamic_type_mismatch"]);
    expect(registry.validateNode(descriptor, new Set(["value", "dynamic"]))).toEqual([]);
  });

  it("keeps explicit dynamic values separate from the property fallback", () => {
    const registry = catalogRegistry();
    expect(registry.validateNode({ id: "fixture", type: CatalogFixture.nodeType, properties: { value: "valid" } })).toEqual([]);
    expect(registry.validateNode({
      id: "fixture", type: CatalogFixture.nodeType, properties: { value: "valid", dynamic: "invalid" },
      dynamic_inputs: { dynamic: { type: { type: "int", type_args: [] }, required: true } },
      dynamic_properties: { dynamic: 1 }
    })).toEqual([]);
  });

  it("clears catalog entries and caches when metadata changes or the registry resets", () => {
    const registry = catalogRegistry();
    const revision = registry.revision;
    expect(registry.listMetadata()).toHaveLength(1);
    registry.loadMetadata(CatalogFixture.nodeType, entry().metadata, { source: "python-bridge" });
    expect(registry.availability(CatalogFixture.nodeType)).toBe("python");
    expect(registry.catalogEntry(CatalogFixture.nodeType)).toBeUndefined();
    expect(registry.revision).toBeGreaterThan(revision);
    registry.loadCatalog([entry()]);
    registry.unregister(CatalogFixture.nodeType);
    expect(registry.availability(CatalogFixture.nodeType)).toBe("unknown");
    expect(registry.catalogEntry(CatalogFixture.nodeType)).toBeUndefined();
    registry.loadCatalog([entry()]);
    registry.clear();
    expect(registry.listMetadata()).toEqual([]);
    expect(registry.catalogPack(CatalogFixture.nodeType)).toBeUndefined();
  });

  it("filters catalog platform support alongside classes", () => {
    const registry = catalogRegistry();
    expect(registry.forPlatform("node").availability(CatalogFixture.nodeType)).toBe("catalog");
    expect(registry.forPlatform("browser").availability(CatalogFixture.nodeType)).toBe("unknown");
  });

  it("reports missing packs together with property, choice, unknown-field and credential issues", () => {
    const registry = catalogRegistry();
    const report = validateGraph({ nodes: [{ id: "fixture", type: CatalogFixture.nodeType, properties: { mode: 3, surprise: 1 } }], edges: [] }, registry, { availableSecrets: new Set() });
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["pack_not_installed", "property", "unknown_property", "invalid_choice", "missing_secret"]));
    expect(report.issues.find((issue) => issue.code === "pack_not_installed")).toMatchObject({ packId: "image", installBytes: 1234, installCommand: null });
    expect(report.issues.some((issue) => issue.code === "unknown_node")).toBe(false);
  });

  it("checks catalogue edge types and fan-in without executable classes", () => {
    const registry = catalogRegistry();
    const graph = {
      nodes: ["a", "b", "c"].map((id) => ({ id, type: CatalogFixture.nodeType, properties: { value: "valid", mode: 1 } })),
      edges: ["a", "b"].map((source) => ({ source, sourceHandle: "output", target: "c", targetHandle: "value" }))
    };
    const report = validateGraph(graph, registry);
    expect(report.issues.some((issue) => issue.code === "fan_in")).toBe(true);
    expect(report.issues.some((issue) => issue.code === "type_mismatch")).toBe(true);
  });
});
