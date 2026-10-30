import { mkdir, readFile, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPackCommandServices } from "../../src/packs/command-service.js";
import { readCatalogNodes } from "@nodetool-ai/node-catalog";
import { readInstalledPacks } from "@nodetool-ai/pack-manager/packs/installed";
import { prepareInstallSelection } from "@nodetool-ai/pack-manager/packs/install-selection";
import { readDesiredState } from "@nodetool-ai/pack-manager/packs/install-state";
import { setupPackRegistry, disposePackRegistryFixtures } from "../../../pack-manager/tests/_helpers/pack-registry.js";

afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await disposePackRegistryFixtures(); });

describe("node command services with actual npm", () => {
  it("adds with --yes, reports the installed tree, verifies registration and explicitly restores recorded intent", async () => {
    vi.stubEnv("NODETOOL_PACKS_INSTALLER", undefined);
    const f = await setupPackRegistry();
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const services = () => createPackCommandServices({ snapshot: readInstalledPacks(f.request.mode, f.request.catalog),
      catalog: f.request.catalog, stateFile: f.request.stateFile, operations: f.operations });
    expect((await (await services()).list()).find(row => row.id === "fixture")?.installed).toBe(false);
    await (await services()).add(["fixture"], { yes: true });
    expect(JSON.parse(await readFile(join(f.root, "node_modules/@nodetool-ai/fixture-nodes/package.json"), "utf8"))).toMatchObject({ version: "1.0.0" });
    expect((await (await services()).why("fixture"))).toMatchObject({ installed: true, version: "1.0.0" });
    expect(await (await services()).doctor({ installed: true })).toMatchObject({ healthy: true, dirty: false });
    const state = await readDesiredState(f.request.stateFile);
    expect(state[f.root].packs).toEqual(["fixture"]);
    await (await services()).add([], { restore: true, yes: true });
    expect((await (await services()).list()).find(row => row.id === "fixture")?.installed).toBe(true);
    expect(log).not.toHaveBeenCalled();
  }, 60_000);

  it("collects the entire explicitly named graph before one installation", async () => {
    const f = await setupPackRegistry();
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const catalog = { ...f.request.catalog, owners: { "fixture.Absent": "fixture" } };
    const file = join(f.directory, "workflow.json");
    await writeFile(file, JSON.stringify({ nodes: [{ id: "n", type: "fixture.Absent", properties: {} }], edges: [] }));
    const service = await createPackCommandServices({ snapshot: readInstalledPacks(f.request.mode, catalog), catalog,
      catalogNodes: [{ ...readCatalogNodes()[0], node_type: "fixture.Absent", pack: "fixture" }],
      stateFile: f.request.stateFile, operations: f.operations });
    await service.add([], { for: file, yes: true });
    expect(readInstalledPacks(f.request.mode, catalog).packs.map(pack => pack.id)).toEqual(["fixture"]);
  }, 60_000);

  it("requires noninteractive confirmation before npm", async () => {
    const f = await setupPackRegistry();
    const npm = vi.spyOn(f.operations, "npm");
    const service = await createPackCommandServices({ snapshot: readInstalledPacks(f.request.mode, f.request.catalog),
      catalog: f.request.catalog, stateFile: f.request.stateFile, operations: f.operations });
    vi.stubEnv("CI", "1");
    await expect(service.add(["fixture"], {})).rejects.toThrow("Use --yes");
    expect(npm).not.toHaveBeenCalled();
  }, 60_000);

  it("does not overlook a missing runtime library merely because the owning node pack is installed", async () => {
    const f = await setupPackRegistry();
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const initial = await createPackCommandServices({ snapshot: readInstalledPacks(f.request.mode, f.request.catalog),
      catalog: f.request.catalog, stateFile: f.request.stateFile, operations: f.operations });
    await initial.add(["fixture"], { yes: true });
    const catalog = { ...f.request.catalog, owners: { "fixture.Installed": "fixture" },
      packs: [{ ...f.request.catalog.packs[0], runtimeLibraries: ["rapier"] }] };
    const file = join(f.directory, "runtime-workflow.json");
    await writeFile(file, JSON.stringify({ nodes: [{ id: "n", type: "fixture.Installed", properties: {} }], edges: [] }));
    const npm = vi.spyOn(f.operations, "npm");
    const service = await createPackCommandServices({ snapshot: readInstalledPacks(f.request.mode, catalog), catalog,
      catalogNodes: [{ ...readCatalogNodes()[0], node_type: "fixture.Installed", pack: "fixture" }],
      stateFile: f.request.stateFile, operations: f.operations });
    // The fixture deliberately has no public runtime tarballs or release pins.
    // Selection must reach the missing pin refusal rather than report nothing missing.
    await expect(service.add([], { for: file, yes: true })).rejects.toThrow(/pin/i);
    expect(npm).not.toHaveBeenCalled();
  }, 60_000);

  it("removes an installed pack through its live explicit authorization", async () => {
    const f = await setupPackRegistry();
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const service = () => createPackCommandServices({ snapshot: readInstalledPacks(f.request.mode, f.request.catalog),
      catalog: f.request.catalog, stateFile: f.request.stateFile, operations: f.operations });
    await (await service()).add(["fixture"], { yes: true });
    await (await service()).remove(["fixture"]);
    expect(readInstalledPacks(f.request.mode, f.request.catalog).packs).toEqual([]);
    expect((await readDesiredState(f.request.stateFile))[f.root].packs).toEqual([]);
    expect(JSON.parse(await readFile(join(f.root, "node_modules/fixture-baseline/package.json"), "utf8"))).toMatchObject({ version: "1.0.0" });
    expect(log).toHaveBeenCalledWith("Removed: fixture");
  }, 60_000);

  it("reports dirty intent and clears it only after an explicit repair and fresh child load", async () => {
    const f = await setupPackRegistry();
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const service = () => createPackCommandServices({ snapshot: readInstalledPacks(f.request.mode, f.request.catalog),
      catalog: f.request.catalog, stateFile: f.request.stateFile, operations: f.operations });
    await (await service()).add(["fixture"], { yes: true });
    const state = await readDesiredState(f.request.stateFile);
    await writeFile(f.request.stateFile, JSON.stringify({ ...state, [f.root]: { ...state[f.root], dirty: true } }));
    const load = vi.spyOn(f.operations, "loadCheck");
    const dirty = await service();
    expect(await dirty.doctor({})).toMatchObject({ healthy: false, dirty: true });
    expect(await dirty.doctor({ repair: true })).toMatchObject({ healthy: true, dirty: false });
    expect(load).toHaveBeenCalled();
    expect((await readDesiredState(f.request.stateFile))[f.root].dirty).not.toBe(true);
  }, 60_000);
});


