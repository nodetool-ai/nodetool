import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { CatalogPack, NodeCatalogIndex } from "@nodetool-ai/pack-core";
import { authorizePackInstallCommand } from "../src/commands/pack-install-authorization.js";
import { removePacks } from "../src/packs/removal.js";
import { preparePackRemoval } from "../src/packs/removal-selection.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function fixture(intent?: { requestedPacks: string[]; managedPacks: string[] }, userDependencies: Record<string, string> = {}) {
  const root = await mkdtemp(join(tmpdir(), "managed-prerequisites-")); roots.push(root);
  const version = "0.8.4";
  const packs: CatalogPack[] = ["core", "text", "cli-workflow"].map(id => ({ id, kind: id === "cli-workflow" ? "cli-feature" : "core", npm: { name: `@nodetool-ai/${id}`, version, integrity: `sha512-${id}` }, registrar: "register", provides: [], requires: id === "text" ? ["core"] : id === "cli-workflow" ? ["core", "text"] : [], runtimeLibraries: [], secrets: [], scriptAllowlist: [], installBytes: 0, nodeCount: 0 }));
  const catalog: NodeCatalogIndex = { schemaVersion: 1, coreVersion: version, packs, owners: {} };
  const dependencies = { "@nodetool-ai/cli": version, "@nodetool-ai/core": version, "@nodetool-ai/text": version, "@nodetool-ai/cli-workflow": version, "user-library": "1.0.0" };
  await mkdir(join(root, "node_modules"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ dependencies }));
  const lock: Record<string, unknown> = {};
  for (const [name, packageVersion] of Object.entries({ ...dependencies, "compiler-dependency": "1.0.0" })) {
    const directory = join(root, "node_modules", name);
    await mkdir(directory, { recursive: true });
    const required = name === "@nodetool-ai/core" ? { "compiler-dependency": "1.0.0" } : name === "user-library" ? userDependencies : name === "@nodetool-ai/text" ? { "@nodetool-ai/core": version } : {};
    await writeFile(join(directory, "package.json"), JSON.stringify({ name, version: packageVersion, dependencies: required }));
    lock[`node_modules/${name}`] = { version: packageVersion, integrity: `sha512-${name.replace("@nodetool-ai/", "")}` };
  }
  await writeFile(join(root, "node_modules/.package-lock.json"), JSON.stringify({ packages: lock }));
  const stateFile = join(root, "state.json");
  await writeFile(stateFile, JSON.stringify({ [root]: { root, coreVersion: version, packs: ["core", "text", "cli-workflow"], runtimeLibraries: [], ...intent } }));
  const mode = { kind: "local" as const, installRoot: root, nodeModulesRoot: join(root, "node_modules"), cliRoot: join(root, "node_modules/@nodetool-ai/cli"), coreVersion: version, pathStyle: "posix" as const };
  return { mode, packs: ["cli-workflow"], stateFile, catalog };
}

it("removes only proven managed automatic prerequisites with their orphaned dependency closure", async () => {
  const selection = await preparePackRemoval(await fixture({ requestedPacks: ["cli-workflow"], managedPacks: ["core", "text", "cli-workflow"] }));
  expect(selection.remove).toEqual(["cli-workflow", "core", "text"]);
  expect([...selection.removePaths]).toContain("node_modules/compiler-dependency");
  expect([...selection.removePaths]).not.toContain("node_modules/user-library");
  expect([...selection.removePaths]).not.toContain("node_modules/@nodetool-ai/cli");
});

it("preserves an independently requested prerequisite and the prerequisites it needs", async () => {
  const selection = await preparePackRemoval(await fixture({ requestedPacks: ["cli-workflow", "text"], managedPacks: ["core", "text", "cli-workflow"] }));
  expect(selection.remove).toEqual(["cli-workflow"]);
  expect([...selection.removePaths]).not.toContain("node_modules/compiler-dependency");
});

