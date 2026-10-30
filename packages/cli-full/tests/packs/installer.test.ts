import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm, unlink, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installPacks as installAuthorizedPacks, type InstallPacksRequest, type InstallerOperations } from "../../src/packs/installer.js";
import { authorizePackInstallCommand } from "../../src/commands/pack-install-authorization.js";
import { prepareInstallSelection } from "../../src/packs/install-selection.js";
import { prepareTreeVerification } from "../../src/packs/install-verification.js";
async function installPacks(request: InstallPacksRequest, operations: InstallerOperations) {
  const authorization = await authorizePackInstallCommand({ request, command: "packs-add" });
  if (!authorization) { throw new Error("Missing fixture authorization"); }
  return installAuthorizedPacks(request, authorization, operations);
}
import { parseInstallPlan, snapshotInstallTree, readInstallTree, installTreeRestored, assertAdditivePlan, assertTreePins, removeSnapshotAdditions } from "../../src/packs/install-tree.js";
import type { NodeCatalogIndex } from "@nodetool-ai/node-catalog";

const roots: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const catalog: NodeCatalogIndex = { schemaVersion: 1, coreVersion: "1.0.0", owners: {}, packs: [{
  id: "fixture", kind: "node-pack", npm: { name: "@nodetool-ai/fixture-nodes", version: "1.0.0", integrity: "sha512-fixture" },
  registrar: "register", provides: [], requires: [], runtimeLibraries: [], secrets: [], scriptAllowlist: [], installBytes: 1, nodeCount: 0
}] };
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "packs-install-")); roots.push(root);
  await mkdir(join(root, "node_modules"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "project", version: "1.0.0" }));
  await writeFile(join(root, "node_modules/.package-lock.json"), JSON.stringify({ packages: {} }));
  const mode = { kind: "local" as const, installRoot: root, nodeModulesRoot: join(root, "node_modules"), cliRoot: root, coreVersion: "1.0.0", pathStyle: "posix" as const };
  const request = { mode, packs: ["fixture"], stateFile: join(root, "state/cli-packs.json"), catalog };
  const add = async (integrity = "sha512-fixture") => {
    await mkdir(join(root, "node_modules/@nodetool-ai/fixture-nodes"), { recursive: true });
    await writeFile(join(root, "node_modules/@nodetool-ai/fixture-nodes/package.json"), JSON.stringify({ name: "@nodetool-ai/fixture-nodes", version: "1.0.0" }));
    await writeFile(join(root, "node_modules/.package-lock.json"), JSON.stringify({ packages: { "node_modules/@nodetool-ai/fixture-nodes": { version: "1.0.0", integrity } } }));
  };
  const npm = vi.fn<InstallerOperations["npm"]>(async (_root, args, options) => {
    if (options.dryRun) { return JSON.stringify({ add: [{ name: "@nodetool-ai/fixture-nodes", version: "1.0.0" }], change: [], remove: [] }); }
    if (args[0] === "uninstall") {
      await rm(join(root, "node_modules/@nodetool-ai"), { recursive: true, force: true });
      await writeFile(join(root, "node_modules/.package-lock.json"), JSON.stringify({ packages: {} }));
    } else { await add(); }
    return "";
  });
  const operations: InstallerOperations = { npmVersion: async () => "11.16.0", npm, loadCheck: vi.fn(async () => {}) };
  return { root, request, operations, npm, add };
}