describe("managed runtime diagnostics", () => {
  async function compilerFixture(version: string, options: { nested?: boolean; installPack?: boolean } = {}) {
    const f = await setupPackRegistry();
    // npm may regenerate synthetic hidden-lock pins. Finish real installs
    // before injecting the compiler used by read-only diagnostic assertions.
    if (options.installPack) {
      const service = await createPackCommandServices({ snapshot: readInstalledPacks(f.request.mode, f.request.catalog),
        catalog: f.request.catalog, stateFile: f.request.stateFile, operations: f.operations });
      await service.add(["fixture"], { yes: true });
    }
    const path = options.nested ? "node_modules/fixture-baseline/node_modules/esbuild" : "node_modules/esbuild";
    await mkdir(join(f.root, path), { recursive: true });
    await writeFile(join(f.root, path, "package.json"), JSON.stringify({ name: "esbuild", version }));
    const lockFile = join(f.root, "node_modules/.package-lock.json");
    const lock = JSON.parse(await readFile(lockFile, "utf8"));
    lock.packages[path] = { version, integrity: "compiler-integrity" };
    await writeFile(lockFile, JSON.stringify(lock));
    const catalog = { ...f.request.catalog, installPins: [{ name: "esbuild", version: "0.28.1", integrity: "compiler-integrity" }] };
    const service = () => createPackCommandServices({ snapshot: readInstalledPacks(f.request.mode, catalog), catalog,
      stateFile: f.request.stateFile, operations: f.operations });
    return { ...f, catalog, service };
  }

  it("keeps an incidental compiler healthy without treating it as the managed runtime", async () => {
    const f = await compilerFixture("0.28.2");
    expect(await (await f.service()).doctor({})).toMatchObject({ healthy: true });
    expect((await (await f.service()).list()).find(row => row.id === "esbuild")).toMatchObject({ installed: false });
    await writeFile(f.request.stateFile, JSON.stringify({ [f.root]: { root: f.root, coreVersion: "1.0.0", packs: [], runtimeLibraries: ["esbuild"] } }));
    const desired = await (await f.service()).doctor({});
    expect(desired).toMatchObject({ healthy: false, issues: [expect.objectContaining({ kind: "integrity" })] });
  }, 30_000);

  it("rejects an npm install that rewrites a synthetic compiler integrity pin", async () => {
    const f = await compilerFixture("0.28.2");
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await utimes(join(f.root, "node_modules/.package-lock.json"), 0, 0);
    await expect((await f.service()).add(["fixture"], { yes: true })).rejects.toMatchObject({
      message: expect.stringContaining("rollback did not restore the tree"),
      cause: expect.objectContaining({ message: "Install changed an existing package: node_modules/esbuild" })
    });
    const lock = JSON.parse(await readFile(join(f.root, "node_modules/.package-lock.json"), "utf8"));
    expect(lock.packages["node_modules/esbuild"]?.integrity).not.toBe("compiler-integrity");
    expect((await readDesiredState(f.request.stateFile))[f.root].dirty).toBe(true);
  }, 30_000);

  it("requires declared runtimes for independently installed core and node packs", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const f = await compilerFixture("0.28.2", { installPack: true });
    const baseline = f.catalog.packs[0].npm;
    const inspect = async (kind: "core" | "node-pack", runtimeLibraries: readonly string[]) => {
      const catalog = { ...f.catalog, packs: [{ ...f.catalog.packs[0], id: "data", kind,
        npm: { name: baseline.name, version: baseline.version, integrity: baseline.integrity }, runtimeLibraries }] };
      const snapshot = readInstalledPacks(f.request.mode, catalog);
      expect(snapshot.packs.map(pack => pack.id)).toEqual(["data"]);
      const service = await createPackCommandServices({ snapshot, catalog,
        stateFile: f.request.stateFile, operations: f.operations });
      const selection = await prepareInstallSelection({ ...f.request, packs: ["data"], catalog });
      expect(selection.runtimeLibraries).toEqual(runtimeLibraries);
      return service.doctor({});
    };
    for (const kind of ["core", "node-pack"] as const) {
      expect(await inspect(kind, [])).toMatchObject({ healthy: true });
      expect(await inspect(kind, ["imaging"])).toMatchObject({ healthy: false,
        issues: [expect.objectContaining({ kind: "integrity", message: expect.stringContaining("has no catalog integrity pin") })] });
    }
  }, 30_000);

  it("does not advertise or replay a nested matching compiler as a root runtime", async () => {
    const f = await compilerFixture("0.28.1", { nested: true });
    await writeFile(f.request.stateFile, JSON.stringify({ [f.root]: { root: f.root, coreVersion: "1.0.0", packs: [], runtimeLibraries: ["esbuild"] } }));
    expect((await (await f.service()).list()).find(row => row.id === "esbuild")).toMatchObject({ installed: false });
    expect(await prepareInstallSelection({ ...f.request, packs: [], catalog: f.catalog })).toMatchObject({ replayLibraries: [] });
    expect(await (await f.service()).doctor({})).toMatchObject({ healthy: false });
  }, 30_000);
});
