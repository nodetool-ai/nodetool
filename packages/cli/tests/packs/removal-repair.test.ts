import { afterEach, expect, it, vi } from "vitest";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { authorizePackInstallCommand } from "../../src/commands/pack-install-authorization.js";
import { installPacks } from "../../src/packs/installer.js";
import { removePacks } from "../../src/packs/removal.js";
import { repairPackInstallation } from "../../src/packs/repair.js";
import { readDesiredState } from "../../src/packs/install-state.js";
import { snapshotInstallTree } from "../../src/packs/install-tree.js";
import { setupPackRegistry, disposePackRegistryFixtures } from "../_helpers/pack-registry.js";

afterEach(async () => { vi.unstubAllEnvs(); await disposePackRegistryFixtures(); });
async function installedFixture() {
  const f = await setupPackRegistry();
  const token = (await authorizePackInstallCommand({ request: f.request, command: "packs-add" }))!;
  await installPacks(f.request, token, f.operations);
  return f;
}
it("real local removal saves the manifest and npm ci does not restore the removed pack", async () => {
  const f = await installedFixture();
  const token = (await authorizePackInstallCommand({ request: f.request, command: "packs-remove" }))!;
  const result = await removePacks(f.request, token, f.operations);
  expect(result.removed).toEqual(["fixture"]); expect(result.desired.packs).toEqual([]);
  expect(JSON.parse(await readFile(join(f.root, "package.json"), "utf8")).dependencies["@nodetool-ai/fixture-nodes"]).toBeUndefined();
  await f.operations.npm(f.root, ["ci"], { mode: "local" });
  expect((await snapshotInstallTree(f.root)).map((entry) => entry.name)).toEqual(["fixture-baseline"]);
}, 30000);
it("a pack required by another installed pack is retained without npm mutation", async () => {
  const f = await installedFixture(); const second = f.tarballs.get("@nodetool-ai/fixture2-nodes@1.0.0")!;
  const catalog = { ...f.request.catalog, packs: [...f.request.catalog.packs, { ...f.request.catalog.packs[0], id: "fixture2", requires: ["fixture"],
    npm: { name: second.name, version: second.version, integrity: second.integrity } }] };
  const addRequest = { ...f.request, catalog, packs: ["fixture2"] };
  await installPacks(addRequest, (await authorizePackInstallCommand({ request: addRequest, command: "packs-add" }))!, f.operations);
  const request = { ...f.request, catalog };
  const token = (await authorizePackInstallCommand({ request, command: "packs-remove" }))!;
  const npm = vi.fn(f.operations.npm); const before = await snapshotInstallTree(f.root);
  const result = await removePacks(request, token, { ...f.operations, npm });
  expect(result.kept).toEqual(["fixture"]); expect(result.removed).toEqual([]); expect(npm).not.toHaveBeenCalled();
  expect(await snapshotInstallTree(f.root)).toEqual(before);
}, 30000);
it("remove tokens cannot install and install tokens cannot remove before npm or locking", async () => {
  const f = await installedFixture(); const npm = vi.fn(f.operations.npm); const npmVersion = vi.fn(f.operations.npmVersion);
  const install = (await authorizePackInstallCommand({ request: f.request, command: "packs-add" }))!;
  const remove = (await authorizePackInstallCommand({ request: f.request, command: "packs-remove" }))!;
  await expect(removePacks(f.request, install, { ...f.operations, npm, npmVersion })).rejects.toThrow(/cannot authorize remove/);
  await expect(installPacks(f.request, remove, { ...f.operations, npm, npmVersion })).rejects.toThrow(/cannot authorize install/);
  expect(npm).not.toHaveBeenCalled(); expect(npmVersion).not.toHaveBeenCalled();
}, 30000);
it("repair verifies a valid interrupted tree before clearing dirty state without reinstalling", async () => {
  const f = await installedFixture(); const state = await readDesiredState(f.request.stateFile);
  await writeFile(f.request.stateFile, JSON.stringify({ ...state, [f.root]: { ...state[f.root], dirty: true } }));
  const request = { ...f.request, packs: [] };
  const token = (await authorizePackInstallCommand({ request, command: "packs-repair" }))!;
  const npm = vi.fn(f.operations.npm); const loadCheck = vi.fn(f.operations.loadCheck);
  const desired = await repairPackInstallation(request, token, { ...f.operations, npm, loadCheck });
  expect(desired.dirty).toBe(false); expect(loadCheck).toHaveBeenCalledWith(request.mode, ["fixture"], undefined);
  expect(npm).not.toHaveBeenCalled(); expect((await readDesiredState(request.stateFile))[f.root].dirty).toBe(false);
}, 30000);
it("repair registration failure retains dirty state", async () => {
  const f = await installedFixture(); const state = await readDesiredState(f.request.stateFile);
  await writeFile(f.request.stateFile, JSON.stringify({ ...state, [f.root]: { ...state[f.root], dirty: true } }));
  const request = { ...f.request, packs: [] }; const token = (await authorizePackInstallCommand({ request, command: "packs-repair" }))!;
  await expect(repairPackInstallation(request, token, { ...f.operations, loadCheck: async () => { throw new Error("registration invalid"); } })).rejects.toThrow(/registration invalid/);
  expect((await readDesiredState(request.stateFile))[f.root].dirty).toBe(true);
}, 30000);
it("repair restores missing desired optional packs using its explicit current-cohort scope", async () => {
  const f = await setupPackRegistry();
  await writeFile(f.request.stateFile, JSON.stringify({ [f.root]: { root: f.root, coreVersion: "1.0.0", packs: ["fixture"], runtimeLibraries: [], dirty: true } }));
  const request = { ...f.request, packs: [] }; const token = (await authorizePackInstallCommand({ request, command: "packs-repair" }))!;
  const result = await repairPackInstallation(request, token, f.operations);
  expect(result.packs).toEqual(["fixture"]); expect(result.dirty).toBe(false);
  expect((await snapshotInstallTree(f.root)).some((entry) => entry.name === "@nodetool-ai/fixture-nodes")).toBe(true);
}, 30000);
it("non-npm external runtime requirements do not block installation or authorize binary installs", async () => {
  const f = await setupPackRegistry(); const catalog = { ...f.request.catalog, packs: f.request.catalog.packs.map((pack) => ({ ...pack, runtimeLibraries: ["ffmpeg", "blender"] })) };
  const request = { ...f.request, catalog };
  const token = (await authorizePackInstallCommand({ request, command: "packs-add" }))!;
  expect((await installPacks(request, token, f.operations)).runtimeLibraries).toEqual([]);
  await expect(authorizePackInstallCommand({ request: { ...request, runtimeLibraries: ["ffmpeg"] }, command: "packs-add" })).rejects.toThrow(/cannot be installed by npm/);
}, 30000);
it("real removal rollback restores the whole tree and local manifests after a child failure", async () => {
  const f = await installedFixture(); const before = await snapshotInstallTree(f.root);
  const manifest = await readFile(join(f.root, "package.json")); const lock = await readFile(join(f.root, "package-lock.json"));
  const token = (await authorizePackInstallCommand({ request: f.request, command: "packs-remove" }))!;
  await expect(removePacks(f.request, token, { ...f.operations, loadCheck: async () => { throw new Error("retained registration failed"); } })).rejects.toThrow("retained registration failed");
  expect(await snapshotInstallTree(f.root)).toEqual(before);
  expect(await readFile(join(f.root, "package.json"))).toEqual(manifest); expect(await readFile(join(f.root, "package-lock.json"))).toEqual(lock);
}, 30000);
it("physical core dependencies retain a requested runtime alias without invoking npm", async () => {
  const f = await setupPackRegistry(); const compiler = join(f.root, "node_modules/typescript"); await mkdir(compiler);
  await writeFile(join(compiler, "package.json"), '{"name":"@typescript/typescript6","version":"6.0.2"}');
  const lock = JSON.parse(await readFile(join(f.root, "node_modules/.package-lock.json"), "utf8"));
  lock.packages["node_modules/typescript"] = { version: "6.0.2", integrity: "sha512-compiler" };
  await writeFile(join(f.root, "node_modules/.package-lock.json"), JSON.stringify(lock));
  await writeFile(join(f.root, "package.json"), '{"name":"@nodetool-ai/cli","version":"1.0.0","dependencies":{"fixture-baseline":"1.0.0","typescript":"6.0.2"}}');
  const catalog = { ...f.request.catalog, installPins: [{ name: "@typescript/typescript6", installName: "typescript", version: "6.0.2", integrity: "sha512-compiler" }] };
  const request = { ...f.request, mode: { ...f.request.mode, kind: "global" as const }, catalog, packs: [], runtimeLibraries: ["typescript"] };
  const token = (await authorizePackInstallCommand({ request, command: "packs-remove" }))!;
  const npm = vi.fn(f.operations.npm); const result = await removePacks(request, token, { ...f.operations, npm });
  expect(result.kept).toEqual(["typescript"]); expect(result.removed).toEqual([]); expect(npm).not.toHaveBeenCalled();
  expect((await snapshotInstallTree(f.root)).some((entry) => entry.path === "node_modules/typescript")).toBe(true);
}, 30000);
it("an expanded removal ownership path after authorization is rejected before npm", async () => {
  const f = await installedFixture(); const extra = join(f.root, "node_modules/unrelated-package"); await mkdir(extra);
  await writeFile(join(extra, "package.json"), '{"name":"unrelated-package","version":"1"}');
  const lock = JSON.parse(await readFile(join(f.root, "node_modules/.package-lock.json"), "utf8")); lock.packages["node_modules/unrelated-package"] = { version: "1" };
  await writeFile(join(f.root, "node_modules/.package-lock.json"), JSON.stringify(lock));
  const token = (await authorizePackInstallCommand({ request: f.request, command: "packs-remove" }))!;
  const path = join(f.root, "node_modules/@nodetool-ai/fixture-nodes/package.json"); const manifest = JSON.parse(await readFile(path, "utf8"));
  await writeFile(path, JSON.stringify({ ...manifest, dependencies: { "unrelated-package": "1" } }));
  const npm = vi.fn(f.operations.npm);
  await expect(removePacks(f.request, token, { ...f.operations, npm })).rejects.toThrow(/outside the install authorization/);
  expect(npm).not.toHaveBeenCalled(); expect((await snapshotInstallTree(f.root)).some((entry) => entry.name === "unrelated-package")).toBe(true);
}, 30000);
