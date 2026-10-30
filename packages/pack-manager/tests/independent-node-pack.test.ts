import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { verifyPackLoads } from "../src/packs/installer-load-check.js";
import type { CatalogPack, NodeCatalogIndex } from "@nodetool-ai/pack-core";
import type { InstalledPackSnapshot } from "../src/packs/installed.js";

it.each(["node-pack", "core"] as const)("verifies independently installed %s nodes and rejects SDK identity and catalog mismatches", async (kind) => {
  const root = await mkdtemp(join(tmpdir(), "independent-node-pack-"));
  const sdkRoot = join(root, "node_modules/@nodetool-ai/node-sdk");
  const packRoot = join(root, "node_modules/@nodetool-ai/fixture-nodes");
  const version = "0.8.4";
  const pack: CatalogPack = { id: "fixture", kind, npm: { name: "@nodetool-ai/fixture-nodes", version, integrity: "sha512-fixture" }, registrar: "register", provides: [], requires: [], runtimeLibraries: [], secrets: [], scriptAllowlist: [], installBytes: 0, nodeCount: 1 };
  const catalog: NodeCatalogIndex = { schemaVersion: 1, coreVersion: version, packs: [pack], owners: { "fixture.Node": "fixture" }, installPins: [{ name: "@nodetool-ai/node-sdk", version, integrity: "sha512-sdk", shared: true }] };
  const mode = { kind: "local" as const, cliRoot: root, installRoot: root, nodeModulesRoot: join(root, "node_modules"), coreVersion: version, pathStyle: "posix" as const };
  const snapshot: InstalledPackSnapshot = { mode, packs: [{ id: pack.id, npm: pack.npm.name, version, packageRoot: packRoot, realPackageRoot: packRoot, providedPackages: [] }], wrongVersions: [], invalidPackages: [] };
  try {
    await mkdir(sdkRoot, { recursive: true });
    await mkdir(packRoot, { recursive: true });
    const sdkEntry = new URL("../../node-sdk/dist/index.js", import.meta.url).href;
    const sdkVerifier = new URL("../../node-sdk/dist/pack-verifier.js", import.meta.url).href;
    await writeFile(join(sdkRoot, "package.json"), JSON.stringify({ name: "@nodetool-ai/node-sdk", version, type: "module", exports: { ".": "./index.js", "./pack-verifier": "./pack-verifier.js" } }));
    await writeFile(join(sdkRoot, "index.js"), `export * from ${JSON.stringify(sdkEntry)};`);
    await writeFile(join(sdkRoot, "pack-verifier.js"), `export * from ${JSON.stringify(sdkVerifier)};`);
    await writeFile(join(packRoot, "package.json"), JSON.stringify({ name: pack.npm.name, version, type: "module", exports: { ".": "./index.js" }, dependencies: { "@nodetool-ai/node-sdk": version } }));
    await writeFile(join(packRoot, "index.js"), 'import {BaseNode} from "@nodetool-ai/node-sdk"; class Fixture extends BaseNode {static nodeType="fixture.Node";async process(){return {}}} export function register(registry){registry.register(Fixture)}');
    await writeFile(join(root, "package.json"), '{"name":"independent-fixture"}');
    const lock = JSON.stringify({ packages: { "node_modules/@nodetool-ai/node-sdk": { version, integrity: "sha512-sdk" }, "node_modules/@nodetool-ai/fixture-nodes": { version, integrity: "sha512-fixture" } } });
    await writeFile(join(root, "node_modules/.package-lock.json"), lock);
    await expect(verifyPackLoads(snapshot, catalog, [pack.id])).resolves.toBeUndefined();
    await expect(verifyPackLoads(snapshot, { ...catalog, owners: { "fixture.Missing": "fixture" } }, [pack.id])).rejects.toThrow("owned node types differ");
    await expect(verifyPackLoads(snapshot, { ...catalog, installPins: [{ name: "@nodetool-ai/node-sdk", version, integrity: "sha512-wrong", shared: true }] }, [pack.id])).rejects.toThrow("SDK integrity");
    const nested = join(packRoot, "node_modules/@nodetool-ai/node-sdk");
    await mkdir(nested, { recursive: true });
    await writeFile(join(nested, "package.json"), JSON.stringify({ name: "@nodetool-ai/node-sdk", version, main: "index.js" }));
    await writeFile(join(nested, "index.js"), "module.exports={}");
    const parsed = JSON.parse(lock);
    parsed.packages["node_modules/@nodetool-ai/fixture-nodes/node_modules/@nodetool-ai/node-sdk"] = { version, integrity: "sha512-sdk" };
    await writeFile(join(root, "node_modules/.package-lock.json"), JSON.stringify(parsed));
    await expect(verifyPackLoads(snapshot, catalog, [pack.id])).rejects.toThrow("exactly one admitted node-sdk");
    expect(await readFile(join(root, "package.json"), "utf8")).toBe('{"name":"independent-fixture"}');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
