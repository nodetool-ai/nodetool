import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogPackageNames, measurementManifest, measurePackInstallBytes, measureRuntimeInstallBytes, pinCatalog, tarballIntegrity, withMeasurementTarballs, writePinnedCatalog } from "../release/pin-catalog.mjs";

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) { rmSync(root, { recursive: true, force: true }); } });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "release-pin-test-"));
  roots.push(root);
  const catalog = { schemaVersion: 1, coreVersion: "1.2.3", owners: { "core.Node": "core", "game.Node": "game" }, packs: [
    { id: "core", kind: "core", npm: { name: "@nodetool-ai/core-nodes", version: "1.2.3", integrity: "" }, provides: [], requires: [], installBytes: 0, scriptAllowlist: [] },
    { id: "game", kind: "node-pack", npm: { name: "@nodetool-ai/game-nodes", version: "1.2.3", integrity: "" }, provides: ["@nodetool-ai/game-renderer"], requires: ["core"], installBytes: 0, scriptAllowlist: [] }
  ] };
  const tarballs = {};
  for (const name of catalogPackageNames(catalog)) {
    const file = join(root, `${name.split("/").pop()}.tgz`);
    writeFileSync(file, `original ${name}`);
    tarballs[name] = file;
  }
  const readManifest = file => ({ name: Object.keys(tarballs).find(name => tarballs[name] === file), version: "1.2.3" });
  return { root, catalog, tarballs, readManifest };
}

