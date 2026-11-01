import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { initializeInstalledExecutionHost, loadInstalledCommandFeature, verifyCliFeature } from "../src/cli-feature.js";
import { registerPackCommands } from "../src/commands/packs.js";
import type { CatalogPack, NodeCatalogIndex } from "@nodetool-ai/pack-core/types";
import type { InstalledPackSnapshot } from "../src/packs/installed.js";
import { createPackCommandServices } from "../src/packs/command-service.js";
import { configureCliPackHost, loadCliPackSnapshot } from "../src/packs/host.js";
import { readInstalledPacks } from "../src/packs/installed.js";

const roots: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const pack: CatalogPack = { id: "cli-workflow", kind: "cli-feature", npm: { name: "@nodetool-ai/cli-workflow", version: "0.8.4", integrity: "sha512-fixture" }, registrar: "feature", provides: [], requires: [], runtimeLibraries: [], secrets: [], scriptAllowlist: [], installBytes: 0, nodeCount: 0 };
const catalog: NodeCatalogIndex = { schemaVersion: 1, coreVersion: "0.8.4", packs: [pack], owners: {} };
/** A local CLI in `<root>/node_modules` with cli-workflow installed in its pack project. */
async function fixture(source: string): Promise<InstalledPackSnapshot> {
  const root = await mkdtemp(join(tmpdir(), "cli-feature-")); roots.push(root);
  const cliRoot = join(root, "node_modules/@nodetool-ai/cli");
  await mkdir(cliRoot, { recursive: true });
  await writeFile(join(cliRoot, "package.json"), JSON.stringify({ name: "@nodetool-ai/cli", version: "0.8.4", main: "index.js" }));
  await writeFile(join(cliRoot, "index.js"), "");
  await writeFile(join(root, "package.json"), JSON.stringify({ dependencies: { "@nodetool-ai/cli": "0.8.4" } }));
  const packsRoot = join(root, "data", "nodetool", "packs", "0.8.4");
  const generation = "g-0-0000000000000000";
  const packageRoot = join(packsRoot, generation, "node_modules/@nodetool-ai/cli-workflow");
  await mkdir(packageRoot, { recursive: true });
  await writeFile(join(packsRoot, "current.json"), JSON.stringify({ schemaVersion: 1, generation }));
  await writeFile(join(packsRoot, generation, "package.json"), JSON.stringify({ name: "nodetool-packs", nodetool: { coreVersion: "0.8.4", packs: [pack.id], runtimeLibraries: [] } }));
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({ name: pack.npm.name, version: "0.8.4", type: "module", exports: { ".": "./index.js" } }));
  await writeFile(join(packageRoot, "index.js"), source);
  return readInstalledPacks({ kind: "local", cliRoot, packsRoot, legacyInstallRoot: root, coreVersion: "0.8.4", pathStyle: "posix" }, catalog);
}
function stateFileOf(snapshot: InstalledPackSnapshot): string {
  if (snapshot.mode.kind !== "local") { throw new Error("Expected local fixture"); }
  return join(snapshot.mode.legacyInstallRoot, "state.json");
}
const descriptor = { id: "cli-workflow", apiVersion: 1, requires: [], capabilities: ["cli:workflow"] };

