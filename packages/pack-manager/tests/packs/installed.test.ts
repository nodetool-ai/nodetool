import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CatalogPack, NodeCatalogIndex } from "@nodetool-ai/pack-core";
import { readInstalledPacks } from "../../src/packs/installed.js";
import { classifyInstallLayout, detectInstallMode } from "../../src/packs/mode.js";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture(): string {
  const directory = mkdtempSync(join(tmpdir(), "nodetool-installed-packs-"));
  directories.push(directory);
  return directory;
}

function pack(id: string, provides: readonly string[] = []): CatalogPack {
  return {
    id, kind: "node-pack", npm: { name: `@nodetool-ai/${id}-nodes`, version: "1.2.3", integrity: "" },
    provides, registrar: "register", requires: [], runtimeLibraries: [], secrets: [], scriptAllowlist: [], installBytes: 0, nodeCount: 1
  };
}

const catalog: NodeCatalogIndex = {
  schemaVersion: 1, coreVersion: "1.2.3", owners: {},
  packs: [pack("fal"), pack("game", ["@nodetool-ai/game-renderer"]), pack("image"), pack("text")]
};

function writePackage(modules: string, name: string, version: string = "1.2.3"): string {
  const root = join(modules, name);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name, version }));
  return root;
}

function localMode(root: string) {
  return classifyInstallLayout({ cliRoot: join(root, "node_modules", "@nodetool-ai", "cli"), coreVersion: "1.2.3", projectHasCli: true });
}

