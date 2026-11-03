import { afterEach, expect, it, vi } from "vitest";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { authorizePackInstallCommand } from "../../src/commands/pack-install-authorization.js";
import { installPacks } from "../../src/packs/installer.js";
import { removePacks } from "../../src/packs/removal.js";
import { repairPackInstallation } from "../../src/packs/repair.js";
import { readInstallTree } from "../../src/packs/install-tree.js";
import { currentProject } from "../../src/packs/project.js";
import { setupPackRegistry, disposePackRegistryFixtures } from "../_helpers/pack-registry.js";

afterEach(async () => { vi.unstubAllEnvs(); await disposePackRegistryFixtures(); });
async function installedFixture() {
  const f = await setupPackRegistry();
  const token = (await authorizePackInstallCommand({ request: f.request, command: "packs-add" }))!;
  await installPacks(f.request, token, f.operations);
  return f;
}

it("removal records the remaining selection, and npm ci of the new project does not restore the removed pack", async () => {
  const f = await installedFixture();
  const token = (await authorizePackInstallCommand({ request: f.request, command: "packs-remove" }))!;
  const result = await removePacks(f.request, token, f.operations);
  expect(result.removed).toEqual(["fixture"]); expect(result.desired.packs).toEqual([]);
  const project = f.project();
  expect(JSON.parse(await readFile(join(project, "package.json"), "utf8"))).toMatchObject({ dependencies: {}, nodetool: { packs: [] } });
  await f.run(project, ["ci"]);
  expect(await readInstallTree(project)).toEqual([]);
}, 60_000);

it("a pack another selected pack requires is kept without running npm", async () => {
  const f = await installedFixture(); const second = f.tarballs.get("@nodetool-ai/fixture2-nodes@1.0.0")!;
  const catalog = { ...f.request.catalog, packs: [...f.request.catalog.packs, { ...f.request.catalog.packs[0], id: "fixture2", requires: ["fixture"],
    npm: { name: second.name, version: second.version, integrity: second.integrity } }] };
  const addRequest = { ...f.request, catalog, packs: ["fixture2"] };
  await installPacks(addRequest, (await authorizePackInstallCommand({ request: addRequest, command: "packs-add" }))!, f.operations);
  const request = { ...f.request, catalog };
  const npm = vi.fn(f.operations.npm); const project = f.project();
  // fixture was requested on its own, so removing fixture2 keeps it.
  const removeSecond = { ...request, packs: ["fixture2"] };
  expect(await removePacks(removeSecond, (await authorizePackInstallCommand({ request: removeSecond, command: "packs-remove" }))!, { ...f.operations, npm }))
    .toMatchObject({ removed: ["fixture2"], kept: [] });
  expect(npm).toHaveBeenCalledTimes(1);
  expect(f.project()).not.toBe(project);
  await installPacks(addRequest, (await authorizePackInstallCommand({ request: addRequest, command: "packs-add" }))!, f.operations);
  const current = f.project();
  const removeFirst = { ...request, packs: ["fixture"] };
  const kept = await removePacks({ ...removeFirst, packs: ["fixture"] }, (await authorizePackInstallCommand({ request: removeFirst, command: "packs-remove" }))!, { ...f.operations, npm });
  expect(kept).toMatchObject({ removed: [], kept: ["fixture"] });
  expect(npm).toHaveBeenCalledTimes(2);
  expect(f.project()).not.toBe(current);
  expect(JSON.parse(await readFile(join(f.project(), "package.json"), "utf8")).nodetool.packs).toEqual(["fixture2"]);
}, 90_000);

