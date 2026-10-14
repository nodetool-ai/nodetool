import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { measureClosure } from "../measure-cli-closure.mjs";

const fixtures = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "nodetool-closure-"));
  fixtures.push(root);
  const counted = [];
  function pkg(path, manifest, payload = "", workspace = false) {
    const dir = join(root, path);
    mkdirSync(dir, { recursive: true });
    const manifestFile = join(dir, "package.json");
    writeFileSync(manifestFile, JSON.stringify(manifest));
    const payloadFile = join(dir, workspace ? "dist/index.js" : "index.js");
    mkdirSync(join(payloadFile, ".."), { recursive: true });
    writeFileSync(payloadFile, payload);
    counted.push(manifestFile, payloadFile);
    return dir;
  }
  return { root, pkg, counted };
}
afterEach(() => { for (const root of fixtures.splice(0)) { rmSync(root, { recursive: true, force: true }); } });

describe("CLI dependency closure", () => {
  it("measures real package directories once, excludes sources and nested modules, and resolves nested versions", () => {
    const { root, pkg, counted } = fixture();
    const cli = pkg("packages/cli", { name: "@nodetool-ai/cli", dependencies: { shared: "1", parent: "1", alias: "1" } }, "cli", true);
    const shared = pkg("node_modules/shared", { name: "shared", version: "1" }, "root shared");
    pkg("node_modules/parent", { name: "parent", dependencies: { shared: "2" } }, "parent");
    pkg("node_modules/parent/node_modules/shared", { name: "shared", version: "2" }, "nested shared");
    symlinkSync(shared, join(root, "node_modules/alias"), "dir");
    writeFileSync(join(cli, "unpublished-source.ts"), "excluded source");
    mkdirSync(join(shared, "node_modules/unreachable"), { recursive: true });
    writeFileSync(join(shared, "node_modules/unreachable/ignored"), "excluded nested module");
    const report = measureClosure({ root });
    const totals = counted.reduce((result, path) => {
      const stat = lstatSync(path);
      return { apparentBytes: result.apparentBytes + stat.size, diskBytes: result.diskBytes + stat.blocks * 512 };
    }, { apparentBytes: 0, diskBytes: 0 });
    expect(report.packageCount).toBe(4);
    expect(report.packageCount).toBeGreaterThan(0);
    expect(report.apparentBytes).toBe(totals.apparentBytes);
    expect(report.diskBytes).toBe(totals.diskBytes);
    expect(report.largestPackages.map((entry) => entry.path)).toContain("node_modules/parent/node_modules/shared");
    const result = spawnSync(process.execPath, [resolve("scripts/measure-cli-closure.mjs"), "--root", root, "--scenario", "S0", "--json"], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([report]);
  });

  it("follows optional dependencies and required peers but ignores optional peers and dev dependencies", () => {
    const { root, pkg } = fixture();
    pkg("packages/cli", {
      name: "@nodetool-ai/cli", dependencies: { shared: "1" },
      optionalDependencies: { optional: "1", absent: "1" },
      peerDependencies: { required: "1", ignored: "1" },
      peerDependenciesMeta: { ignored: { optional: true } }, devDependencies: { dev: "1" }
    }, "", true);
    for (const name of ["shared", "optional", "required", "ignored", "dev"]) {
      pkg(`node_modules/${name}`, { name }, name);
    }
    const report = measureClosure({ root });
    expect(report.packageCount).toBe(4);
    expect(report.missingOptional).toEqual([{ dependent: "@nodetool-ai/cli", name: "absent" }]);
    expect(report.largestPackages.map((entry) => entry.name).sort()).toEqual(["@nodetool-ai/cli", "optional", "required", "shared"]);
  });

  it("projects S3 cuts at core edges, preserves libraries reached externally, and adds tsx", () => {
    const { root, pkg } = fixture();
    const cli = pkg("packages/cli", {
      name: "@nodetool-ai/cli",
      dependencies: { "@nodetool-ai/fal-nodes": "*", sharp: "1", outside: "1" },
      optionalDependencies: { "js-tiktoken": "1" }
    }, "", true);
    const fal = pkg("packages/fal-nodes", { name: "@nodetool-ai/fal-nodes", dependencies: { heavy: "1" } }, "", true);
    mkdirSync(join(root, "node_modules/@nodetool-ai"), { recursive: true });
    symlinkSync(fal, join(root, "node_modules/@nodetool-ai/fal-nodes"), "dir");
    symlinkSync(cli, join(root, "node_modules/@nodetool-ai/cli"), "dir");
    pkg("node_modules/sharp", { name: "sharp" }, "retained through external edge");
    pkg("node_modules/outside", { name: "outside", dependencies: { sharp: "1" } });
    pkg("node_modules/heavy", { name: "heavy" });
    pkg("node_modules/tsx", { name: "tsx" });
    pkg("node_modules/js-tiktoken", { name: "js-tiktoken" });
    expect(measureClosure({ root }).packageCount).toBe(6);
    const projected = measureClosure({ root, scenario: "S3" });
    expect(projected.largestPackages.map((entry) => entry.name).sort()).toEqual(["@nodetool-ai/cli", "outside", "sharp", "tsx"]);
  });

  it("fails instead of reporting a misleading partial closure when a required package is absent", () => {
    const { root, pkg } = fixture();
    pkg("packages/cli", { name: "@nodetool-ai/cli", dependencies: { absent: "1" } }, "", true);
    expect(() => measureClosure({ root })).toThrow("requires uninstalled package absent");
    expect(() => measureClosure({ root, roots: [] })).toThrow("visited no packages");
  });

  it("bounds the largest-package report on a large cyclic dependency graph", () => {
    const { root, pkg } = fixture();
    const dependencies = {};
    for (let index = 0; index < 1500; index += 1) {
      const name = `fixture-${index}`;
      dependencies[name] = "1";
      pkg(`node_modules/${name}`, { name, dependencies: { "fixture-0": "1" } }, "payload");
    }
    pkg("packages/cli", { name: "@nodetool-ai/cli", dependencies }, "", true);
    const report = measureClosure({ root });
    expect(report.packageCount).toBe(1501);
    expect(report.largestPackages).toHaveLength(20);
    expect(report.largestPackages[0].name).toBe("@nodetool-ai/cli");
  });
});
