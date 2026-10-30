import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { Command } from "commander";
import { initializeInstalledExecutionHost, loadInstalledCommandFeature, verifyCliFeature } from "../src/cli-feature.js";
import { registerPackCommands } from "../src/commands/packs.js";
import type { CatalogPack, NodeCatalogIndex } from "@nodetool-ai/pack-core/types";
import type { InstalledPackSnapshot } from "../src/packs/installed.js";
import { prepareTreeVerification } from "../src/packs/install-verification.js";
import { createPackCommandServices } from "../src/packs/command-service.js";
import type { InstallSelection } from "../src/packs/install-selection.js";
import { preparePackRemoval } from "../src/packs/removal-selection.js";
import { configureCliPackHost, loadCliPackSnapshot } from "../src/packs/host.js";
import { detectInstallMode } from "../src/packs/mode.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const pack: CatalogPack = { id: "cli-workflow", kind: "cli-feature", npm: { name: "@nodetool-ai/cli-workflow", version: "0.8.4", integrity: "sha512-fixture" }, registrar: "feature", provides: [], requires: [], runtimeLibraries: [], secrets: [], scriptAllowlist: [], installBytes: 0, nodeCount: 0 };
const catalog: NodeCatalogIndex = { schemaVersion: 1, coreVersion: "0.8.4", packs: [pack], owners: {} };
async function fixture(source: string): Promise<InstalledPackSnapshot> {
  const root = await mkdtemp(join(tmpdir(), "cli-feature-")); roots.push(root);
  const packageRoot = join(root, "node_modules/@nodetool-ai/cli-workflow");
  await mkdir(packageRoot, { recursive: true });
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({ name: pack.npm.name, version: "0.8.4", type: "module", exports: { ".": "./index.js" } }));
  await writeFile(join(packageRoot, "index.js"), source);
  return { mode: { kind: "local", cliRoot: join(root, "node_modules/@nodetool-ai/cli"), installRoot: root, nodeModulesRoot: join(root, "node_modules"), coreVersion: "0.8.4", pathStyle: "posix" }, packs: [{ id: "cli-workflow", npm: pack.npm.name, version: "0.8.4", packageRoot, realPackageRoot: packageRoot, providedPackages: [] }], wrongVersions: [], invalidPackages: [] };
}
const descriptor = { id: "cli-workflow", apiVersion: 1, requires: [], capabilities: ["cli:workflow"] };

