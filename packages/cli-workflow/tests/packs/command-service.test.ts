import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
    expect(JSON.parse(await readFile(join(f.project(), "node_modules/@nodetool-ai/fixture-nodes/package.json"), "utf8"))).toMatchObject({ version: "1.0.0" });
    expect((await (await services()).why("fixture"))).toMatchObject({ installed: true, version: "1.0.0" });
    expect(await (await services()).doctor({ installed: true })).toMatchObject({ healthy: true, projectRoot: f.project() });
    const state = await readDesiredState(f.request.stateFile);
    expect(state[join(f.directory, "packs")].packs).toEqual(["fixture"]);
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
    expect((await readDesiredState(f.request.stateFile))[join(f.directory, "packs")].packs).toEqual([]);
    expect(log).toHaveBeenCalledWith("Removed: fixture");
  }, 60_000);

  it("reports a damaged project and rebuilds it only after an explicit repair and fresh child load", async () => {
    const f = await setupPackRegistry();
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const service = () => createPackCommandServices({ snapshot: readInstalledPacks(f.request.mode, f.request.catalog),
      catalog: f.request.catalog, stateFile: f.request.stateFile, operations: f.operations });
    await (await service()).add(["fixture"], { yes: true });
    const damaged = f.project();
    await rm(join(damaged, "node_modules/@nodetool-ai/fixture-nodes"), { recursive: true });
    const load = vi.spyOn(f.operations, "loadCheck");
    const broken = await service();
    expect(await broken.doctor({})).toMatchObject({ healthy: false, issues: [expect.objectContaining({ kind: "integrity" })] });
    expect(load).not.toHaveBeenCalled();
    expect(await broken.doctor({ repair: true })).toMatchObject({ healthy: true });
    expect(load).toHaveBeenCalled();
    expect(f.project()).not.toBe(damaged);
    expect(await (await service()).doctor({})).toMatchObject({ healthy: true, issues: [] });
  }, 60_000);
});

describe("managed runtime diagnostics", () => {
  it("does not advertise a nested copy of a runtime library as installed", async () => {
    const f = await setupPackRegistry();
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const initial = await createPackCommandServices({ snapshot: readInstalledPacks(f.request.mode, f.request.catalog),
      catalog: f.request.catalog, stateFile: f.request.stateFile, operations: f.operations });
    await initial.add(["fixture"], { yes: true });
    const path = "node_modules/@nodetool-ai/fixture-nodes/node_modules/esbuild";
    await mkdir(join(f.project(), path), { recursive: true });
    await writeFile(join(f.project(), path, "package.json"), JSON.stringify({ name: "esbuild", version: "0.28.1" }));
    const lockFile = join(f.project(), "node_modules/.package-lock.json");
    const lock = JSON.parse(await readFile(lockFile, "utf8"));
    lock.packages[path] = { version: "0.28.1", integrity: "compiler-integrity" };
    await writeFile(lockFile, JSON.stringify(lock));
    const catalog = { ...f.request.catalog, installPins: [{ name: "esbuild", version: "0.28.1", integrity: "compiler-integrity" }] };
    const service = await createPackCommandServices({ snapshot: readInstalledPacks(f.request.mode, catalog), catalog,
      stateFile: f.request.stateFile, operations: f.operations });
    expect((await service.list()).find(row => row.id === "esbuild")).toMatchObject({ installed: false });
    expect(await service.doctor({})).toMatchObject({ healthy: true });
  }, 60_000);

  it("requires declared runtimes for selected core and node packs", async () => {
    const f = await setupPackRegistry();
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const initial = await createPackCommandServices({ snapshot: readInstalledPacks(f.request.mode, f.request.catalog),
      catalog: f.request.catalog, stateFile: f.request.stateFile, operations: f.operations });
    await initial.add(["fixture"], { yes: true });
    const inspect = async (kind: "core" | "node-pack", runtimeLibraries: readonly string[]) => {
      const catalog = { ...f.request.catalog, packs: [{ ...f.request.catalog.packs[0], kind, runtimeLibraries }] };
      const service = await createPackCommandServices({ snapshot: readInstalledPacks(f.request.mode, catalog), catalog,
        stateFile: f.request.stateFile, operations: f.operations });
      expect((await prepareInstallSelection({ ...f.request, packs: [], catalog })).runtimeLibraries).toEqual(runtimeLibraries);
      return service.doctor({});
    };
    for (const kind of ["core", "node-pack"] as const) {
      expect(await inspect(kind, [])).toMatchObject({ healthy: true });
      expect(await inspect(kind, ["imaging"])).toMatchObject({ healthy: false,
        issues: [expect.objectContaining({ kind: "integrity", message: expect.stringContaining("has no integrity pins") })] });
    }
  }, 60_000);
});
