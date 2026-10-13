import { afterEach, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { installPacks as installAuthorizedPacks, type InstallPacksRequest, type InstallerOperations } from "../../src/packs/installer.js";
import { authorizePackInstallCommand } from "../../src/commands/pack-install-authorization.js";
async function installPacks(request: InstallPacksRequest, operations: InstallerOperations) {
  const authorization = await authorizePackInstallCommand({ request, command: "packs-add" });
  if (!authorization) { throw new Error("Missing fixture authorization"); }
  return installAuthorizedPacks(request, authorization, operations);
}
import { snapshotInstallTree, readInstallTree, installTreeRestored } from "../../src/packs/install-tree.js";
import { detectInstallMode } from "../../src/packs/mode.js";
import { setupPackRegistry as setup, disposePackRegistryFixtures } from "../_helpers/pack-registry.js";

const exec = promisify(execFile);
afterEach(async () => { vi.unstubAllEnvs(); await disposePackRegistryFixtures(); });


it("real local registry additive install ignores scripts and saves exact dependency", async () => {
  const f = await setup(); await installPacks(f.request, f.operations);
  expect(JSON.parse(await readFile(join(f.root, "package.json"), "utf8")).dependencies["@nodetool-ai/fixture-nodes"]).toBe("1.0.0");
  await expect(readFile(join(f.root, "node_modules/@nodetool-ai/fixture-nodes/SCRIPT_RAN"))).rejects.toMatchObject({ code: "ENOENT" });
}, 30000);
it("real conflicting dependency plan is refused before mutation", async () => {
  const f = await setup(true); const before = await snapshotInstallTree(f.root);
  await expect(installPacks(f.request, f.operations)).rejects.toThrow(/changes|removes/);
  expect(await snapshotInstallTree(f.root)).toEqual(before);
}, 30000);
it("real failing child load check rolls back the installed tree", async () => {
  const f = await setup(); const before = await snapshotInstallTree(f.root);
  const manifest = await readFile(join(f.root, "package.json"));
  const lock = await readFile(join(f.root, "package-lock.json"));
  const operations = { ...f.operations, loadCheck: async () => { await exec(process.execPath, ["-e", "throw new Error('fixture load failed')"]); } };
  await expect(installPacks(f.request, operations)).rejects.toThrow(/fixture load failed/);
  expect(await snapshotInstallTree(f.root)).toEqual(before);
  expect(await readFile(join(f.root, "package.json"))).toEqual(manifest);
  expect(await readFile(join(f.root, "package-lock.json"))).toEqual(lock);
}, 30000);
it("real wrong catalog integrity fails before child imports and rolls back", async () => {
  const f = await setup(); const before = await snapshotInstallTree(f.root); const load = vi.fn(async () => {});
  const catalog = { ...f.request.catalog, packs: f.request.catalog.packs.map((pack) => ({ ...pack, npm: { ...pack.npm, integrity: "sha512-wrong" } })) };
  await expect(installPacks({ ...f.request, catalog }, { ...f.operations, loadCheck: load })).rejects.toThrow(/integrity/);
  expect(load).not.toHaveBeenCalled(); expect(await snapshotInstallTree(f.root)).toEqual(before);
}, 30000);
it("real global same-version reinstallation plan is refused without changing the prior pack", async () => {
  const f = await setup(); const mode = { ...f.request.mode, kind: "global" as const };
  const pin = f.tarballs.get("@nodetool-ai/fixture2-nodes@1.0.0")!;
  const catalog = { ...f.request.catalog, packs: [...f.request.catalog.packs, { ...f.request.catalog.packs[0], id: "fixture2", npm: { name: pin.name, version: pin.version, integrity: pin.integrity } }] };
  const manifest = await readFile(join(f.root, "package.json"));
  await installPacks({ ...f.request, mode, catalog }, f.operations);
  const before = await snapshotInstallTree(f.root);
  await expect(installPacks({ ...f.request, mode, catalog, packs: ["fixture2"] }, f.operations)).rejects.toThrow(/changes/);
  expect(await snapshotInstallTree(f.root)).toEqual(before);
  expect(await readFile(join(f.root, "package.json"))).toEqual(manifest);
}, 30000);
it("real empty-global-desired rollback explicitly prunes additions and restores the snapshot", async () => {
  const f = await setup(); const before = await snapshotInstallTree(f.root);
  await expect(installPacks({ ...f.request, mode: { ...f.request.mode, kind: "global" } }, {
    ...f.operations, loadCheck: async () => { throw new Error("global child failed"); }
  })).rejects.toThrow("global child failed");
  expect(await snapshotInstallTree(f.root)).toEqual(before);
}, 30000);

async function actualGlobalFixture() {
  const f = await setup(); const prefix = join(f.directory, "global-prefix");
  await exec(process.execPath, [f.npm, "install", "--global", `--prefix=${prefix}`, `--registry=${f.registry}`, `--cache=${join(f.directory, "cache")}`,
    "--ignore-scripts", "--strict-peer-deps", "--legacy-peer-deps=false", "--package-lock=false", "--no-audit", "--no-fund", "@nodetool-ai/cli@1.0.0"]);
  const modules = process.platform === "win32" ? join(prefix, "node_modules") : join(prefix, "lib/node_modules");
  const cliRoot = join(modules, "@nodetool-ai/cli");
  const mode = detectInstallMode(join(cliRoot, "index.js"), { globalNodeModulesRoots: [modules] });
  expect(mode.kind).toBe("global");
  await expect(readFile(join(cliRoot, "node_modules/.package-lock.json"))).rejects.toMatchObject({ code: "ENOENT" });
  const before = await readInstallTree(cliRoot, true); expect(before.missingLock).toBe(true); expect(before.packages).toHaveLength(1);
  return { ...f, request: { ...f.request, mode }, cliRoot, before };
}
it("actual npm global prefix without hidden lock bootstraps an additive verified pack install", async () => {
  const f = await actualGlobalFixture(); await installPacks(f.request, f.operations);
  const after = await snapshotInstallTree(f.cliRoot);
  expect(after.map((entry) => entry.name)).toContain("@nodetool-ai/fixture-nodes");
  expect(after.find((entry) => entry.name === "@nodetool-ai/fixture-nodes")?.integrity).toBe(f.request.catalog.packs[0].npm.integrity);
  const baseline = after.filter((entry) => entry.name === "fixture-baseline");
  expect(installTreeRestored(f.before.packages, baseline, true)).toBe(true);
}, 30000);
it("actual npm global prefix rollback compares identities when baseline hashes were unavailable", async () => {
  const f = await actualGlobalFixture();
  await expect(installPacks(f.request, { ...f.operations, loadCheck: async () => { throw new Error("global bootstrap child failed"); } })).rejects.toThrow("global bootstrap child failed");
  const after = await snapshotInstallTree(f.cliRoot);
  expect(installTreeRestored(f.before.packages, after, true)).toBe(true);
}, 30000);