describe("pack installer", () => {
  it("pins npm 10 text and npm 11 array formats and rejects counts-only JSON", () => {
    expect(parseInstallPlan("add @nodetool-ai/fal-nodes 1.0.0\nadded 1 package", "10.9.8").add).toHaveLength(1);
    expect(parseInstallPlan('{"add":[],"change":[{"name":"core"}],"remove":[]}', "11.16.0").change).toHaveLength(1);
    expect(() => parseInstallPlan('{"added":1}', "11.16.0")).toThrow();
    expect(() => parseInstallPlan('{"added":1,"changed":0,"removed":0}', "10.9.8")).toThrow(/Incomplete/);
    expect(() => parseInstallPlan("opaque", "10.9.8")).toThrow();
  });
  it("refuses changes, core duplicates, shared duplicates, and mismatched versions", () => {
    expect(() => assertAdditivePlan({ add: [], change: ["core"], remove: [] }, [], new Set(), [], "1")).toThrow(/changes/);
    expect(() => assertAdditivePlan({ add: [{ name: "core", version: "1" }], change: [], remove: [] }, [], new Set(["core"]), [], "1")).toThrow(/core/);
    expect(() => assertAdditivePlan({ add: [{ name: "shared", version: "1" }, { name: "shared", version: "1" }], change: [], remove: [] }, [], new Set(), [{ name: "shared", version: "1", integrity: "pin" }], "1")).toThrow(/identity/);
    expect(() => assertAdditivePlan({ add: [{ name: "@nodetool-ai/new", version: "2" }], change: [], remove: [] }, [], new Set(), [], "1")).toThrow(/version/);
  });
  it("requires explicit local authorization", async () => {
    const f = await fixture();
    await expect(installAuthorizedPacks(f.request, JSON.parse("{}"), f.operations)).rejects.toThrow(/authorization/);
    expect(f.npm).not.toHaveBeenCalled();
  });
  it("fails closed for absent runtime pins before npm changes the tree", async () => {
    const f = await fixture();
    await expect(installPacks({ ...f.request, runtimeLibraries: ["imaging"] }, f.operations)).rejects.toThrow(/no integrity pins/);
    expect(f.npm).not.toHaveBeenCalled();
  });
  it("refuses an additive violation without mutating the tree", async () => {
    const f = await fixture(); const before = await snapshotInstallTree(f.root);
    f.npm.mockResolvedValue('{"add":[],"change":[{"name":"baseline"}],"remove":[]}');
    await expect(installPacks(f.request, f.operations)).rejects.toThrow(/changes/);
    expect(await snapshotInstallTree(f.root)).toEqual(before); expect(f.npm).toHaveBeenCalledTimes(1);
  });
  it("writes desired state only after verified fresh load check", async () => {
    const f = await fixture(); const result = await installPacks(f.request, f.operations);
    expect(result.packs).toEqual(["fixture"]); expect(f.operations.loadCheck).toHaveBeenCalledOnce();
    expect(JSON.parse(await readFile(f.request.stateFile, "utf8"))[f.root]).toEqual(result);
  });
  it("rolls back failed load check and preserves original failure", async () => {
    const f = await fixture(); const before = await snapshotInstallTree(f.root);
    const operations = { ...f.operations, loadCheck: async () => { throw new Error("fixture child failed"); } };
    await expect(installPacks(f.request, operations)).rejects.toThrow("fixture child failed");
    expect(await snapshotInstallTree(f.root)).toEqual(before);
  });
  it("wrong integrity cannot run load checks or scripts and is rolled back", async () => {
    const f = await fixture();
    f.npm.mockImplementationOnce(async () => '{"add":[{"name":"@nodetool-ai/fixture-nodes","version":"1.0.0"}],"change":[],"remove":[]}');
    f.npm.mockImplementationOnce(async () => { await f.add("sha512-tampered"); return ""; });
    await expect(installPacks(f.request, f.operations)).rejects.toThrow(/integrity/);
    expect(f.operations.loadCheck).not.toHaveBeenCalled(); expect(await snapshotInstallTree(f.root)).toEqual([]);
  });
  it("marks irrecoverable rollback dirty and refuses another install", async () => {
    const f = await fixture();
    const operations = { ...f.operations, loadCheck: async () => { throw new Error("failed"); } };
    f.npm.mockImplementation(async (_root, _args, options) => {
      if (options.dryRun) { return '{"add":[{"name":"@nodetool-ai/fixture-nodes","version":"1.0.0"}],"change":[],"remove":[]}'; }
      await f.add(); return "";
    });
    await expect(installPacks(f.request, operations)).rejects.toThrow(/rollback/);
    expect(JSON.parse(await readFile(f.request.stateFile, "utf8"))[f.root].dirty).toBe(true);
    await expect(installPacks(f.request, f.operations)).rejects.toThrow(/dirty/);
  });
  it("detects nested duplicates and stale hidden lock entries", async () => {
    const f = await fixture(); await f.add();
    const tree = await snapshotInstallTree(f.root);
    expect(() => assertTreePins(tree, [...tree, { ...tree[0], path: "nested" }], [], new Set([tree[0].name]), "1.0.0")).toThrow(/exactly once/);
    await writeFile(join(f.root, "node_modules/.package-lock.json"), '{"packages":{}}');
    await expect(snapshotInstallTree(f.root)).rejects.toThrow(/stale/);
  });
  it("pins the requested runtime root without rejecting a dependency's private version", async () => {
    const f = await fixture();
    const installPins = [
      { name: "sharp", version: "0.35.5", integrity: "sha512-root-sharp" },
      { name: "@napi-rs/canvas", version: "0.1.100", integrity: "sha512-canvas" }
    ];
    const request = { ...f.request, packs: [], runtimeLibraries: ["imaging"], catalog: { ...f.request.catalog, installPins } };
    const selection = await prepareInstallSelection(request);
    const { pins, coreNames } = await prepareTreeVerification(selection, f.root);
    const roots = installPins.map(pin => ({ ...pin, path: `node_modules/${pin.name}`, realPath: join(f.root, "node_modules", pin.name) }));
    const nested = { name: "sharp", version: "0.34.5", integrity: "sha512-private-sharp",
      path: "node_modules/@huggingface/transformers/node_modules/sharp", realPath: join(f.root, "node_modules/@huggingface/transformers/node_modules/sharp") };
    expect(() => assertTreePins([], [...roots, nested], pins, coreNames, "1.0.0")).not.toThrow();
    for (const change of [{ version: "0.34.5" }, { integrity: "sha512-corrupt" }]) {
      expect(() => assertTreePins([], [{ ...roots[0], ...change }, roots[1], nested], pins, coreNames, "1.0.0")).toThrow(/pin/);
    }
    expect(() => assertTreePins([], [roots[1], { ...nested, version: roots[0].version, integrity: roots[0].integrity }], pins, coreNames, "1.0.0")).toThrow(/pin/);
    expect(() => assertTreePins([], [...roots, nested], [{ ...installPins[0], shared: true }], coreNames, "1.0.0")).toThrow(/pin/);
    expect(() => assertTreePins([nested], [...roots, { ...nested, integrity: "sha512-tampered" }], pins, coreNames, "1.0.0")).toThrow(/changed/);
    for (const initialGlobalLockMissing of [false, true]) {
      await expect(prepareTreeVerification({ ...selection, before: [nested], initialGlobalLockMissing }, f.root)).resolves.toBeDefined();
    }
  });
  it("pins alias folders using real manifest identity and integrity", () => {
    const tree = [{ path: "node_modules/typescript", name: "@typescript/typescript6", version: "6.0.2", integrity: "sha512-ts", realPath: "/fixture/node_modules/typescript" }];
    expect(() => assertTreePins([], tree, [{ name: "@typescript/typescript6", installName: "typescript", version: "6.0.2", integrity: "sha512-ts" }], new Set(), "1")).not.toThrow();
    expect(() => assertTreePins([], [{ ...tree[0], path: "node_modules/wrong" }], [{ name: "@typescript/typescript6", installName: "typescript", version: "6.0.2", integrity: "sha512-ts" }], new Set(), "1")).toThrow(/pin/);
  });
  it("requires the canonical runtime alias identity at the root folder", async () => {
    const f = await fixture();
    const pin = { name: "@typescript/typescript6", installName: "typescript", version: "6.0.2", integrity: "sha512-ts" };
    const request = { ...f.request, packs: [], runtimeLibraries: ["typescript"], catalog: { ...f.request.catalog, installPins: [pin] } };
    const selection = await prepareInstallSelection(request);
    const { pins, coreNames } = await prepareTreeVerification(selection, f.root);
    const entry = { ...pin, path: "node_modules/typescript", realPath: join(f.root, "node_modules/typescript") };
    expect(() => assertTreePins([], [entry], pins, coreNames, "1.0.0")).not.toThrow();
    expect(() => assertTreePins([], [{ ...entry, name: "typescript" }], pins, coreNames, "1.0.0")).toThrow(/pin/);
    expect(() => assertTreePins([], [{ ...entry, path: "node_modules/consumer/node_modules/typescript" }], pins, coreNames, "1.0.0")).toThrow(/pin/);
  });
  it("requests canonical runtime alias specs and checks their exact registry identity", async () => {
    const f = await fixture();
    const pins = [{ name: "@typescript/typescript6", installName: "typescript", version: "6.0.2", integrity: "sha512-ts" }];
    const catalog = { ...f.request.catalog, installPins: pins };
    f.npm.mockImplementation(async (_root, args, options) => {
      if (options.dryRun) { return '{"add":[{"name":"@nodetool-ai/fixture-nodes","version":"1.0.0"},{"name":"@typescript/typescript6","version":"6.0.2"}],"change":[],"remove":[]}'; }
      await f.add(); await mkdir(join(f.root, "node_modules/typescript"));
      await writeFile(join(f.root, "node_modules/typescript/package.json"), JSON.stringify({ name: "@typescript/typescript6", version: "6.0.2" }));
      await writeFile(join(f.root, "node_modules/.package-lock.json"), JSON.stringify({ packages: {
        "node_modules/@nodetool-ai/fixture-nodes": { version: "1.0.0", integrity: "sha512-fixture" },
        "node_modules/typescript": { version: "6.0.2", integrity: "sha512-ts" }
      } }));
      expect(args).toContain("typescript@npm:@typescript/typescript6@6.0.2"); return "";
    });
    expect((await installPacks({ ...f.request, catalog, runtimeLibraries: ["typescript"] }, f.operations)).runtimeLibraries).toEqual(["typescript"]);
    await expect(installPacks({ ...f.request, catalog: { ...catalog, installPins: [{ ...pins[0], version: "7.0.0" }] }, runtimeLibraries: ["typescript"] }, f.operations)).rejects.toThrow(/exact runtime spec/);
  });
  it("checks allowlist integrity before rebuilding and before load-check", async () => {
    const f = await fixture(); const events: string[] = [];
    const pin = { name: "native-fixture", version: "1.0.0", integrity: "sha512-native" };
    const catalog = { ...f.request.catalog, packs: f.request.catalog.packs.map((pack) => ({ ...pack, scriptAllowlist: [pin] })) };
    f.npm.mockImplementation(async (_root, args, options) => {
      if (options.dryRun) { return '{"add":[{"name":"@nodetool-ai/fixture-nodes","version":"1.0.0"},{"name":"native-fixture","version":"1.0.0"}],"change":[],"remove":[]}'; }
      if (options.rebuild) { expect(args).toEqual(["rebuild", "native-fixture"]); events.push("rebuild"); return ""; }
      events.push("install"); await f.add(); await mkdir(join(f.root, "node_modules/native-fixture"));
      await writeFile(join(f.root, "node_modules/native-fixture/package.json"), JSON.stringify({ name: pin.name, version: pin.version }));
      await writeFile(join(f.root, "node_modules/.package-lock.json"), JSON.stringify({ packages: {
        "node_modules/@nodetool-ai/fixture-nodes": { version: "1.0.0", integrity: "sha512-fixture" },
        "node_modules/native-fixture": { version: pin.version, integrity: pin.integrity }
      } })); return "";
    });
    await installPacks({ ...f.request, catalog }, { ...f.operations, loadCheck: async () => { events.push("load"); } });
    expect(events).toEqual(["install", "rebuild", "load"]);
  });
  it("snapshot fallback removes new roots and preserves an existing package", async () => {
    const f = await fixture(); await f.add();
    const before = await snapshotInstallTree(f.root);
    await mkdir(join(f.root, "node_modules/new-package"));
    await writeFile(join(f.root, "node_modules/new-package/package.json"), '{"name":"new-package","version":"1"}');
    await writeFile(join(f.root, "node_modules/.package-lock.json"), JSON.stringify({ packages: {
      "node_modules/@nodetool-ai/fixture-nodes": { version: "1.0.0", integrity: "sha512-fixture" }, "node_modules/new-package": { version: "1" }
    } }));
    await removeSnapshotAdditions(f.root, f.request.mode.nodeModulesRoot, before);
    expect(await snapshotInstallTree(f.root)).toEqual(before);
  });
  it("snapshot fallback refuses a new root containing a protected old descendant", async () => {
    const f = await fixture(); await f.add(); const current = await snapshotInstallTree(f.root);
    const oldDescendant = { ...current[0], path: current[0].path + "/node_modules/old-package" };
    await expect(removeSnapshotAdditions(f.root, f.request.mode.nodeModulesRoot, [oldDescendant])).rejects.toThrow(/preexisting package/);
    expect(await snapshotInstallTree(f.root)).toEqual(current);
  });
  it("explicitly installs a provided companion that is not a dependency of the primary pack", async () => {
    const f = await fixture();
    const pin = { name: "@nodetool-ai/fixture-provider", version: "1.0.0", integrity: "sha512-provider" };
    const catalog = { ...f.request.catalog, installPins: [pin], packs: f.request.catalog.packs.map((pack) => ({ ...pack, provides: [pin.name] })) };
    f.npm.mockImplementation(async (_root, args, options) => {
      if (options.dryRun) { return '{"add":[{"name":"@nodetool-ai/fixture-nodes","version":"1.0.0"},{"name":"@nodetool-ai/fixture-provider","version":"1.0.0"}],"change":[],"remove":[]}'; }
      if (args[0] !== "install") { return ""; }
      expect(args).toContain("@nodetool-ai/fixture-provider@1.0.0");
      await f.add(); await mkdir(join(f.root, "node_modules", pin.name));
      await writeFile(join(f.root, "node_modules", pin.name, "package.json"), JSON.stringify({ name: pin.name, version: pin.version }));
      await writeFile(join(f.root, "node_modules/.package-lock.json"), JSON.stringify({ packages: {
        "node_modules/@nodetool-ai/fixture-nodes": { version: "1.0.0", integrity: "sha512-fixture" },
        [`node_modules/${pin.name}`]: { version: pin.version, integrity: pin.integrity }
      } })); return "";
    });
    expect((await installPacks({ ...f.request, catalog }, f.operations)).packs).toEqual(["fixture"]);
  });
  it("global baseline exception accepts only an absent whole lock, never malformed or stale locks", async () => {
    const f = await fixture(); await f.add(); const file = join(f.root, "node_modules/.package-lock.json"); await unlink(file);
    await expect(snapshotInstallTree(f.root)).rejects.toMatchObject({ code: "ENOENT" });
    const baseline = await readInstallTree(f.root, true); expect(baseline.missingLock).toBe(true); expect(baseline.packages[0].integrity).toBeUndefined();
    await writeFile(file, "broken"); await expect(readInstallTree(f.root, true)).rejects.toThrow();
    await writeFile(file, '{"packages":{}}'); await expect(readInstallTree(f.root, true)).rejects.toThrow(/stale/);
  });
  it("global baseline exception refuses links and never waives a known integrity", async () => {
    const f = await fixture(); await f.add(); const file = join(f.root, "node_modules/.package-lock.json"); const before = await snapshotInstallTree(f.root);
    expect(installTreeRestored(before, [{ ...before[0], integrity: "different" }], true)).toBe(false);
    expect(installTreeRestored([{ ...before[0], integrity: undefined }], before, true)).toBe(true);
    expect(() => assertTreePins(before, [{ ...before[0], integrity: "different" }], [], new Set(), "1.0.0", true)).toThrow(/changed/);
    await unlink(file); await symlink(join(f.root, "node_modules/@nodetool-ai/fixture-nodes"), join(f.root, "node_modules/linked"), "junction");
    await expect(readInstallTree(f.root, true)).rejects.toThrow(/linked package/);
  });
});
