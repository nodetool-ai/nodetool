import { execFile } from "node:child_process";
import { readdir, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, expect, it, vi } from "vitest";
import type { CatalogPack, NodeCatalogIndex } from "@nodetool-ai/pack-core";
import { setupPackRegistry, disposePackRegistryFixtures } from "../_helpers/pack-registry.js";
import { authorizePackInstallCommand } from "../../src/commands/pack-install-authorization.js";
import { installPacks } from "../../src/packs/installer.js";
import { readInstallTree } from "../../src/packs/install-tree.js";
import { currentProject } from "../../src/packs/project.js";
import type { LoadCheckTarget } from "../../src/packs/installer.js";
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
  // The host detects its pack project under the data directory, so put the fixture's there.
  const data = join(f.directory, "data");
  vi.stubEnv("XDG_DATA_HOME", data); vi.stubEnv("APPDATA", data);
  const packsRoot = join(data, "nodetool", "packs", "1.0.0");
  const mode = { kind: "global" as const, cliRoot, packsRoot, legacyInstallRoot: cliRoot, coreVersion: "1.0.0", pathStyle: process.platform === "win32" ? "win32" as const : "posix" as const };
  const request = { ...f.request, mode, catalog, packs: [feature.id] };
  const loadCheck = async (target: LoadCheckTarget, ids: readonly string[]) =>
    verifyPackLoads(readInstalledPacks(mode, catalog, { projectRoot: target.projectRoot }), catalog, ids);
  return { ...f, request, feature, cliRoot, packsRoot, loadCheck };
}

it.each(["cli-chat", "cli-mcp", "cli-server"])("a globally installed CLI loads published %s from the pack project, resolving its host from the CLI", async id => {
  const manifest = JSON.parse(await readFile(new URL(`../../../${id}/package.json`, import.meta.url), "utf8"));
  const dependencies: Record<string, string> = manifest.dependencies?.["@nodetool-ai/cli"] ? { "@nodetool-ai/cli": "1.0.0" } : {};
  const f = await fixture(manifest.name, dependencies);
  const originalManifest = await readFile(join(f.cliRoot, "package.json"));
  const originalHost = await realpath(join(f.cliRoot, "index.js"));
  const cliFiles = (await readdir(f.cliRoot, { recursive: true })).sort();
  const authorization = await authorizePackInstallCommand({ request: f.request, command: "packs-add" });
  if (!authorization) { throw new Error("Missing global feature authorization"); }
  await installPacks(f.request, authorization, { ...f.operations, loadCheck: f.loadCheck });
  const project = currentProject(f.packsRoot);
  if (!project) { throw new Error("The feature install did not activate a pack project"); }
  expect((await readInstallTree(project)).filter(pack => pack.name === "@nodetool-ai/cli")).toEqual([]);
  expect((await readdir(f.cliRoot, { recursive: true })).sort()).toEqual(cliFiles);
  expect(await readFile(join(f.cliRoot, "package.json"))).toEqual(originalManifest);
  const entry = pathToFileURL(join(f.cliRoot, "index.js")).href;
  configureCliPackHost(entry, { catalog: f.request.catalog, stateFile: f.request.stateFile });
  const snapshot = await loadCliPackSnapshot();
  expect(snapshot).toMatchObject({ mode: { kind: "global", cliRoot: f.cliRoot }, projectRoot: project });
  const runner = await loadInstalledCommandFeature(entry, id, { snapshot, catalog: f.request.catalog });
  await runner.run([]);
  expect(Reflect.get(globalThis, "__nodetoolFixtureHost")).toBe(originalHost);
}, 60_000);

it.each(["1.0.0", "1.1.0"])("refuses a command feature that brings its own CLI at version %s", async version => {
  const f = await fixture("@nodetool-ai/cli-feature-legacy", { "@nodetool-ai/cli": version });
  const manifest = await readFile(join(f.cliRoot, "package.json"));
  const authorization = await authorizePackInstallCommand({ request: f.request, command: "packs-add" });
  if (!authorization) { throw new Error("Missing global fixture authorization"); }
  await expect(installPacks(f.request, authorization, { ...f.operations, loadCheck: f.loadCheck })).rejects.toThrow(/another CLI core package|Wrong NodeTool version/);
  expect(currentProject(f.packsRoot)).toBeNull();
  expect(await readFile(join(f.cliRoot, "package.json"))).toEqual(manifest);
}, 60_000);
