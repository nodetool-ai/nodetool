import { afterEach, expect, it, vi } from "vitest";
import { readdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { installPacks as installAuthorizedPacks, type InstallPacksRequest, type InstallerOperations } from "../../src/packs/installer.js";
import { removePacks as removeAuthorizedPacks } from "../../src/packs/removal.js";
import { authorizePackInstallCommand } from "../../src/commands/pack-install-authorization.js";
import { readDesiredState } from "../../src/packs/install-state.js";
import { readInstallTree } from "../../src/packs/install-tree.js";
import { currentProject } from "../../src/packs/project.js";
import { readInstalledPacks } from "../../src/packs/installed.js";
import { setupPackRegistry as setup, disposePackRegistryFixtures } from "../_helpers/pack-registry.js";

async function installPacks(request: InstallPacksRequest, operations: InstallerOperations) {
  const authorization = await authorizePackInstallCommand({ request, command: "packs-add" });
  if (!authorization) { throw new Error("Missing fixture authorization"); }
  return installAuthorizedPacks(request, authorization, operations);
}
async function removePacks(request: InstallPacksRequest, operations: InstallerOperations) {
  const authorization = await authorizePackInstallCommand({ request, command: "packs-remove" });
  if (!authorization) { throw new Error("Missing fixture authorization"); }
  return removeAuthorizedPacks(request, authorization, operations);
}
async function generations(packsRoot: string): Promise<string[]> {
  return (await readdir(packsRoot)).filter((name) => name.startsWith("g-")).sort();
}
async function listing(directory: string): Promise<string[]> {
  return (await readdir(directory, { recursive: true })).sort();
}
function withSecondPack(f: Awaited<ReturnType<typeof setup>>, requires: readonly string[] = []) {
  const pin = f.tarballs.get("@nodetool-ai/fixture2-nodes@1.0.0")!;
  return { ...f.request.catalog, packs: [...f.request.catalog.packs, { ...f.request.catalog.packs[0], id: "fixture2", requires,
    npm: { name: pin.name, version: pin.version, integrity: pin.integrity } }] };
}

afterEach(async () => { vi.unstubAllEnvs(); await disposePackRegistryFixtures(); });

it("installs into its own npm project with an exact dependency, a lockfile and no scripts, leaving the CLI untouched", async () => {
  const f = await setup();
  const cliBefore = await listing(f.cliRoot);
  const desired = await installPacks(f.request, f.operations);
  const project = f.project();
  const manifest = JSON.parse(await readFile(join(project, "package.json"), "utf8"));
  expect(manifest).toMatchObject({ name: "nodetool-packs", private: true, dependencies: { "@nodetool-ai/fixture-nodes": "1.0.0" },
    nodetool: { coreVersion: "1.0.0", packs: ["fixture"], runtimeLibraries: [] } });
  const lock = JSON.parse(await readFile(join(project, "package-lock.json"), "utf8"));
  expect(lock.packages["node_modules/@nodetool-ai/fixture-nodes"].integrity).toBe(f.request.catalog.packs[0].npm.integrity);
  await expect(stat(join(project, "node_modules/@nodetool-ai/fixture-nodes/SCRIPT_RAN"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await listing(f.cliRoot)).toEqual(cliBefore);
  expect(desired).toMatchObject({ root: join(f.directory, "packs"), packs: ["fixture"], requestedPacks: ["fixture"] });
  expect((await readDesiredState(f.request.stateFile))[join(f.directory, "packs")]?.packs).toEqual(["fixture"]);
  expect(readInstalledPacks(f.request.mode, f.request.catalog).packs.map((pack) => pack.id)).toEqual(["fixture"]);
}, 60_000);

it("a failed load check deletes the staged generation and keeps the active project byte for byte", async () => {
  const f = await setup();
  await expect(installPacks(f.request, { ...f.operations, loadCheck: async () => { throw new Error("fixture load failed"); } })).rejects.toThrow("fixture load failed");
  expect(currentProject(f.packsRoot)).toBeNull();
  expect(await generations(f.packsRoot)).toEqual([]);
  await installPacks(f.request, f.operations);
  const active = f.project();
  const before = { tree: await readInstallTree(active), manifest: await readFile(join(active, "package.json")), lock: await readFile(join(active, "package-lock.json")) };
  const catalog = withSecondPack(f);
  await expect(installPacks({ ...f.request, catalog, packs: ["fixture2"] }, { ...f.operations, loadCheck: async () => { throw new Error("second load failed"); } })).rejects.toThrow("second load failed");
  expect(f.project()).toBe(active);
  expect(await generations(f.packsRoot)).toHaveLength(1);
  expect(await readInstallTree(active)).toEqual(before.tree);
  expect(await readFile(join(active, "package.json"))).toEqual(before.manifest);
  expect(await readFile(join(active, "package-lock.json"))).toEqual(before.lock);
}, 60_000);

it("a wrong catalog integrity fails before the load check and switches nothing", async () => {
  const f = await setup();
  const load = vi.fn(async () => {});
  const catalog = { ...f.request.catalog, packs: f.request.catalog.packs.map((pack) => ({ ...pack, npm: { ...pack.npm, integrity: "sha512-wrong" } })) };
  await expect(installPacks({ ...f.request, catalog }, { ...f.operations, loadCheck: load })).rejects.toThrow(/integrity/);
  expect(load).not.toHaveBeenCalled();
  expect(currentProject(f.packsRoot)).toBeNull();
  expect(await generations(f.packsRoot)).toEqual([]);
}, 60_000);

it("adding a second pack keeps the first through the lockfile and prunes all but the previous generation", async () => {
  const f = await setup();
  const catalog = withSecondPack(f);
  await installPacks({ ...f.request, catalog }, f.operations);
  const first = f.project();
  const desired = await installPacks({ ...f.request, catalog, packs: ["fixture2"] }, f.operations);
  expect(desired.packs).toEqual(["fixture", "fixture2"]);
  const second = f.project();
  expect(second).not.toBe(first);
  expect(JSON.parse(await readFile(join(second, "package.json"), "utf8")).dependencies).toEqual({
    "@nodetool-ai/fixture-nodes": "1.0.0", "@nodetool-ai/fixture2-nodes": "1.0.0" });
  expect(await generations(f.packsRoot)).toEqual([first, second].map((path) => path.slice(f.packsRoot.length + 1)).sort());
  await installPacks({ ...f.request, catalog, packs: [], runtimeLibraries: [] }, f.operations);
  expect(f.project()).toBe(second);
  await removePacks({ ...f.request, catalog, packs: ["fixture2"] }, f.operations);
  expect(await generations(f.packsRoot)).not.toContain(first.slice(f.packsRoot.length + 1));
}, 90_000);

it("removal drops the pack from package.json and node_modules, and keeps a pack another one requires", async () => {
  const f = await setup();
  const catalog = withSecondPack(f, ["fixture"]);
  await installPacks({ ...f.request, catalog, packs: ["fixture2"] }, f.operations);
  expect(readInstalledPacks(f.request.mode, catalog).packs.map((pack) => pack.id)).toEqual(["fixture", "fixture2"]);
  const kept = await removePacks({ ...f.request, catalog, packs: ["fixture"] }, f.operations);
  expect(kept).toMatchObject({ removed: [], kept: ["fixture"] });
  const removed = await removePacks({ ...f.request, catalog, packs: ["fixture2"] }, f.operations);
  expect(removed).toMatchObject({ removed: ["fixture", "fixture2"], kept: [] });
  const project = f.project();
  expect(JSON.parse(await readFile(join(project, "package.json"), "utf8")).dependencies).toEqual({});
  expect(readInstalledPacks(f.request.mode, catalog).packs).toEqual([]);
  expect((await readDesiredState(f.request.stateFile))[join(f.directory, "packs")]?.packs).toEqual([]);
}, 90_000);

it("allowlisted install scripts run only after verification, inside the staged project", async () => {
  const f = await setup(false, { allowScript: true });
  await installPacks(f.request, f.operations);
  expect(await readFile(join(f.project(), "node_modules/@nodetool-ai/fixture-nodes/SCRIPT_RAN"), "utf8")).toBe("bad");
}, 60_000);

it("deleting the packs directory recovers: the next install starts a fresh project", async () => {
  const f = await setup();
  await installPacks(f.request, f.operations);
  await rm(join(f.directory, "packs"), { recursive: true });
  expect(readInstalledPacks(f.request.mode, f.request.catalog).packs).toEqual([]);
  await installPacks(f.request, f.operations);
  expect(readInstalledPacks(f.request.mode, f.request.catalog).packs.map((pack) => pack.id)).toEqual(["fixture"]);
}, 60_000);
