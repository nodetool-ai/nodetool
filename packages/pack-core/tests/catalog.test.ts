import { expect, it } from "vitest";
import { createMissingPackError } from "../src/errors.js";
import { loadPackLoaderContext, setPackLoaderContext, setPackLoaderContextProvider } from "../src/loader-context.js";
import type { CatalogPack, NodeCatalogIndex } from "../src/types.js";

it("retains installation guidance for explicitly selectable CLI features", () => {
  const pack: CatalogPack = { id: "cli-harness", kind: "cli-feature", npm: { name: "@nodetool-ai/cli-harness", version: "0.8.4", integrity: "sha512-fixture" }, registrar: "feature", provides: [], requires: [], runtimeLibraries: [], secrets: [], scriptAllowlist: [], installBytes: 0, nodeCount: 0 };
  const catalog: NodeCatalogIndex = { schemaVersion: 1, coreVersion: "0.8.4", packs: [pack], owners: {} };
  const error = createMissingPackError("cli-harness", [], { supported: true, reason: null, command: null }, catalog);
  expect(error.details.install.command).toBe("nodetool packs add cli-harness");
  expect(error.details.packs[0]?.id).toBe("cli-harness");
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

it("offers an explicit install for missing formerly bundled core families", () => {
  const packs: CatalogPack[] = ["text", "code", "data"].map(id => ({ id, kind: "core", npm: { name: `@nodetool-ai/${id}-nodes`, version: "0.8.4", integrity: "sha512-fixture" }, registrar: "register", provides: [], requires: [], runtimeLibraries: [], secrets: [], scriptAllowlist: [], installBytes: 0, nodeCount: 1 }));
  const catalog: NodeCatalogIndex = { schemaVersion: 1, coreVersion: "0.8.4", packs, owners: {} };
  expect(createMissingPackError(["text", "code", "data"], [], { supported: true, reason: null, command: null }, catalog).details.install.command).toBe("nodetool packs add code data text");
});
