import { expect, it } from "vitest";
import type { NodeCatalogIndex } from "@nodetool-ai/node-catalog";
import { normalizeOwnedPackReplay } from "../../src/packs/owned-replay-plan.js";
import { assertAdditivePlan, type TreePackage } from "../../src/packs/install-tree.js";

const entry: TreePackage = { name: "@nodetool-ai/fixture-nodes", version: "1", integrity: "sha512-known", path: "node_modules/@nodetool-ai/fixture-nodes", realPath: "/fixture/node_modules/@nodetool-ai/fixture-nodes" };
const catalog: NodeCatalogIndex = { schemaVersion: 1, coreVersion: "1", owners: {}, packs: [{ id: "fixture", kind: "node-pack",
  npm: { name: entry.name, version: "1", integrity: "sha512-known" }, registrar: "register", provides: [], requires: [], runtimeLibraries: [], scriptAllowlist: [], secrets: [], installBytes: 1, nodeCount: 0 }] };
const identity = { name: entry.name, version: entry.version, path: entry.realPath };
const plan = { add: [], change: [{ from: identity, to: identity }], remove: [] };
it("normalizes only exact known pinned owned replay metadata", () => {
  expect(normalizeOwnedPackReplay(plan, [entry], catalog).change).toEqual([]);
  expect(() => assertAdditivePlan(normalizeOwnedPackReplay(plan, [entry], catalog), [entry], new Set(), [], "1")).not.toThrow();
});
it("keeps hash, path, version, name, unknown metadata, and npm10 text changes rejected", () => {
  const examples = [
    normalizeOwnedPackReplay(plan, [{ ...entry, integrity: undefined }], catalog),
    normalizeOwnedPackReplay(plan, [{ ...entry, integrity: "wrong" }], catalog),
    normalizeOwnedPackReplay({ ...plan, change: [{ from: identity, to: { ...identity, path: "/other" } }] }, [entry], catalog),
    normalizeOwnedPackReplay({ ...plan, change: [{ from: { ...identity, path: "/other" }, to: { ...identity, path: "/other" } }] }, [entry], catalog),
    normalizeOwnedPackReplay({ ...plan, change: [{ from: identity, to: { ...identity, version: "2" } }] }, [entry], catalog),
    normalizeOwnedPackReplay({ ...plan, change: [{ from: identity, to: { ...identity, name: "another" } }] }, [entry], catalog),
    normalizeOwnedPackReplay({ ...plan, change: [{}] }, [entry], catalog),
    normalizeOwnedPackReplay({ ...plan, change: ["change @nodetool-ai/fixture-nodes 1"] }, [entry], catalog)
  ];
  for (const example of examples) { expect(() => assertAdditivePlan(example, [entry], new Set(), [], "1")).toThrow(/changes/); }
});
it("never normalizes protected core, shared, runtime, or unowned user packages", () => {
  const core = normalizeOwnedPackReplay(plan, [entry], catalog, new Set([entry.name])); expect(core.change).toHaveLength(1);
  for (const name of ["mediabunny", "esbuild"]) {
    const previous = { ...entry, name }; const value = { name, version: "1", path: previous.realPath };
    const index = { ...catalog, packs: [{ ...catalog.packs[0], npm: { ...catalog.packs[0].npm, name } }], installPins: [{ name, version: "1", integrity: entry.integrity!, shared: name === "mediabunny" }] };
    expect(normalizeOwnedPackReplay({ ...plan, change: [{ from: value, to: value }] }, [previous], index).change).toHaveLength(1);
  }
  const user = { ...entry, name: "user-package" }; const userIdentity = { ...identity, name: user.name };
  expect(normalizeOwnedPackReplay({ ...plan, change: [{ from: userIdentity, to: userIdentity }] }, [user], catalog).change).toHaveLength(1);
});
it("a provided companion needs its own release pin and exact prior identity", () => {
  const companion = { ...entry, name: "@nodetool-ai/fixture-provider", path: "node_modules/@nodetool-ai/fixture-provider", realPath: "/fixture/node_modules/@nodetool-ai/fixture-provider" };
  const value = { name: companion.name, version: "1", path: companion.realPath };
  const index = { ...catalog, packs: [{ ...catalog.packs[0], provides: [companion.name] }] };
  const change = { ...plan, change: [{ from: value, to: value }] };
  expect(normalizeOwnedPackReplay(change, [companion], index).change).toHaveLength(1);
  expect(normalizeOwnedPackReplay(change, [companion], { ...index, installPins: [{ name: companion.name, version: "1", integrity: companion.integrity! }] }).change).toEqual([]);
});
