import { execFile } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, expect, it, vi } from "vitest";
import type { CatalogPack, NodeCatalogIndex } from "@nodetool-ai/pack-core";
import { setupPackRegistry, disposePackRegistryFixtures } from "../_helpers/pack-registry.js";
import { authorizePackInstallCommand } from "../../src/commands/pack-install-authorization.js";
import { installPacks } from "../../src/packs/installer.js";
import { readInstallTree, installTreeRestored } from "../../src/packs/install-tree.js";
import { verifyPackLoads } from "../../src/packs/installer-load-check.js";
import { readInstalledPacks } from "../../src/packs/installed.js";
import { configureCliPackHost, loadCliPackSnapshot } from "../../src/packs/host.js";
import { loadInstalledCommandFeature } from "../../src/cli-feature.js";

const exec = promisify(execFile);
afterEach(async () => { vi.unstubAllEnvs(); Reflect.deleteProperty(globalThis, "__nodetoolFixtureHost"); await disposePackRegistryFixtures(); });

async function fixture(name: string, dependencies: Record<string, string>) {
  const f = await setupPackRegistry(false, { commandFeature: { name, dependencies } });
  const prefix = join(f.directory, "prefix");
  vi.stubEnv("npm_config_prefix", prefix);
  await exec(process.execPath, [f.npm, "install", "--global", "--prefix", prefix, "--ignore-scripts", "--no-audit", "--no-fund", `--registry=${f.registry}`, `--cache=${join(f.directory, "cache")}`, "@nodetool-ai/cli@1.0.0"]);
  const cliRoot = join(prefix, process.platform === "win32" ? "node_modules" : "lib/node_modules", "@nodetool-ai/cli");
  const pack = f.tarballs.get(`${name}@1.0.0`)!;
  const shared = f.tarballs.get("fixture-baseline@1.0.0")!;
  const feature: CatalogPack = { id: name.replace("@nodetool-ai/", ""), kind: "cli-feature", npm: { name, version: pack.version, integrity: pack.integrity }, registrar: "feature", provides: [], requires: [], runtimeLibraries: [], secrets: [], scriptAllowlist: [], installBytes: 0, nodeCount: 0 };
  const catalog: NodeCatalogIndex = { schemaVersion: 1, coreVersion: "1.0.0", owners: {}, packs: [feature], installPins: [{ name: shared.name, version: shared.version, integrity: shared.integrity, shared: true }] };
  const mode = { kind: "global" as const, cliRoot, installRoot: cliRoot, nodeModulesRoot: join(cliRoot, "node_modules"), coreVersion: "1.0.0", pathStyle: process.platform === "win32" ? "win32" as const : "posix" as const };
  const request = { ...f.request, mode, catalog, packs: [feature.id] };
  return { ...f, request, feature, cliRoot };
}

it.each(["cli-chat", "cli-mcp", "cli-server"])("normal npm globally admits published %s host metadata without installing a second CLI", async id => {
  const manifest = JSON.parse(await readFile(new URL(`../../../${id}/package.json`, import.meta.url), "utf8"));
  const dependencies: Record<string, string> = manifest.dependencies?.["@nodetool-ai/cli"] ? { "@nodetool-ai/cli": "1.0.0" } : {};
  const f = await fixture(manifest.name, dependencies);
  const originalManifest = await readFile(join(f.cliRoot, "package.json"));
  const originalHost = await realpath(join(f.cliRoot, "index.js"));
  const authorization = await authorizePackInstallCommand({ request: f.request, command: "packs-add" });
  if (!authorization) { throw new Error("Missing global feature authorization"); }
  await installPacks(f.request, authorization, { ...f.operations, loadCheck: async (mode, ids) => verifyPackLoads(readInstalledPacks(mode, f.request.catalog), f.request.catalog, ids) });
  expect((await readInstallTree(f.cliRoot)).packages.filter(pack => pack.name === "@nodetool-ai/cli")).toEqual([]);
  expect(await readFile(join(f.cliRoot, "package.json"))).toEqual(originalManifest);
  const entry = pathToFileURL(join(f.cliRoot, "node_modules", f.feature.npm.name, "index.js")).href;
  configureCliPackHost(entry, { catalog: f.request.catalog, stateFile: f.request.stateFile });
  const snapshot = await loadCliPackSnapshot();
  expect(snapshot.mode).toMatchObject({ kind: "global", cliRoot: f.cliRoot });
  const runner = await loadInstalledCommandFeature(entry, id, { snapshot, catalog: f.request.catalog });
  await runner.run([]);
  expect(Reflect.get(globalThis, "__nodetoolFixtureHost")).toBe(originalHost);
}, 60_000);

it.each(["1.0.0", "1.1.0"])("still refuses a real npm plan adding a nested CLI dependency at version %s", async version => {
  const f = await fixture("@nodetool-ai/cli-feature-legacy", { "@nodetool-ai/cli": version });
  const before = await readInstallTree(f.cliRoot, true);
  const manifest = await readFile(join(f.cliRoot, "package.json"));
  const authorization = await authorizePackInstallCommand({ request: f.request, command: "packs-add" });
  if (!authorization) { throw new Error("Missing global fixture authorization"); }
  await expect(installPacks(f.request, authorization, f.operations)).rejects.toThrow(/another core or shared identity/);
  expect(installTreeRestored(before.packages, (await readInstallTree(f.cliRoot, true)).packages, true)).toBe(true);
  expect(await readFile(join(f.cliRoot, "package.json"))).toEqual(manifest);
}, 60_000);