describe("catalog release pins", () => {
  it("pins every registrar artifact, preserves metadata and does not mutate its input", async () => {
    const { catalog, tarballs, readManifest } = fixture();
    const measure = vi.fn(async pack => pack.id === "core" ? 16384 : 32768);
    const result = await pinCatalog(catalog, tarballs, { readManifest, measure });
    expect(result.packs.map(pack => [pack.id, pack.installBytes])).toEqual([["core", 16384], ["game", 32768]]);
    for (const pack of result.packs) {
      const expected = `sha512-${createHash("sha512").update(readFileSync(tarballs[pack.npm.name])).digest("base64")}`;
      expect(pack.npm.integrity).toBe(expected);
    }
    expect(result.owners).toEqual(catalog.owners);
    expect(result.packs[1].provides).toEqual(["@nodetool-ai/game-renderer"]);
    expect(result.installPins).toEqual([{ name: "@nodetool-ai/game-renderer", version: catalog.coreVersion, integrity: tarballIntegrity(tarballs["@nodetool-ai/game-renderer"]) }]);
    expect(catalog.packs.map(pack => pack.npm.integrity)).toEqual(["", ""]);
    expect(measure).toHaveBeenCalledTimes(catalog.packs.length);
  });

  it("records runtime aliases and shared pins while replacing stale generated pins", async () => {
    const { catalog, tarballs, readManifest } = fixture();
    catalog.installPins = [{ name: "stale", version: "0.0.0", integrity: "stale" }];
    const additionalPins = [
      { name: "@typescript/typescript6", installName: "typescript", version: "6.0.2", integrity: `sha512-${createHash("sha512").update("compiler").digest("base64")}` },
      { name: "mediabunny", version: "1.2.3", shared: true, integrity: `sha512-${createHash("sha512").update("shared").digest("base64")}` }
    ];
    const result = await pinCatalog(catalog, tarballs, { additionalPins, readManifest, measure: () => 1024 });
    expect(result.installPins).toEqual(expect.arrayContaining(additionalPins));
    expect(result.installPins).toHaveLength(additionalPins.length + 1);
    expect(result.installPins.some(pin => pin.name === "stale")).toBe(false);
    expect(catalog.installPins[0].name).toBe("stale");
  });

  it.each(["@nodetool-ai/core-nodes", "@nodetool-ai/game-renderer"])("fails before measurement when %s has no tarball", async name => {
    const { catalog, tarballs, readManifest } = fixture();
    delete tarballs[name];
    const measure = vi.fn();
    await expect(pinCatalog(catalog, tarballs, { readManifest, measure })).rejects.toThrow(`Missing release tarball for ${name}`);
    expect(measure).not.toHaveBeenCalled();
  });

  it.each([{ name: "wrong", version: "1.2.3" }, { name: "@nodetool-ai/core-nodes", version: "1.2.4" }])("rejects a deliberately wrong artifact %j", async manifest => {
    const { catalog, tarballs } = fixture();
    const measure = vi.fn();
    await expect(pinCatalog(catalog, tarballs, { readManifest: async () => manifest, measure })).rejects.toThrow("expected @nodetool-ai/core-nodes@1.2.3");
    expect(measure).not.toHaveBeenCalled();
  });

  it.each([0, -1, NaN, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid installBytes %s without writing catalog changes", async bytes => {
    const { root, catalog, tarballs, readManifest } = fixture();
    const file = join(root, "index.json");
    const original = JSON.stringify(catalog);
    writeFileSync(file, original);
    await expect(writePinnedCatalog(file, tarballs, { readManifest, measure: async () => bytes })).rejects.toThrow("Invalid installBytes");
    expect(readFileSync(file, "utf8")).toBe(original);
  });

  it("writes actual packed manifest pins and rejects a corrupt artifact", async () => {
    const { root, catalog, tarballs } = fixture();
    const file = join(root, "index.json");
    writeFileSync(file, JSON.stringify(catalog));
    for (const name of catalogPackageNames(catalog)) {
      const staging = join(root, "staging", name.split("/").pop());
      mkdirSync(join(staging, "package"), { recursive: true });
      writeFileSync(join(staging, "package/package.json"), JSON.stringify({ name, version: "1.2.3" }));
      const packed = spawnSync("tar", ["-czf", tarballs[name], "-C", staging, "package"], { encoding: "utf8" });
      expect(packed.status, packed.stderr).toBe(0);
    }
    const result = await writePinnedCatalog(file, tarballs, { measure: async () => 1024 });
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(result);
    expect(result.packs.every(pack => pack.npm.integrity.startsWith("sha512-") && pack.installBytes === 1024)).toBe(true);
    writeFileSync(tarballs["@nodetool-ai/game-renderer"], "corrupt archive");
    await expect(pinCatalog(catalog, tarballs, { measure: async () => 1024 })).rejects.toThrow(/tar .* exited/);
  });

  it("enumerates every checked-in catalog registrar and companion as a public workspace", () => {
    const root = resolve(import.meta.dirname, "../..");
    const catalog = JSON.parse(readFileSync(join(root, "packages/node-catalog/data/index.json"), "utf8"));
    const workspaces = new Map();
    for (const entry of readdirSync(join(root, "packages"), { withFileTypes: true })) {
      const path = join(root, "packages", entry.name, "package.json");
      if (!entry.isDirectory() || !existsSync(path)) { continue; }
      const manifest = JSON.parse(readFileSync(path, "utf8"));
      if (!manifest.private) { workspaces.set(manifest.name, path); }
    }
    const names = catalogPackageNames(catalog);
    expect(names.size).toBeGreaterThan(0);
    for (const name of names) { expect(workspaces.has(name), name).toBe(true); }
  });

  it("rejects empty or duplicate catalogs instead of recording an empty comparison", () => {
    expect(() => catalogPackageNames({ packs: [] })).toThrow("at least one pack");
    const { catalog } = fixture();
    catalog.packs.push(catalog.packs[0]);
    expect(() => catalogPackageNames(catalog)).toThrow("Duplicate catalog package");
  });

  it("changes the integrity when the original artifact changes", () => {
    const { tarballs } = fixture();
    const file = tarballs["@nodetool-ai/game-nodes"];
    const before = tarballIntegrity(file);
    writeFileSync(file, "different bytes");
    expect(tarballIntegrity(file)).not.toBe(before);
  });
});

