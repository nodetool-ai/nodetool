import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { bumpCatalogVersion } from "../bump-version.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const temporaryRoots = [];
const OLD_VERSION = "1.2.3";
const NEW_VERSION = "1.2.4";

function catalogFixture() {
  return {
    schemaVersion: 1,
    coreVersion: OLD_VERSION,
    installPins: [{ name: "shared-library", version: "1.0.0", integrity: "sha512-shared", shared: true }],
    owners: { "fixture.Node": "core" },
    packs: [{
      id: "core", npm: { name: "@nodetool-ai/core-nodes", version: OLD_VERSION, integrity: "sha512-old" },
      installBytes: 42, scriptAllowlist: [{ name: "fixture-native", version: "1.0.0", integrity: "sha512-scripts" }]
    }]
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("catalog cohort version bump", () => {
  it("updates every version and invalidates release pins without changing the input", () => {
    const index = catalogFixture();
    const original = JSON.stringify(index);
    const updated = bumpCatalogVersion(index, NEW_VERSION);
    expect(JSON.stringify(index)).toBe(original);
    expect(updated.coreVersion).toBe(NEW_VERSION);
    expect(updated.installPins).toEqual([]);
    expect(updated.owners).toEqual(index.owners);
    expect(updated.packs[0].npm.version).toBe(NEW_VERSION);
    expect(updated.packs[0].npm.integrity).toBe("");
    expect(updated.packs[0].installBytes).toBe(0);
    expect(updated.packs[0].scriptAllowlist).toEqual([]);
    expect(bumpCatalogVersion(updated, NEW_VERSION)).toEqual(updated);
  });

  it("retains current release pins for an unchanged cohort", () => {
    const index = catalogFixture();
    expect(bumpCatalogVersion(index, OLD_VERSION)).toEqual(index);
  });

  it("builds and packs a fixture whose catalog pins match the bumped package version", () => {
    const root = mkdtempSync(join(tmpdir(), "nodetool-catalog-bump-"));
    temporaryRoots.push(root);
    mkdirSync(join(root, "scripts"));
    const packageDir = join(root, "packages/node-catalog");
    mkdirSync(join(packageDir, "data"), { recursive: true });
    mkdirSync(join(packageDir, "dist"));
    copyFileSync(join(ROOT, "scripts/bump-version.mjs"), join(root, "scripts/bump-version.mjs"));
    copyFileSync(join(ROOT, "packages/node-catalog/build.mjs"), join(packageDir, "build.mjs"));
    writeFileSync(join(packageDir, "package.json"), JSON.stringify({ name: "@nodetool-ai/node-catalog", version: OLD_VERSION, files: ["dist"] }));
    writeFileSync(join(packageDir, "data/index.json"), JSON.stringify(catalogFixture()));
    writeFileSync(join(packageDir, "data/nodes.ndjson"), '{"node_type":"fixture.Node"}\n');
    writeFileSync(join(packageDir, "dist/index.js"), "export {};\n");
    execFileSync(process.execPath, [join(root, "scripts/bump-version.mjs"), NEW_VERSION, "--no-commit"], { cwd: root, stdio: "pipe" });
    execFileSync(process.execPath, [join(packageDir, "build.mjs")], { cwd: packageDir });
    const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
    const built = JSON.parse(readFileSync(join(packageDir, "dist/index.json"), "utf8"));
    expect(built.coreVersion).toBe(manifest.version);
    expect(built.packs.every((pack) => pack.npm.version === manifest.version)).toBe(true);
    const result = JSON.parse(execFileSync("npm", ["pack", "--json", "--offline", "--ignore-scripts"], { cwd: packageDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    const tarball = join(packageDir, result[0].filename);
    const packedCatalog = JSON.parse(execFileSync("tar", ["-xOf", tarball, "package/dist/index.json"], { encoding: "utf8" }));
    const packedManifest = JSON.parse(execFileSync("tar", ["-xOf", tarball, "package/package.json"], { encoding: "utf8" }));
    expect(packedManifest.version).toBe(NEW_VERSION);
    expect(packedCatalog).toEqual(built);
    expect(packedCatalog.coreVersion).toBe(packedManifest.version);
    expect(packedCatalog.packs.every((pack) => pack.npm.version === packedManifest.version && pack.npm.integrity === "" && pack.installBytes === 0)).toBe(true);
  });
});
