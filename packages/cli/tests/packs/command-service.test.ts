import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNodeCommandServices } from "../../src/packs/command-service.js";
import { readCatalogNodes } from "@nodetool-ai/node-catalog";
import { readInstalledPacks } from "../../src/packs/installed.js";
import { readDesiredState } from "../../src/packs/install-state.js";
import { setupPackRegistry, disposePackRegistryFixtures } from "../_helpers/pack-registry.js";

afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await disposePackRegistryFixtures(); });

describe("node command services with actual npm", () => {
  it("adds with --yes, reports the installed tree, verifies registration and explicitly restores recorded intent", async () => {
    const f = await setupPackRegistry();
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const services = () => createNodeCommandServices({ snapshot: readInstalledPacks(f.request.mode, f.request.catalog),
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
    const service = await createNodeCommandServices({ snapshot: readInstalledPacks(f.request.mode, catalog), catalog,
      catalogNodes: [{ ...readCatalogNodes()[0], node_type: "fixture.Absent", pack: "fixture" }],
      stateFile: f.request.stateFile, operations: f.operations });
    await service.add([], { for: file, yes: true });
    expect(readInstalledPacks(f.request.mode, catalog).packs.map(pack => pack.id)).toEqual(["fixture"]);
  }, 60_000);

  it("requires noninteractive confirmation and refuses preview-disabled installs before npm", async () => {
    const f = await setupPackRegistry();
    const npm = vi.spyOn(f.operations, "npm");
    const service = await createNodeCommandServices({ snapshot: readInstalledPacks(f.request.mode, f.request.catalog),
      catalog: f.request.catalog, stateFile: f.request.stateFile, operations: f.operations });
    vi.stubEnv("NODETOOL_PACKS_INSTALLER", "0");
    await expect(service.add(["fixture"], { yes: true })).rejects.toThrow("disabled");
    expect(npm).not.toHaveBeenCalled();
  }, 60_000);

  it("does not overlook a missing runtime library merely because the owning node pack is installed", async () => {
    const f = await setupPackRegistry();
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const initial = await createNodeCommandServices({ snapshot: readInstalledPacks(f.request.mode, f.request.catalog),
      catalog: f.request.catalog, stateFile: f.request.stateFile, operations: f.operations });
    await initial.add(["fixture"], { yes: true });
    const catalog = { ...f.request.catalog, owners: { "fixture.Installed": "fixture" },
      packs: [{ ...f.request.catalog.packs[0], runtimeLibraries: ["rapier"] }] };
    const file = join(f.directory, "runtime-workflow.json");
    await writeFile(file, JSON.stringify({ nodes: [{ id: "n", type: "fixture.Installed", properties: {} }], edges: [] }));
    const npm = vi.spyOn(f.operations, "npm");
    const service = await createNodeCommandServices({ snapshot: readInstalledPacks(f.request.mode, catalog), catalog,
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
    const service = () => createNodeCommandServices({ snapshot: readInstalledPacks(f.request.mode, f.request.catalog),
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
    const service = () => createNodeCommandServices({ snapshot: readInstalledPacks(f.request.mode, f.request.catalog),
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