describe("installed pack snapshot", () => {
  it("admits exact catalog versions and records mismatches without importing code", () => {
    const root = fixture();
    const modules = join(root, "node_modules");
    const fal = writePackage(modules, "@nodetool-ai/fal-nodes");
    writeFileSync(join(fal, "index.js"), 'throw new Error("Scanning must not import the pack");');
    writePackage(modules, "@nodetool-ai/image-nodes", "0.9.0");
    writePackage(modules, "@nodetool-ai/not-in-catalog");
    const snapshot = readInstalledPacks(localMode(root), catalog);
    expect(snapshot.mode).toMatchObject({ kind: "local", installRoot: root, coreVersion: "1.2.3" });
    expect(snapshot.packs.map((installed) => installed.id)).toEqual(["fal"]);
    expect(snapshot.packs[0]).toMatchObject({ npm: "@nodetool-ai/fal-nodes", version: "1.2.3", packageRoot: fal, realPackageRoot: fal });
    expect(snapshot.wrongVersions).toEqual([{
      id: "image", npm: "@nodetool-ai/image-nodes", version: "0.9.0", expectedVersion: "1.2.3", packageRoot: join(modules, "@nodetool-ai/image-nodes")
    }]);
  });

  it("scans global dependencies inside the CLI package and excludes ancestor packages", () => {
    const root = fixture();
    const globalModules = join(root, "lib", "node_modules");
    const cliRoot = join(globalModules, "@nodetool-ai", "cli");
    const mode = classifyInstallLayout({ cliRoot, coreVersion: "1.2.3", globalNodeModulesRoots: [globalModules] });
    writePackage(globalModules, "@nodetool-ai/fal-nodes");
    writePackage(join(cliRoot, "node_modules"), "@nodetool-ai/text-nodes");
    expect(readInstalledPacks(mode, catalog).packs.map((installed) => installed.id)).toEqual(["text"]);
  });

  it("records malformed package identities and continues scanning valid packs", () => {
    const root = fixture();
    const modules = join(root, "node_modules");
    const imageRoot = writePackage(modules, "@nodetool-ai/image-nodes");
    writeFileSync(join(imageRoot, "package.json"), "{");
    const textRoot = writePackage(modules, "@nodetool-ai/text-nodes");
    writeFileSync(join(textRoot, "package.json"), JSON.stringify({ name: "@nodetool-ai/other", version: "1.2.3" }));
    writePackage(modules, "@nodetool-ai/fal-nodes");
    const snapshot = readInstalledPacks(localMode(root), catalog);
    expect(snapshot.packs.map((installed) => installed.id)).toEqual(["fal"]);
    expect(snapshot.invalidPackages.map((invalid) => invalid.npm)).toEqual(["@nodetool-ai/image-nodes", "@nodetool-ai/text-nodes"]);
  });

  it("rejects a pack with a mismatched installed companion", () => {
    const root = fixture();
    const modules = join(root, "node_modules");
    writePackage(modules, "@nodetool-ai/game-nodes");
    writePackage(modules, "@nodetool-ai/game-renderer", "1.0.0");
    const snapshot = readInstalledPacks(localMode(root), catalog);
    expect(snapshot.packs).toEqual([]);
    expect(snapshot.wrongVersions).toEqual([expect.objectContaining({ id: "game", npm: "@nodetool-ai/game-renderer", version: "1.0.0" })]);
  });

  it("rejects an incomplete pack and records its missing companion", () => {
    const root = fixture();
    writePackage(join(root, "node_modules"), "@nodetool-ai/game-nodes");
    const snapshot = readInstalledPacks(localMode(root), catalog);
    expect(snapshot.packs).toEqual([]);
    expect(snapshot.invalidPackages).toEqual([expect.objectContaining({ id: "game", npm: "@nodetool-ai/game-renderer", reason: expect.stringContaining("Missing companion") })]);
  });

  it("retains exact roots for installed companion packages", () => {
    const root = fixture();
    const modules = join(root, "node_modules");
    writePackage(modules, "@nodetool-ai/game-nodes");
    const renderer = writePackage(modules, "@nodetool-ai/game-renderer");
    const snapshot = readInstalledPacks(localMode(root), catalog);
    expect(snapshot.packs[0].providedPackages).toEqual([{
      npm: "@nodetool-ai/game-renderer", version: "1.2.3", packageRoot: renderer, realPackageRoot: renderer
    }]);
  });

  it("preserves the real roots of workspace symlinks", () => {
    const root = fixture();
    writeFileSync(join(root, "package.json"), JSON.stringify({ workspaces: ["packages/*"] }));
    const cliRoot = join(root, "packages", "cli");
    mkdirSync(join(cliRoot, "dist"), { recursive: true });
    writeFileSync(join(cliRoot, "package.json"), JSON.stringify({ name: "@nodetool-ai/cli", version: "1.2.3" }));
    const entry = join(cliRoot, "dist", "nodetool.js");
    writeFileSync(entry, "");
    const realPack = join(root, "packages", "fal");
    mkdirSync(realPack);
    writeFileSync(join(realPack, "package.json"), JSON.stringify({ name: "@nodetool-ai/fal-nodes", version: "1.2.3" }));
    const scope = join(root, "node_modules", "@nodetool-ai");
    mkdirSync(scope, { recursive: true });
    symlinkSync(realPack, join(scope, "fal-nodes"), "junction");
    const snapshot = readInstalledPacks(detectInstallMode(entry), catalog);
    expect(snapshot.mode.kind).toBe("dev");
    expect(snapshot.packs[0]).toMatchObject({ id: "fal", packageRoot: join(scope, "fal-nodes"), realPackageRoot: realPack });
  });

  it("keeps an immutable startup snapshot until explicitly scanned again", () => {
    const root = fixture();
    const mode = localMode(root);
    const snapshot = readInstalledPacks(mode, catalog);
    writePackage(join(root, "node_modules"), "@nodetool-ai/fal-nodes");
    expect(snapshot.packs).toEqual([]);
    expect(readInstalledPacks(mode, catalog).packs.map((installed) => installed.id)).toEqual(["fal"]);
  });

  it("refuses a catalog from a different core release", () => {
    expect(() => readInstalledPacks(localMode(fixture()), { ...catalog, coreVersion: "2.0.0" })).toThrow(/core version/);
  });
});