describe("admitted CLI features", () => {
  it("a host configured from the CLI entry reads features from the pack project", async () => {
    const snapshot = await fixture("");
    if (snapshot.mode.kind !== "local") { throw new Error("Expected local fixture"); }
    const data = join(snapshot.mode.legacyInstallRoot, "data");
    vi.stubEnv("XDG_DATA_HOME", data); vi.stubEnv("APPDATA", data);
    configureCliPackHost(pathToFileURL(join(snapshot.mode.cliRoot, "index.js")).href, { catalog, stateFile: stateFileOf(snapshot) });
    const loaded = await loadCliPackSnapshot();
    expect(loaded).toMatchObject({ mode: { kind: "local", cliRoot: snapshot.mode.cliRoot, packsRoot: snapshot.mode.packsRoot }, projectRoot: snapshot.projectRoot });
    expect(loaded.packs.map(entry => entry.id)).toEqual(["cli-workflow"]);
  });
  it("a lean installation without packs is healthy and requires no media identities", async () => {
    const snapshot = await fixture("");
    const leanCatalog = { ...catalog, installPins: [{ name: "mediabunny", version: "1.54.0", integrity: "sha512-media", shared: true }] };
    if (snapshot.mode.kind !== "local") { throw new Error("Expected local fixture"); }
    await rm(snapshot.mode.packsRoot, { recursive: true });
    const services = await createPackCommandServices({ snapshot: readInstalledPacks(snapshot.mode, leanCatalog), catalog: leanCatalog, stateFile: stateFileOf(snapshot),
      operations: { npmVersion: async () => "11.0.0", npm: async () => "", loadCheck: async () => {} } });
    expect(await services.doctor({})).toMatchObject({ healthy: true, issues: [] });
  });
  it("reports an absent feature with an explicit install instruction", async () => {
    const snapshot = await fixture("");
    await expect(loadInstalledCommandFeature(import.meta.url, pack.id, { snapshot: { ...snapshot, packs: [] }, catalog }))
      .rejects.toMatchObject({ code: "FEATURE_NOT_INSTALLED", featureIds: ["cli-workflow"] });
  });
  it("requires the selected feature and rejects unknown or duplicate catalog selectors", async () => {
    const snapshot = await fixture("");
    const chat = { ...pack, id: "cli-chat", npm: { ...pack.npm, name: "@nodetool-ai/cli-chat" } };
    await expect(loadInstalledCommandFeature(import.meta.url, chat.id, { snapshot, catalog: { ...catalog, packs: [pack, chat] } }))
      .rejects.toMatchObject({ code: "FEATURE_NOT_INSTALLED", featureIds: ["cli-chat"] });
    await expect(loadInstalledCommandFeature(import.meta.url, "unknown", { snapshot, catalog })).rejects.toThrow("exactly one catalog entry");
    await expect(loadInstalledCommandFeature(import.meta.url, pack.id, { snapshot, catalog: { ...catalog, packs: [pack, pack] } })).rejects.toThrow("exactly one catalog entry");
  });
  it("uses the admitted workflow feature for explicit pack discovery without running its command tree", async () => {
    const snapshot = await fixture(`export const feature={descriptor:${JSON.stringify(descriptor)},run:async()=>{throw Error("Command tree must not run")},resolveWorkflowPacks:async target=>{if(target!=="saved-workflow")throw Error("lost discovery target");return {packs:[],runtimeLibraries:[]}}};`);
    const services = await createPackCommandServices({ snapshot, catalog, stateFile: stateFileOf(snapshot) });
    await expect(services.add([], { for: "saved-workflow", yes: true })).resolves.toBeUndefined();
  });
  it("loads only the admitted package root and preserves command arguments", async () => {
    const snapshot = await fixture(`export const feature={descriptor:${JSON.stringify(descriptor)},run:async argv=>{if(argv[0]!=="harness")throw Error("lost arguments")}};`);
    const runner = await loadInstalledCommandFeature(import.meta.url, pack.id, { snapshot, catalog });
    await expect(runner.run(["harness"])).resolves.toBeUndefined();
  });
  it("fails broken installed modules with their cause rather than treating them as absent", async () => {
    const snapshot = await fixture('throw new Error("configured module failed");');
    await expect(loadInstalledCommandFeature(import.meta.url, pack.id, { snapshot, catalog })).rejects.toMatchObject({ cause: { message: "configured module failed" } });
  });
  it("rejects wrong APIs, duplicate declarations and uninstalled prerequisites", async () => {
    expect(() => verifyCliFeature({ feature: { descriptor: { ...descriptor, apiVersion: 2 }, run: async () => {} } }, pack)).toThrow();
    expect(() => verifyCliFeature({ feature: { descriptor: { ...descriptor, capabilities: ["x", "x"] }, run: async () => {} } }, pack)).toThrow("duplicate capabilities");
    const snapshot = await fixture("");
    await expect(loadInstalledCommandFeature(import.meta.url, pack.id, { snapshot, catalog: { ...catalog, packs: [{ ...pack, requires: ["missing"] }] } })).rejects.toThrow("requires installed pack missing");
  });
  it("registers lean management help without constructing services or a compiler", () => {
    const program = new Command();
    registerPackCommands(program, undefined, async () => { throw new Error("Help must not load services"); });
    const packs = program.commands.find(command => command.name() === "packs");
    expect(packs?.commands.map(command => command.name())).toEqual(["list", "add", "remove", "doctor", "why"]);
    expect(packs?.commands.find(command => command.name() === "add")?.aliases()).toContain("install");
    expect(packs?.commands.find(command => command.name() === "remove")?.aliases()).toContain("uninstall");
    expect(packs?.helpInformation()).toContain("doctor");
  });
});

describe("optional admitted execution host integration", () => {
  async function adminFixture(source: string): Promise<{ snapshot: InstalledPackSnapshot; catalog: NodeCatalogIndex }> {
    const snapshot = await fixture(source);
    const admin = { ...pack, id: "cli-admin" };
    return { snapshot: { ...snapshot, packs: snapshot.packs.map(candidate => ({ ...candidate, id: "cli-admin" })) }, catalog: { ...catalog, packs: [admin] } };
  }
  const adminDescriptor = { ...descriptor, id: "cli-admin" };
  it("does not load any optional module when admin is absent", async () => {
    const snapshot = await fixture('throw Error("must not load");');
    await expect(initializeInstalledExecutionHost(import.meta.url, { snapshot, catalog })).resolves.toBeUndefined();
  });
  it("initializes only the admitted admin hook without running command dispatch", async () => {
    const options = await adminFixture(`export const feature={descriptor:${JSON.stringify(adminDescriptor)},run:async()=>{throw Error("must not run")},initializeExecutionHost:async()=>{}};`);
    await expect(initializeInstalledExecutionHost(import.meta.url, options)).resolves.toBeUndefined();
  });
  it("fails configured missing or broken initializers with their cause", async () => {
    const missing = await adminFixture(`export const feature={descriptor:${JSON.stringify(adminDescriptor)},run:async()=>{}};`);
    await expect(initializeInstalledExecutionHost(import.meta.url, missing)).rejects.toThrow("does not provide its execution host initializer");
    const broken = await adminFixture(`export const feature={descriptor:${JSON.stringify(adminDescriptor)},run:async()=>{},initializeExecutionHost:async()=>{throw Error("fixture heartbeat failed")}};`);
    await expect(initializeInstalledExecutionHost(import.meta.url, broken)).rejects.toMatchObject({ cause: { message: "fixture heartbeat failed" } });
  });
});
