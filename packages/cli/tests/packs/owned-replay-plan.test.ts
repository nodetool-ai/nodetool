import { expect, it } from "vitest";
import type { NodeCatalogIndex } from "@nodetool-ai/node-catalog";
import { normalizeOwnedPackReplay } from "../../src/packs/owned-replay-plan.js";
import { assertAdditivePlan, parseInstallPlan, type TreePackage } from "../../src/packs/install-tree.js";

const entry: TreePackage = { name: "@nodetool-ai/fixture-nodes", version: "1", integrity: "sha512-known", path: "node_modules/@nodetool-ai/fixture-nodes", realPath: "/fixture/node_modules/@nodetool-ai/fixture-nodes" };
const catalog: NodeCatalogIndex = { schemaVersion: 1, coreVersion: "1", owners: {}, packs: [{ id: "fixture", kind: "node-pack",
  npm: { name: entry.name, version: "1", integrity: "sha512-known" }, registrar: "register", provides: [], requires: [], runtimeLibraries: [], scriptAllowlist: [], secrets: [], installBytes: 1, nodeCount: 0 }] };
const identity = { name: entry.name, version: entry.version, path: entry.realPath };
const plan = { add: [], change: [{ from: identity, to: identity }], remove: [] };
it("normalizes only exact known pinned owned replay metadata", () => {
  expect(normalizeOwnedPackReplay(plan, [entry], catalog).change).toEqual([]);
  expect(() => assertAdditivePlan(normalizeOwnedPackReplay(plan, [entry], catalog), [entry], new Set(), [], "1")).not.toThrow();
});
it("keeps hash, path, version, name, unknown metadata, and malformed npm10 text changes rejected", () => {
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

it("normalizes actual npm10 same-version text only for a unique pinned hoisted owned package", () => {
  const index = { ...catalog, coreVersion: "1.0.0", packs: [{ ...catalog.packs[0], npm: { ...catalog.packs[0].npm, version: "1.0.0" } }] };
  const previous = { ...entry, version: "1.0.0" };
  const raw = "add @nodetool-ai/fixture2-nodes 1.0.0\nchange @nodetool-ai/fixture-nodes 1.0.0 => 1.0.0\n\nadded 1 package, and changed 1 package in 171ms";
  const parsed = parseInstallPlan(raw, "10.9.4");
  expect(parsed.change).toEqual(["change @nodetool-ai/fixture-nodes 1.0.0 => 1.0.0"]);
  expect(normalizeOwnedPackReplay(parsed, [previous], index).change).toEqual([]);
  expect(normalizeOwnedPackReplay(parsed, [previous], index).add).toEqual([{ name: "@nodetool-ai/fixture2-nodes", version: "1.0.0" }]);
});

it("npm10 replay refuses ambiguous, nested, alias wrong-folder, unknown hash, and changed identities", () => {
  const textPlan = { ...plan, change: [`change ${entry.name} 1 => 1`] };
  const alias = { ...catalog, packs: [{ ...catalog.packs[0], provides: ["fixture-alias"] }], installPins: [
    { name: "companion-real", installName: "fixture-alias", version: "1", integrity: entry.integrity! }
  ] };
  const companion = { ...entry, name: "companion-real", path: "node_modules/companion-real", realPath: "/fixture/node_modules/companion-real" };
  const nested = { ...entry, path: "node_modules/other/node_modules/" + entry.name, realPath: "/fixture/node_modules/other/node_modules/" + entry.name };
  const examples = [
    normalizeOwnedPackReplay(textPlan, [entry, nested], catalog),
    normalizeOwnedPackReplay(textPlan, [nested], catalog),
    normalizeOwnedPackReplay(textPlan, [{ ...entry, integrity: undefined }], catalog),
    normalizeOwnedPackReplay(textPlan, [{ ...entry, integrity: "wrong" }], catalog),
    normalizeOwnedPackReplay(textPlan, [{ ...entry, version: "2" }], catalog),
    normalizeOwnedPackReplay({ ...textPlan, change: [`change ${entry.name} 1 => 2`] }, [entry], catalog),
    normalizeOwnedPackReplay({ ...textPlan, change: [`change ${entry.name} 1 => 1 trailing`] }, [entry], catalog),
    normalizeOwnedPackReplay({ ...textPlan, change: [`change companion-real 1 => 1`] }, [companion], alias),
    normalizeOwnedPackReplay(textPlan, [entry], { ...catalog, coreVersion: "2" })
  ];
  for (const value of examples) { expect(() => assertAdditivePlan(value, [entry], new Set(), [], "1")).toThrow(/changes/); }
  const correctlyAliased = { ...companion, path: "node_modules/fixture-alias", realPath: "/fixture/node_modules/fixture-alias" };
  expect(normalizeOwnedPackReplay({ ...textPlan, change: ["change companion-real 1 => 1"] }, [correctlyAliased], alias).change).toEqual([]);
});
it("npm10 replay never normalizes core, shared, runtime, or user package actions", () => {
  const textPlan = { ...plan, change: [`change ${entry.name} 1 => 1`] };
  expect(normalizeOwnedPackReplay(textPlan, [entry], catalog, new Set([entry.name])).change).toHaveLength(1);
  for (const name of ["mediabunny", "esbuild", "user-package"]) {
    const previous = { ...entry, name, path: `node_modules/${name}`, realPath: `/fixture/node_modules/${name}` };
    const index = name === "user-package" ? catalog : { ...catalog, packs: [{ ...catalog.packs[0], npm: { ...catalog.packs[0].npm, name } }],
      installPins: [{ name, version: "1", integrity: entry.integrity!, shared: name === "mediabunny" }] };
    expect(normalizeOwnedPackReplay({ ...textPlan, change: [`change ${name} 1 => 1`] }, [previous], index).change).toHaveLength(1);
  }
});

it("npm10 replay accepts native Windows separators in the trusted snapshot path", () => {
  const windowsEntry = { ...entry, realPath: "C:" + entry.realPath.replaceAll("/", String.fromCharCode(92)) };
  const textPlan = { ...plan, change: [`change ${entry.name} 1 => 1`] };
  expect(normalizeOwnedPackReplay(textPlan, [windowsEntry], catalog).change).toEqual([]);
  const nested = { ...windowsEntry, path: "node_modules/other/node_modules/" + entry.name };
  expect(normalizeOwnedPackReplay(textPlan, [nested], catalog).change).toHaveLength(1);
});
