/**
 * Publish-result classification for `node scripts/publish-packages.mjs`.
 *
 * The whole point of the script is that a release can be re-run after a partial
 * failure. That only holds if "this version is already on the registry" is read
 * as success and a genuine error is not — misreading either direction is silent:
 * one aborts a recoverable release, the other reports a broken release as green.
 */
import { afterEach, describe, expect, it } from "vitest";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { RELEASE_REPOSITORY } from "../release/verify-staging.mjs";

import {
  classifyPublishResult,
  packRelease,
  publishInDependencyOrder,
  publishOrder,
  unmetDeps,
  workspaceDeps
} from "../publish-packages.mjs";

/** The 404 that killed every release from 0.7.0-rc.38 onward. */
const UNAUTHORIZED_404 = [
  "npm error code E404",
  "npm error 404 Not Found - PUT https://registry.npmjs.org/@nodetool-ai%2fprotocol - Not found",
  "npm error 404  '@nodetool-ai/protocol@0.7.0-rc.40' is not in this registry.",
].join("\n");

describe("classifyPublishResult", () => {
  it("counts a clean exit as published", () => {
    expect(classifyPublishResult(0, "+ @nodetool-ai/cli@0.7.0-rc.40")).toBe(
      "published"
    );
  });

  it("counts an already-published version as skipped, not failed", () => {
    const output =
      "npm error code EPUBLISHCONFLICT\n" +
      "npm error You cannot publish over the previously published versions: 0.7.0-rc.40.";
    expect(classifyPublishResult(1, output)).toBe("skipped");
  });

  it("counts the unauthorized 404 as a real failure", () => {
    expect(classifyPublishResult(1, UNAUTHORIZED_404)).toBe("failed");
  });

  it("counts an arbitrary non-zero exit as a real failure", () => {
    expect(classifyPublishResult(1, "npm error code ENEEDAUTH")).toBe("failed");
  });

  it("does not mistake a 404 mentioning a version for a conflict", () => {
    // Guards the substring match: "cannot publish over" must not be inferred
    // from unrelated text that merely names a version.
    expect(classifyPublishResult(1, "npm error 404 version 1.2.3 not found")).toBe(
      "failed"
    );
  });
});

describe("workspaceDeps", () => {
  it("collects workspace names from every dependency field", () => {
    const names = new Set(["@nodetool-ai/a", "@nodetool-ai/b", "@nodetool-ai/c"]);
    const pkg = {
      name: "@nodetool-ai/c",
      dependencies: { "@nodetool-ai/a": "*", chalk: "^5.0.0" },
      peerDependencies: { "@nodetool-ai/b": "*" },
      devDependencies: { "@nodetool-ai/c": "*" }
    };
    expect(workspaceDeps(pkg, names).sort()).toEqual([
      "@nodetool-ai/a",
      "@nodetool-ai/b"
    ]);
  });
});

describe("publishOrder", () => {
  it("puts each package after its workspace dependencies", () => {
    const order = publishOrder([
      { name: "cli", deps: ["agents", "app-runtime"] },
      { name: "agents", deps: ["app-runtime"] },
      { name: "app-runtime", deps: [] },
      { name: "protocol", deps: [] }
    ]).map((p) => p.name);
    expect(order).toEqual(["app-runtime", "protocol", "agents", "cli"]);
  });

  it("throws on a dependency cycle instead of looping", () => {
    expect(() =>
      publishOrder([
        { name: "a", deps: ["b"] },
        { name: "b", deps: ["a"] }
      ])
    ).toThrow(/cycle among: a, b/);
  });
});