describe("admitted CLI features", () => {
  it("admits a command package through its sibling core CLI without treating it as the core", async () => {
    const snapshot = await fixture("");
    if (snapshot.mode.kind !== "local") { throw new Error("Expected local fixture"); }
    const root = snapshot.mode.installRoot;
    await mkdir(snapshot.mode.cliRoot, { recursive: true });
    await writeFile(join(snapshot.mode.cliRoot, "package.json"), JSON.stringify({ name: "@nodetool-ai/cli", version: "0.8.4", main: "index.js" }));
    await writeFile(join(snapshot.mode.cliRoot, "index.js"), "");
    await writeFile(join(root, "package.json"), JSON.stringify({ dependencies: { "@nodetool-ai/cli": "0.8.4", "@nodetool-ai/cli-workflow": "0.8.4" } }));
    const featurePackage = snapshot.packs[0];
    if (!featurePackage) { throw new Error("Missing command fixture"); }
    expect(() => detectInstallMode(join(featurePackage.packageRoot, "index.js"))).toThrow("Cannot find @nodetool-ai/cli package root");
    configureCliPackHost(pathToFileURL(join(featurePackage.packageRoot, "index.js")).href, { catalog, stateFile: join(root, "state.json") });
    expect((await loadCliPackSnapshot()).mode).toMatchObject({ kind: "local", cliRoot: snapshot.mode.cliRoot, installRoot: root });
  });
  it("removes full-only internal dependencies while retaining the lean CLI", async () => {
    const snapshot = await fixture("");
    if (snapshot.mode.kind !== "local") { throw new Error("Expected local fixture"); }
    const root = snapshot.mode.installRoot;
    const full = snapshot.packs[0];
    if (!full) { throw new Error("Missing full feature fixture"); }
    const runtimeRoot = join(root, "node_modules/@nodetool-ai/full-runtime");
    await mkdir(runtimeRoot, { recursive: true });
    await mkdir(snapshot.mode.cliRoot, { recursive: true });
    await writeFile(join(root, "package.json"), JSON.stringify({ dependencies: { "@nodetool-ai/cli": "0.8.4", "@nodetool-ai/cli-workflow": "0.8.4" } }));
    await writeFile(join(snapshot.mode.cliRoot, "package.json"), JSON.stringify({ name: "@nodetool-ai/cli", version: "0.8.4" }));
    await writeFile(join(runtimeRoot, "package.json"), JSON.stringify({ name: "@nodetool-ai/full-runtime", version: "0.8.4" }));
    await writeFile(join(full.packageRoot, "package.json"), JSON.stringify({ name: full.npm, version: "0.8.4", dependencies: { "@nodetool-ai/full-runtime": "0.8.4" } }));
    await writeFile(join(root, "node_modules/.package-lock.json"), JSON.stringify({ packages: Object.fromEntries(["cli", "cli-workflow", "full-runtime"].map(name => [`node_modules/@nodetool-ai/${name}`, { version: "0.8.4", integrity: "sha512-fixture" }])) }));
    const removal = await preparePackRemoval({ mode: snapshot.mode, packs: ["cli-workflow"], stateFile: join(root, "state.json"), catalog });
    expect(removal.removePaths).toContain("node_modules/@nodetool-ai/cli-workflow");
    expect(removal.removePaths).toContain("node_modules/@nodetool-ai/full-runtime");
    expect(removal.removePaths).not.toContain("node_modules/@nodetool-ai/cli");
  });
  it("does not require absent full-core packages or media identities in a lean installation", async () => {
    const snapshot = await fixture("");
    if (snapshot.mode.kind !== "local") { throw new Error("Expected local fixture"); }
    const root = snapshot.mode.installRoot;
    await rm(snapshot.packs[0]?.packageRoot ?? "", { recursive: true });
    await mkdir(snapshot.mode.cliRoot, { recursive: true });
    await writeFile(join(snapshot.mode.cliRoot, "package.json"), JSON.stringify({ name: "@nodetool-ai/cli", version: "0.8.4", dependencies: {} }));
    await writeFile(join(root, "node_modules/.package-lock.json"), JSON.stringify({ packages: { "node_modules/@nodetool-ai/cli": { version: "0.8.4", integrity: "sha512-cli" } } }));
    const broadCore: CatalogPack = { ...pack, id: "sdk", kind: "core", npm: { ...pack.npm, name: "@nodetool-ai/node-sdk" } };
    const leanCatalog = { ...catalog, packs: [pack, broadCore], installPins: [{ name: "mediabunny", version: "1.54.0", integrity: "sha512-media", shared: true }] };
    const selection: InstallSelection = { root, coreVersion: "0.8.4", mode: "local", packs: [pack], runtimeLibraries: [], scripts: [], previous: { root, coreVersion: "0.8.4", packs: [], runtimeLibraries: [] }, catalog: leanCatalog, before: [{ path: "node_modules/@nodetool-ai/cli", name: "@nodetool-ai/cli", version: "0.8.4", integrity: "sha512-cli", realPath: snapshot.mode.cliRoot }], replayLibraries: [], installedIds: [], initialGlobalLockMissing: false };
    expect((await prepareTreeVerification(selection, snapshot.mode.cliRoot)).coreNames).not.toContain("@nodetool-ai/node-sdk");
    const services = await createPackCommandServices({ snapshot: { ...snapshot, packs: [] }, catalog: leanCatalog, stateFile: join(root, "state.json"), operations: { npmVersion: async () => "11.0.0", npm: async () => "", loadCheck: async () => {} } });
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
    if (snapshot.mode.kind !== "local") { throw new Error("Expected local fixture"); }
    const services = await createPackCommandServices({ snapshot, catalog, stateFile: join(snapshot.mode.installRoot, "state.json") });
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
