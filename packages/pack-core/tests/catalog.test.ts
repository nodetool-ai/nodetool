import { expect, it } from "vitest";
import { createMissingPackError } from "../src/errors.js";
import { loadPackLoaderContext, setPackLoaderContext, setPackLoaderContextProvider } from "../src/loader-context.js";
import type { CatalogPack, NodeCatalogIndex } from "../src/types.js";

it("retains installation guidance for explicitly selectable CLI features", () => {
  const pack: CatalogPack = { id: "cli-full", kind: "cli-feature", npm: { name: "@nodetool-ai/cli-full", version: "0.8.4", integrity: "sha512-fixture" }, registrar: "feature", provides: [], requires: [], runtimeLibraries: [], secrets: [], scriptAllowlist: [], installBytes: 0, nodeCount: 0 };
  const catalog: NodeCatalogIndex = { schemaVersion: 1, coreVersion: "0.8.4", packs: [pack], owners: {} };
  const error = createMissingPackError("cli-full", [], { supported: true, reason: null, command: null }, catalog);
  expect(error.details.install.command).toBe("nodetool packs add cli-full");
  expect(error.details.packs[0]?.id).toBe("cli-full");
});

it("shares one admitted inventory across concurrent lazy loaders", async () => {
  let loads = 0;
  const context = { coreVersion: "0.8.4", packs: [], install: { supported: false, reason: "fixture", command: null } };
  setPackLoaderContextProvider(async () => { loads++; return context; });
  try {
    const values = await Promise.all(Array.from({ length: 100 }, () => loadPackLoaderContext()));
    expect(loads).toBe(1);
    expect(values.every(value => value === context)).toBe(true);
  } finally {
    setPackLoaderContext(undefined);
  }
});