it("remove tokens cannot install and install tokens cannot remove before npm or locking", async () => {
  const f = await installedFixture(); const npm = vi.fn(f.operations.npm); const npmVersion = vi.fn(f.operations.npmVersion);
  const install = (await authorizePackInstallCommand({ request: f.request, command: "packs-add" }))!;
  const remove = (await authorizePackInstallCommand({ request: f.request, command: "packs-remove" }))!;
  await expect(removePacks(f.request, install, { ...f.operations, npm, npmVersion })).rejects.toThrow(/cannot authorize remove/);
  await expect(installPacks(f.request, remove, { ...f.operations, npm, npmVersion })).rejects.toThrow(/cannot authorize install/);
  expect(npm).not.toHaveBeenCalled(); expect(npmVersion).not.toHaveBeenCalled();
}, 60_000);

it("repair rebuilds a damaged project as a new generation and load-checks it", async () => {
  const f = await installedFixture(); const damaged = f.project();
  await rm(join(damaged, "node_modules/@nodetool-ai/fixture-nodes"), { recursive: true });
  const request = { ...f.request, packs: [] };
  const token = (await authorizePackInstallCommand({ request, command: "packs-repair" }))!;
  const loadCheck = vi.fn(f.operations.loadCheck);
  const desired = await repairPackInstallation(request, token, { ...f.operations, loadCheck });
  expect(desired.packs).toEqual(["fixture"]);
  const project = f.project();
  expect(project).not.toBe(damaged);
  expect(loadCheck).toHaveBeenCalledWith({ cliRoot: f.cliRoot, projectRoot: project }, ["fixture"], undefined);
  expect((await readInstallTree(project)).some((entry) => entry.name === "@nodetool-ai/fixture-nodes")).toBe(true);
}, 60_000);

it("a failed repair keeps the generation it was asked to repair", async () => {
  const f = await installedFixture(); const active = f.project();
  const request = { ...f.request, packs: [] }; const token = (await authorizePackInstallCommand({ request, command: "packs-repair" }))!;
  await expect(repairPackInstallation(request, token, { ...f.operations, loadCheck: async () => { throw new Error("registration invalid"); } })).rejects.toThrow(/registration invalid/);
  expect(f.project()).toBe(active);
}, 60_000);

it("repair restores the desired set recorded by an earlier release under its install root", async () => {
  const f = await setupPackRegistry();
  await writeFile(f.request.stateFile, JSON.stringify({ [f.cliRoot]: { root: f.cliRoot, coreVersion: "1.0.0", packs: ["fixture"], runtimeLibraries: [], dirty: true } }));
  const request = { ...f.request, packs: [] }; const token = (await authorizePackInstallCommand({ request, command: "packs-repair" }))!;
  const result = await repairPackInstallation(request, token, f.operations);
  expect(result).toMatchObject({ root: join(f.directory, "packs"), packs: ["fixture"] });
  expect(result.dirty).toBeUndefined();
  expect(currentProject(f.packsRoot)).not.toBeNull();
}, 60_000);

it("non-npm external runtime requirements do not block installation or authorize binary installs", async () => {
  const f = await setupPackRegistry(); const catalog = { ...f.request.catalog, packs: f.request.catalog.packs.map((pack) => ({ ...pack, runtimeLibraries: ["ffmpeg", "blender"] })) };
  const request = { ...f.request, catalog };
  const token = (await authorizePackInstallCommand({ request, command: "packs-add" }))!;
  expect((await installPacks(request, token, f.operations)).runtimeLibraries).toEqual([]);
  await expect(authorizePackInstallCommand({ request: { ...request, runtimeLibraries: ["ffmpeg"] }, command: "packs-add" })).rejects.toThrow(/cannot be installed by npm/);
}, 60_000);

it("a failed removal keeps the active generation and its pack", async () => {
  const f = await installedFixture(); const active = f.project(); const before = await readInstallTree(active);
  const token = (await authorizePackInstallCommand({ request: f.request, command: "packs-remove" }))!;
  const npm = vi.fn(async () => { throw new Error("npm removal failed"); });
  await expect(removePacks(f.request, token, { ...f.operations, npm })).rejects.toThrow("npm removal failed");
  expect(f.project()).toBe(active);
  expect(await readInstallTree(active)).toEqual(before);
}, 60_000);