describe("unmetDeps", () => {
  it.skipIf(process.platform === "win32")("does not extend a broken partial release through an already-published dependency", () => {
    const root = mkdtempSync(join(tmpdir(), "publish-retry-"));
    try {
      mkdirSync(join(root, "scripts"));
      mkdirSync(join(root, "bin"));
      copyFileSync(new URL("../publish-packages.mjs", import.meta.url), join(root, "scripts", "publish-packages.mjs"));
      copyFileSync(new URL("../smoke-packed-cli.mjs", import.meta.url), join(root, "scripts", "smoke-packed-cli.mjs"));
      symlinkSync(new URL("../minimal-dependency-guard.mjs", import.meta.url), join(root, "scripts", "minimal-dependency-guard.mjs"));
      for (const file of ["packed-registry.mjs", "packed-fal-fixture.mjs"]) {
        copyFileSync(new URL(`../${file}`, import.meta.url), join(root, "scripts", file));
      }
      for (const directory of ["release", "node-catalog", "fixtures"]) {
        symlinkSync(new URL(`../${directory}`, import.meta.url), join(root, "scripts", directory), "dir");
      }
      const tarballs = join(root, "tarballs");
      mkdirSync(tarballs);
      for (const [name, dependencies] of [["image-editor", {}], ["agents", { "image-editor": "1.0.0" }], ["cli", { agents: "1.0.0" }]]) {
        const dir = join(root, "packages", name);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "package.json"), JSON.stringify({ name, version: "1.0.0", dependencies }));
        const staging = join(root, "staging", name);
        mkdirSync(join(staging, "package"), { recursive: true });
        copyFileSync(join(dir, "package.json"), join(staging, "package/package.json"));
        const packed = spawnSync("tar", ["-czf", join(tarballs, `${name}.tgz`), "-C", staging, "package"], { encoding: "utf8" });
        expect(packed.status, packed.stderr).toBe(0);
      }
      writeFileSync(join(root, "bin", "npm"), `#!${process.execPath}\nif (process.argv[2] === 'pack') { console.log(JSON.stringify([{filename: process.cwd().split('/').at(-1) + '.tgz'}])); process.exit(0); } if (process.argv[2] === 'view') { if (process.argv[3] === 'agents@1.0.0') { console.log('"1.0.0"'); process.exit(0); } process.exit(1); } if (process.argv[3].endsWith('/image-editor.tgz')) process.exit(1); console.log('unexpected publish');`, { mode: 0o755 });
      const result = spawnSync(process.execPath, [join(root, "scripts", "publish-packages.mjs"), "--tarballs-dir", tarballs], { encoding: "utf8", env: { ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH}` } });
      expect(result.status).toBe(1);
      expect(result.stdout).not.toContain("publish cli@1.0.0");
      expect(result.stderr).toContain("BLOCK   cli@1.0.0");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  // The 0.8.2 release: app-runtime's PUT returned 404, then agents and cli
  // published anyway and pointed at an app-runtime@0.8.2 that never existed.
  it("blocks a package whose dependency failed to publish", () => {
    const available = new Set(["protocol"]);
    expect(unmetDeps({ name: "agents", deps: ["app-runtime", "protocol"] }, available)).toEqual([
      "app-runtime"
    ]);
  });

  it("lets a package through once every dependency is available", () => {
    const available = new Set(["app-runtime", "protocol"]);
    expect(unmetDeps({ name: "agents", deps: ["app-runtime", "protocol"] }, available)).toEqual([]);
  });
});

const releaseRoots = [];
afterEach(() => { for (const root of releaseRoots.splice(0)) { rmSync(root, { recursive: true, force: true }); } });
function releaseFixture() {
  const root = mkdtempSync(join(tmpdir(), "publish-pack-order-"));
  releaseRoots.push(root);
  const dest = join(root, "tarballs");
  mkdirSync(dest);
  const data = join(root, "packages/node-catalog/data");
  mkdirSync(data, { recursive: true });
  writeFileSync(join(data, "index.json"), JSON.stringify({ packs: [
    { npm: { name: "core-nodes" }, provides: [] },
    { npm: { name: "game-nodes" }, provides: ["game-renderer"] }
  ] }));
  return { root, dest, packages: ["cli", "core-nodes", "game-nodes", "game-renderer", "pack-core", "node-catalog"].map(name => ({ name })) };
}

// npm rejects a provenance publish whose package.json repository differs from
// the repository that built it. The 0.8.7 release lost 53 packages this way:
// a new workspace without a "repository" field failed, and every dependent of
// it was held back.
describe("public package metadata", () => {
  const root = new URL("../../", import.meta.url);
  const manifests = ["packages", "reliability"].flatMap(dir => {
    const base = new URL(`${dir}/`, root);
    return readdirSync(base, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && existsSync(new URL(`${entry.name}/package.json`, base)))
      .map(entry => JSON.parse(readFileSync(new URL(`${entry.name}/package.json`, base), "utf8")))
      .filter(pkg => !pkg.private && pkg.name && pkg.version);
  });

  it("inspects the public workspace packages", () => {
    expect(manifests.length).toBeGreaterThan(10);
  });

  it.each(manifests.map(pkg => [pkg.name, pkg]))("%s names the release repository for provenance", (_name, pkg) => {
    const url = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
    expect(url?.replace(/^git\+/, "").replace(/\.git$/, "")).toBe(RELEASE_REPOSITORY);
  });
});

describe("publishInDependencyOrder", () => {
  const pkg = (name, deps = []) => ({ name, version: "1.0.0", deps });
  // protocol <- runtime <- cli, with three leaves beside them.
  const packages = publishOrder([
    pkg("cli", ["runtime"]), pkg("runtime", ["protocol"]), pkg("protocol"),
    pkg("leaf-a"), pkg("leaf-b"), pkg("leaf-c")
  ]);

  it("publishes each package after its dependencies and never runs more than the limit", async () => {
    const available = new Set();
    const finished = [];
    let active = 0;
    let peak = 0;
    await publishInDependencyOrder(packages, available, 2, async (p) => {
      for (const dep of p.deps) { expect(finished).toContain(dep); }
      active++;
      peak = Math.max(peak, active);
      await new Promise(resolveTick => setTimeout(resolveTick, 5));
      active--;
      finished.push(p.name);
      available.add(p.name);
    }, () => { throw new Error("nothing should block"); });
    expect(finished).toHaveLength(packages.length);
    expect(peak).toBe(2);
  });

  it("blocks every transitive dependent of a failed package and still publishes the rest", async () => {
    const available = new Set();
    const blocked = [];
    const attempted = [];
    await publishInDependencyOrder(packages, available, 4, async (p) => {
      attempted.push(p.name);
      if (p.name !== "protocol") { available.add(p.name); }
    }, (p, unmet) => { blocked.push([p.name, unmet]); });
    expect(blocked).toEqual([["runtime", ["protocol"]], ["cli", ["runtime"]]]);
    expect(attempted.sort()).toEqual(["leaf-a", "leaf-b", "leaf-c", "protocol"]);
  });
});

describe("release packing order", () => {
  it("packs every catalog registrar and companion once, pins and rebuilds catalog, then packs remaining core", async () => {
    const { root, dest, packages } = releaseFixture();
    const events = [];
    const artifacts = await packRelease(packages, dest, { root,
      packPackages: batch => {
        events.push(["pack", batch.map(pkg => pkg.name)]);
        return Object.fromEntries(batch.map(pkg => {
          const file = join(dest, `${pkg.name}.tgz`);
          writeFileSync(file, `original ${pkg.name}`);
          return [pkg.name, file];
        }));
      },
      pin: async (file, tarballs, options) => {
        events.push(["pins", Object.keys(tarballs)]);
        expect(options.workspaces).toEqual(packages);
        expect(file).toBe(join(root, "packages/node-catalog/data/index.json"));
      },
      rebuildCatalog: () => { events.push(["catalog"]); }
    });
    expect(events).toEqual([
      ["pack", ["core-nodes", "game-nodes", "game-renderer"]],
      ["pins", ["core-nodes", "game-nodes", "game-renderer"]],
      ["catalog"],
      ["pack", ["cli", "pack-core", "node-catalog"]]
    ]);
    expect(Object.keys(artifacts)).toEqual(["core-nodes", "game-nodes", "game-renderer", "cli", "pack-core", "node-catalog"]);
    expect(readFileSync(artifacts["game-nodes"], "utf8")).toBe("original game-nodes");
  });

  it("refuses to overwrite existing original artifacts", async () => {
    const { root, dest, packages } = releaseFixture();
    writeFileSync(join(dest, "existing.tgz"), "original");
    await expect(packRelease(packages, dest, { root })).rejects.toThrow("must be empty");
    expect(readFileSync(join(dest, "existing.tgz"), "utf8")).toBe("original");
  });

  it("refuses a release missing a catalog companion before packing", async () => {
    const { root, dest, packages } = releaseFixture();
    await expect(packRelease(packages.filter(pkg => pkg.name !== "game-renderer"), dest, { root })).rejects.toThrow("No public workspace package for catalog entry game-renderer");
  });

  it("detects deliberate artifact replacement during the pin write before packing core", async () => {
    const { root, dest, packages } = releaseFixture();
    const batches = [];
    await expect(packRelease(packages, dest, { root,
      packPackages: batch => {
        batches.push(batch);
        return Object.fromEntries(batch.map(pkg => {
          const file = join(dest, `${pkg.name}.tgz`);
          writeFileSync(file, "original");
          return [pkg.name, file];
        }));
      },
      pin: async (_file, tarballs) => { writeFileSync(tarballs["game-renderer"], "altered"); },
      rebuildCatalog: () => {}
    })).rejects.toThrow("Already-packed release artifact changed: game-renderer");
    expect(batches).toHaveLength(1);
  });
});
