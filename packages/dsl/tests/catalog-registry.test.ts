import { describe, expect, it } from "vitest";
import { BaseNode, NodeRegistry, getNodeMetadata } from "@nodetool-ai/node-sdk";
import { MissingPackError, readCatalogNodes } from "@nodetool-ai/node-catalog";
import { assertNodePackAvailable, createExecutorResolver, createHasTsExecutor } from "../src/registry.js";

class CatalogFixture extends BaseNode {
  static readonly nodeType = "huggingface.test.CatalogDsl";
  static readonly title = "Catalog fixture";
  static readonly description = "";
  async process(): Promise<Record<string, unknown>> { return {}; }
}

function registry(): NodeRegistry {
  const result = new NodeRegistry();
  result.loadCatalog([{
    node_type: CatalogFixture.nodeType, pack: "huggingface", metadata: getNodeMetadata(CatalogFixture), declared: []
  }]);
  return result;
}

describe("DSL catalog registry", () => {
  it("checks stream pack availability without executing or resolving a Python node", () => {
    const catalog = registry();
    expect(() => assertNodePackAvailable(CatalogFixture.nodeType, { registry: catalog }, new NodeRegistry())).toThrow(MissingPackError);
    const excluded = readCatalogNodes().find((node) => node.pack === "fal");
    if (!excluded) {
      throw new Error("Excluded catalog fixture is missing");
    }
    expect(() => assertNodePackAvailable(excluded.node_type, undefined, new NodeRegistry())).not.toThrow();
    expect(() => createExecutorResolver(undefined, new NodeRegistry(), null)({ id: "excluded", type: excluded.node_type })).toThrow(`Unknown node type: ${excluded.node_type}`);
    const executable = new NodeRegistry();
    executable.register(CatalogFixture);
    expect(() => assertNodePackAvailable(CatalogFixture.nodeType, { registry: catalog }, executable)).not.toThrow();
  });
  it("never asks a Python bridge to execute catalog metadata", () => {
    const catalog = registry();
    expect(createHasTsExecutor(catalog, new NodeRegistry())(CatalogFixture.nodeType)).toBe(true);
    expect(() => createExecutorResolver({ registry: catalog }, new NodeRegistry(), null)({ id: "fixture", type: CatalogFixture.nodeType })).toThrow(MissingPackError);
  });

  it("preserves builtin executable precedence over a catalog fallback", () => {
    const catalog = registry();
    const executable = new NodeRegistry();
    executable.register(CatalogFixture);
    expect(() => createExecutorResolver({ registry: catalog }, executable, null)({ id: "fixture", type: CatalogFixture.nodeType })).not.toThrow();
  });
});
