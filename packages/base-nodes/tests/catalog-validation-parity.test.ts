import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NodeRegistry, validateGraph, type NodeCatalogEntry } from "@nodetool-ai/node-sdk";
import { registerBuiltinPacks } from "../src/builtin-packs.js";

// Generated, checked-in catalog fixture. This suite compares it with every registrar.
const entries: NodeCatalogEntry[] = readFileSync(new URL("../../node-catalog/data/nodes.ndjson", import.meta.url), "utf8")
  .trimEnd().split("\n").map((line) => JSON.parse(line));

function fixturePropertyBags(entry: NodeCatalogEntry): Record<string, unknown>[] {
  const defaults = Object.fromEntries(entry.declared.map(({ name, options }) => [name, options.default]));
  const nullValues = Object.fromEntries(entry.declared.map(({ name }) => [name, null]));
  const minimums = { ...defaults };
  const maximums = { ...defaults };
  const badChoices = { ...defaults };
  for (const { name, options } of entry.declared) {
    if (options.min !== undefined) {
      minimums[name] = options.min - 1;
    }
    if (options.max !== undefined) {
      maximums[name] = options.max + 1;
    }
    if (options.values?.length) {
      badChoices[name] = "__catalog_invalid_choice__";
    }
  }
  return [{}, defaults, nullValues, minimums, maximums, badChoices, { ...defaults, __unknown_fixture_property: "extra" }];
}

describe("catalog class-validator parity", () => {
  it("compares fixture property bags for every catalog type without executing nodes", () => {
    const executable = new NodeRegistry();
    registerBuiltinPacks(executable, { includeOptionalPacks: true });
    const catalog = new NodeRegistry();
    catalog.loadCatalog(entries);
    expect(entries.length).toBeGreaterThan(0);
    expect([...executable.list()].sort()).toEqual(entries.map((entry) => entry.node_type));
    let compared = 0;
    for (const entry of entries) {
      for (const properties of fixturePropertyBags(entry)) {
        const descriptor = { id: "parity", type: entry.node_type, properties };
        expect(catalog.validateNode(descriptor), entry.node_type).toEqual(executable.validateNode(descriptor));
        const connected = new Set(entry.declared.map((property) => property.name));
        expect(catalog.validateNode(descriptor, connected), entry.node_type).toEqual(executable.validateNode(descriptor, connected));
        compared++;
      }
    }
    expect(compared).toBe(entries.length * 7);
  });

  it("runs the same graph property checks for catalog and executable metadata", () => {
    const executable = new NodeRegistry();
    registerBuiltinPacks(executable, { includeOptionalPacks: true });
    const catalog = new NodeRegistry();
    catalog.loadCatalog(entries);
    let compared = 0;
    for (const entry of entries) {
      for (const properties of fixturePropertyBags(entry)) {
        const graph = { nodes: [{ id: "parity", type: entry.node_type, properties }], edges: [] };
        const expected = validateGraph(graph, executable).issues;
        const actual = validateGraph(graph, catalog).issues.filter((issue) => issue.code !== "pack_not_installed");
        expect(actual, entry.node_type).toEqual(expected);
        compared++;
      }
    }
    expect(compared).toBe(entries.length * 7);
  });
});