it("preserves preexisting user-owned prerequisites and shared user dependencies", async () => {
  const preexisting = await preparePackRemoval(await fixture({ requestedPacks: ["cli-workflow"], managedPacks: ["cli-workflow", "core"] }));
  expect(preexisting.remove).toEqual(["cli-workflow"]);
  const shared = await preparePackRemoval(await fixture({ requestedPacks: ["cli-workflow"], managedPacks: ["core", "text", "cli-workflow"] }, { "compiler-dependency": "1.0.0" }));
  expect(shared.remove).toEqual(["cli-workflow", "core", "text"]);
  expect([...shared.removePaths]).not.toContain("node_modules/compiler-dependency");
});

it("conservatively retains prerequisites whose legacy state does not prove installer ownership", async () => {
  const selection = await preparePackRemoval(await fixture());
  expect(selection.remove).toEqual(["cli-workflow"]);
  expect([...selection.removePaths]).not.toContain("node_modules/compiler-dependency");
});

it("executes the authorized automatic prerequisite removal transaction without touching user data", async () => {
  const request = await fixture({ requestedPacks: ["cli-workflow"], managedPacks: ["core", "text", "cli-workflow"] });
  const root = request.mode.installRoot;
  await writeFile(join(root, "workflow.json"), "saved workflow data");
  const authorization = await authorizePackInstallCommand({ request, command: "packs-remove" });
  if (!authorization) { throw new Error("Missing fixture removal authorization"); }
  const selection = await preparePackRemoval(request);
  const loadCheck = vi.fn(async () => {});
  const result = await removePacks(request, authorization, {
    npmVersion: async () => "11.16.0",
    loadCheck,
    npm: async (_root, args, options) => {
      expect(args[0]).toBe("uninstall");
      const lockFile = join(root, "node_modules/.package-lock.json");
      const lock = JSON.parse(await readFile(lockFile, "utf8"));
      const remove = await Promise.all([...selection.removePaths].map(async path => {
        const manifest = JSON.parse(await readFile(join(root, path, "package.json"), "utf8"));
        return { name: manifest.name, version: manifest.version };
      }));
      if (options.dryRun) { return JSON.stringify({ add: [], change: [], remove }); }
      for (const path of selection.removePaths) {
        await rm(join(root, path), { recursive: true });
        delete lock.packages[path];
      }
      await writeFile(lockFile, JSON.stringify(lock));
      const manifestFile = join(root, "package.json");
      const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
      for (const name of selection.npmNames) { delete manifest.dependencies[name]; }
      await writeFile(manifestFile, JSON.stringify(manifest));
      return "";
    }
  });
  expect(result.removed).toEqual(["cli-workflow", "core", "text"]);
  expect(result.desired).toMatchObject({ packs: [], requestedPacks: [], managedPacks: [] });
  expect(loadCheck).toHaveBeenCalledWith(request.mode, [], undefined);
  expect(await readFile(join(root, "workflow.json"), "utf8")).toBe("saved workflow data");
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  expect(manifest.dependencies).toEqual({ "@nodetool-ai/cli": "0.8.4", "user-library": "1.0.0" });
});

it("prunes proven managed node families introduced only through the removed feature's npm dependencies", async () => {
  const request = await fixture({ requestedPacks: ["cli-workflow"], managedPacks: ["core", "text", "cli-workflow"] });
  const feature = request.catalog.packs.find(pack => pack.id === "cli-workflow")!;
  await writeFile(join(request.mode.installRoot, "node_modules", feature.npm.name, "package.json"), JSON.stringify({ name: feature.npm.name, version: feature.npm.version, dependencies: { "@nodetool-ai/text": feature.npm.version } }));
  const catalog = { ...request.catalog, packs: request.catalog.packs.map(pack => pack.id === feature.id ? { ...pack, requires: [] } : pack) };
  const result = await preparePackRemoval({ ...request, catalog });
  expect(result.remove).toEqual(["cli-workflow", "core", "text"]);
  expect([...result.removePaths]).toContain("node_modules/compiler-dependency");
});