describe("Linux production install measurement", () => {
  it("packs missing core workspaces once for the cohort and cleans them after a measurement failure", async () => {
    const { root, tarballs } = fixture();
    const original = { ...tarballs };
    const core = { name: "@nodetool-ai/node-sdk", dir: join(root, "node-sdk") };
    const registrar = { name: "@nodetool-ai/core-nodes", dir: join(root, "core-nodes") };
    let directory;
    const pack = vi.fn((workspaces, destination) => {
      directory = destination;
      expect(workspaces).toEqual([core]);
      const file = join(destination, "node-sdk.tgz");
      writeFileSync(file, "measurement only");
      return { [core.name]: file };
    });
    await expect(withMeasurementTarballs(tarballs, [registrar, core], async measurement => {
      expect(measurement[registrar.name]).toBe(tarballs[registrar.name]);
      expect(existsSync(measurement[core.name])).toBe(true);
      throw new Error("measurement failed");
    }, { temporaryRoot: root, pack })).rejects.toThrow("measurement failed");
    expect(pack).toHaveBeenCalledTimes(1);
    expect(tarballs).toEqual(original);
    expect(existsSync(directory)).toBe(false);
  });

  it("refuses an unpacked core dependency instead of using a directory override", () => {
    const { catalog, tarballs } = fixture();
    expect(() => measurementManifest(catalog.packs[0], tarballs, [{ name: "@nodetool-ai/node-sdk", dir: "/workspace/node-sdk" }])).toThrow("Missing measurement tarball");
  });

  it.runIf(process.platform === "linux" && process.arch === "x64").each([
    ["0.8.4", "0.8.4"],
    ["0.8.4-a13.1", "0.8.4-a13.1"],
    ["0.8.4-a13.1", "^0.8.4-a13.1"]
  ])("installs a %s pack with an unpublished %s core dependency without changing release bytes", async (version, dependency) => {
    const { root } = fixture();
    const packName = "@nodetool-ai/measurement-pack";
    const coreName = "@nodetool-ai/measurement-core";
    const staging = join(root, "staging");
    const core = join(root, "core");
    mkdirSync(join(staging, "package"), { recursive: true });
    mkdirSync(core);
    writeFileSync(join(staging, "package/package.json"), JSON.stringify({ name: packName, version, dependencies: { [coreName]: dependency } }));
    writeFileSync(join(core, "package.json"), JSON.stringify({ name: coreName, version }));
    const file = join(root, `measurement-pack-${version}.tgz`);
    const packed = spawnSync("tar", ["-czf", file, "-C", staging, "package"], { encoding: "utf8" });
    expect(packed.status, packed.stderr).toBe(0);
    const before = tarballIntegrity(file);
    const pack = { id: "measurement", npm: { name: packName }, provides: [] };
    const tarballs = { [packName]: file };
    const workspaces = [{ name: coreName, dir: core }];
    let measurementFile;
    const bytes = await withMeasurementTarballs(tarballs, workspaces, measurement => {
      measurementFile = measurement[coreName];
      expect(existsSync(measurementFile)).toBe(true);
      return measurePackInstallBytes(pack, measurement, workspaces, { temporaryRoot: root });
    }, { temporaryRoot: root });
    expect(bytes).toBeGreaterThan(0);
    expect(tarballIntegrity(file)).toBe(before);
    expect(tarballs).toEqual({ [packName]: file });
    expect(existsSync(measurementFile)).toBe(false);
  });

  it("measures the exact alias target with dependencies and scripts disabled", () => {
    const { root } = fixture();
    const pin = { name: "@typescript/typescript6", installName: "typescript", version: "6.0.2", integrity: `sha512-${createHash("sha512").update("compiler").digest("base64")}` };
    let inspected = false;
    const bytes = measureRuntimeInstallBytes(pin, { platform: "linux", arch: "x64", temporaryRoot: root,
      run: (command, args, options) => {
        if (command === "npm") {
          inspected = true;
          expect(args).toContain("--ignore-scripts");
          expect(JSON.parse(readFileSync(join(options.cwd, "package.json"), "utf8")).dependencies).toEqual({ typescript: "npm:@typescript/typescript6@6.0.2" });
        }
        return command === "du" ? "24\tnode_modules" : "";
      } });
    expect(inspected).toBe(true);
    expect(bytes).toBe(24576);
  });

  it("uses immutable pack tarballs and separate core measurement tarballs", () => {
    const { catalog, tarballs } = fixture();
    tarballs["@nodetool-ai/node-sdk"] = "/measurement/node-sdk.tgz";
    const result = measurementManifest(catalog.packs[1], tarballs, [
      { name: "@nodetool-ai/game-nodes", dir: "/workspace/game-nodes" },
      { name: "@nodetool-ai/game-renderer", dir: "/workspace/game-renderer" },
      { name: "@nodetool-ai/node-sdk", dir: "/workspace/node-sdk" }
    ]);
    expect(result.dependencies).toEqual({
      "@nodetool-ai/game-nodes": `file:${tarballs["@nodetool-ai/game-nodes"]}`,
      "@nodetool-ai/game-renderer": `file:${tarballs["@nodetool-ai/game-renderer"]}`
    });
    expect(result.overrides).toEqual({ "@nodetool-ai/game-renderer": `file:${tarballs["@nodetool-ai/game-renderer"]}`, "@nodetool-ai/node-sdk": "file:/measurement/node-sdk.tgz" });
  });

  it("measures allocated disk usage after a clean production install and removes its temporary project", () => {
    const { root, catalog, tarballs } = fixture();
    const calls = [];
    let project;
    const bytes = measurePackInstallBytes(catalog.packs[1], tarballs, [], { platform: "linux", arch: "x64", temporaryRoot: root,
      run: (command, args, options) => {
        project = options.cwd;
        calls.push([command, args]);
        expect(JSON.parse(readFileSync(join(project, "package.json"), "utf8")).dependencies).toHaveProperty("@nodetool-ai/game-nodes");
        expect(options.env.HOME).toBe(join(project, "home"));
        expect(options.env).not.toHaveProperty("SECRETS_MASTER_KEY");
        return command === "du" ? "16\tnode_modules\n" : "";
      } });
    expect(bytes).toBe(16 * 1024);
    expect(calls).toEqual([["npm", ["install", "--install-links", "--ignore-scripts", "--omit=dev", "--no-audit", "--no-fund"]], ["du", ["-sk", "node_modules"]]]);
    expect(existsSync(project)).toBe(false);
  });

  it("shares only a task-scoped download cache across fresh projects", () => {
    const { root, catalog, tarballs } = fixture();
    const cacheDir = join(root, "download-cache");
    const projects = [];
    const run = (command, args, options) => {
      if (command === "npm") {
        expect(args.slice(-2)).toEqual(["--cache", cacheDir]);
        projects.push(options.cwd);
      }
      return command === "du" ? "8\tnode_modules" : "";
    };
    for (const pack of catalog.packs) {
      measurePackInstallBytes(pack, tarballs, [], { platform: "linux", arch: "x64", temporaryRoot: root, cacheDir, run });
    }
    expect(new Set(projects).size).toBe(catalog.packs.length);
    expect(projects.every(project => !existsSync(project))).toBe(true);
  });

  it.each(["invalid", "0\tnode_modules", "9007199254740992\tnode_modules"])("rejects an invalid du result %s", usage => {
    const { root, catalog, tarballs } = fixture();
    expect(() => measurePackInstallBytes(catalog.packs[0], tarballs, [], { platform: "linux", arch: "x64", temporaryRoot: root, run: command => command === "du" ? usage : "" })).toThrow("Invalid install size");
  });

  it.each([["darwin", "x64"], ["linux", "arm64"]])("refuses %s-%s measurements", (platform, arch) => {
    const { catalog, tarballs } = fixture();
    const run = vi.fn();
    expect(() => measurePackInstallBytes(catalog.packs[0], tarballs, [], { platform, arch, run })).toThrow("linux-x64");
    expect(run).not.toHaveBeenCalled();
  });
});
