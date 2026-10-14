/**
 * Helpers and fresh local MCP execution for `scripts/smoke-packed-cli.mjs`.
 * The complete packed installs run in CI.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import yaml from "js-yaml";

import { assertCoreOnlyInstall, cleanEnv, codecProbeSource, coreOnlyCliManifest, existingTarballs, installedPackages, mcpWorkflowCode, missingCommands, missingFalGraph, probeMcp, REQUIRED_COMMANDS, repackCoreCli, smokeManifest } from "../smoke-packed-cli.mjs";

const fixtures = [];
afterEach(() => { for (const root of fixtures.splice(0)) { rmSync(root, { recursive: true, force: true }); } });

it("keeps the required core-smoke status dependent on verification and the independent packed install", () => {
  const workflow = yaml.load(readFileSync(new URL("../../.github/workflows/packed-core-cli.yml", import.meta.url), "utf8"));
  const guard = workflow.jobs["core-smoke"];
  expect(guard.needs).toEqual(["verification", "packed-install"]);
  expect(guard.if).toBe("always()");
  const checks = workflow.jobs.verification.steps.map(step => step.run);
  for (const command of ["npm run test:affected", "npm run typecheck", "npm run lint", "npm run dev:nodetool -- harness gate --base origin/main", "npm run backend:smoke"]) {
    expect(checks).toContain(command);
  }
  expect(workflow.jobs["packed-install"].needs).toBeUndefined();
  const packedChecks = workflow.jobs["packed-install"].steps.map(step => step.run);
  expect(packedChecks).toContain("node scripts/smoke-packed-cli.mjs --core-only");
  expect(packedChecks).toContain("node scripts/smoke-packed-cli.mjs");
  expect(packedChecks.indexOf("node scripts/smoke-packed-cli.mjs")).toBeGreaterThan(packedChecks.indexOf("node scripts/smoke-packed-cli.mjs --core-only"));
  for (const job of ["verification", "packed-install", "release-pins"]) {
    expect(workflow.jobs[job].steps.find(step => step.uses === "./.github/actions/setup-build").with.cache).toBe("read-only");
  }
  for (const [verification, installed, expected] of [["success", "success", 0], ["failure", "success", 1], ["success", "cancelled", 1], ["skipped", "success", 1]]) {
    const result = spawnSync("bash", ["-c", guard.steps[0].run], {
      env: { ...process.env, VERIFICATION_RESULT: verification, PACKED_INSTALL_RESULT: installed }
    });
    expect(result.status).toBe(expected);
  }
});

function releaseTarball(root, filename, name, version) {
  const staging = join(root, "staging");
  mkdirSync(join(staging, "package"), { recursive: true });
  writeFileSync(join(staging, "package/package.json"), JSON.stringify({ name, version }));
  const file = join(root, filename);
  const result = spawnSync("tar", ["-czf", file, "-C", staging, "package"], { encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
  return file;
}

describe("existingTarballs", () => {
  it("uses package manifests instead of relying on tarball filenames", () => {
    const root = mkdtempSync(join(tmpdir(), "nodetool-release-tarballs-"));
    fixtures.push(root);
    const file = releaseTarball(root, "arbitrary.tgz", "@nodetool-ai/cli", "1.2.3");
    expect(existingTarballs([{ name: "@nodetool-ai/cli", version: "1.2.3" }], root))
      .toEqual({ "@nodetool-ai/cli": file });
    expect(() => existingTarballs([{ name: "@nodetool-ai/agents", version: "1.2.3" }], root))
      .toThrow("Missing release tarballs: @nodetool-ai/agents");
    expect(() => existingTarballs([{ name: "@nodetool-ai/cli", version: "2.0.0" }], root))
      .toThrow("differs from workspace 2.0.0");
    releaseTarball(root, "duplicate.tgz", "@nodetool-ai/cli", "1.2.3");
    expect(() => existingTarballs([{ name: "@nodetool-ai/cli", version: "1.2.3" }], root))
      .toThrow("Duplicate tarball for @nodetool-ai/cli");
  });
});

describe("smokeManifest", () => {
  it("depends on the CLI tarball and overrides every other workspace", () => {
    const manifest = smokeManifest({
      "@nodetool-ai/cli": "/t/cli.tgz",
      "@nodetool-ai/agents": "/t/agents.tgz"
    });
    expect(manifest.dependencies).toEqual({ "@nodetool-ai/cli": "file:/t/cli.tgz" });
    // npm rejects an override that conflicts with a direct dependency.
    expect(manifest.overrides).toEqual({ "@nodetool-ai/agents": "file:/t/agents.tgz" });
  });
});

describe("missingCommands", () => {
  it("finds commands only at the command-list indent", () => {
    const help = [
      "Commands:",
      ...REQUIRED_COMMANDS.filter(name => name !== "node").map(name => `  ${name} [options]    Description`),
      "    node             (an option description, not a command)"
    ].join("\n");
    expect(missingCommands(help)).toEqual(["node"]);
  });
});

describe("cleanEnv", () => {
  it("drops keys, NodeTool settings, and the desktop session", () => {
    const env = cleanEnv("/h", {
      PATH: "/bin",
      OPENAI_API_KEY: "sk",
      SECRETS_MASTER_KEY: "k",
      DBUS_SESSION_BUS_ADDRESS: "unix:path=/run/bus",
      DISPLAY: ":0"
    });
    expect(env.PATH).toBe("/bin");
    expect(env.HOME).toBe("/h");
    for (const key of ["OPENAI_API_KEY", "SECRETS_MASTER_KEY", "DBUS_SESSION_BUS_ADDRESS", "DISPLAY"]) {
      expect(env).not.toHaveProperty(key);
    }
  });
});

function installFixture(app, name, manifest = {}, modules = "node_modules") {
  const dir = join(app, modules, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name, version: "1.0.0", ...manifest }));
  return dir;
}

function appFixture(dependencies = {}) {
  const root = mkdtempSync(join(tmpdir(), "nodetool-core-guard-"));
  fixtures.push(root);
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "core-guard-fixture", version: "1.0.0", private: true, dependencies }));
  return root;
}

describe("core-only tarballs", () => {
  it("removes packs from every install edge and retains the executable core nodes", () => {
    const original = { name: "@nodetool-ai/cli", version: "1.2.3",
      dependencies: { "@nodetool-ai/base-nodes": "1.2.3", "@nodetool-ai/game-renderer": "1.2.3", "@nodetool-ai/node-catalog": "1.2.3", tsx: "4.22.4" },
      optionalDependencies: { "@nodetool-ai/fal-nodes": "1.2.3" },
      peerDependencies: { "@nodetool-ai/transformers-js-provider": "1.2.3" },
      peerDependenciesMeta: { "@nodetool-ai/transformers-js-provider": { optional: true } } };
    const result = coreOnlyCliManifest(original);
    expect(result.dependencies).not.toHaveProperty("@nodetool-ai/base-nodes");
    expect(result.dependencies).not.toHaveProperty("@nodetool-ai/game-renderer");
    expect(result.optionalDependencies).toEqual({});
    expect(result.peerDependencies).toEqual({});
    expect(result.peerDependenciesMeta).toEqual({});
    expect(result.dependencies).toMatchObject({ "@nodetool-ai/core-nodes": "1.2.3", "@nodetool-ai/text-nodes": "1.2.3", "@nodetool-ai/data-nodes": "1.2.3", "@nodetool-ai/llm-nodes": "1.2.3", "@nodetool-ai/code-nodes": "1.2.3", tsx: "4.22.4" });
    expect(original.dependencies).toHaveProperty("@nodetool-ai/base-nodes");
  });

  it("re-packs the test CLI while preserving its original tarball", () => {
    const root = appFixture();
    const original = releaseTarball(root, "original.tgz", "@nodetool-ai/cli", "1.2.3");
    const result = repackCoreCli(original, root);
    const read = file => JSON.parse(spawnSync("tar", ["-xOf", file, "package/package.json"], { encoding: "utf8" }).stdout);
    expect(read(result).dependencies).toHaveProperty("@nodetool-ai/core-nodes", "1.2.3");
    expect(read(original)).not.toHaveProperty("dependencies");
  });
});

describe("core-only contamination guard", () => {
  it("rejects an empty audit and accepts a tree containing executable core packages", () => {
    const app = appFixture();
    expect(() => assertCoreOnlyInstall(app)).toThrow("inspected no installed packages");
    installFixture(app, "@nodetool-ai/core-nodes");
    expect(assertCoreOnlyInstall(app)).toBe(1);
  });

  it.each(["@nodetool-ai/fal-nodes", "@nodetool-ai/base-nodes", "@nodetool-ai/game-renderer", "sharp", "@napi-rs/canvas", "@dimforge/rapier3d-compat"])("fails when %s is deliberately installed as a nested dependency", name => {
    const app = appFixture();
    installFixture(app, "@nodetool-ai/core-nodes");
    const nested = installFixture(app, name, {}, "node_modules/@nodetool-ai/core-nodes/node_modules");
    expect(installedPackages(join(app, "node_modules")).map(entry => entry.manifest.name)).toContain(name);
    expect(() => assertCoreOnlyInstall(app)).toThrow(`${name} (${nested})`);
  });

  it("rejects a deliberately installed pack tarball", () => {
    const app = appFixture();
    const tarball = releaseTarball(app, "fal.tgz", "@nodetool-ai/fal-nodes", "1.2.3");
    const installed = spawnSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", `file:${tarball}`], { cwd: app, encoding: "utf8", timeout: 30000 });
    expect(installed.status, installed.stderr).toBe(0);
    expect(() => assertCoreOnlyInstall(app)).toThrow("@nodetool-ai/fal-nodes");
  });

  it("allows esbuild only when tsx requires that installed version", () => {
    const app = appFixture({ tsx: "1.0.0" });
    installFixture(app, "tsx", { dependencies: { esbuild: "~0.28.0" } });
    installFixture(app, "esbuild", { version: "0.28.1" });
    expect(assertCoreOnlyInstall(app)).toBe(2);
    installFixture(app, "esbuild", { version: "0.27.0" });
    expect(() => assertCoreOnlyInstall(app)).toThrow(/npm ls .* exited 1/);
  });

  it("rejects an esbuild copy outside the tsx dependency closure", () => {
    const app = appFixture({ tsx: "1.0.0" });
    installFixture(app, "tsx", { dependencies: { esbuild: "~0.28.0" } });
    installFixture(app, "esbuild", { version: "0.28.1" });
    installFixture(app, "@nodetool-ai/core-nodes");
    installFixture(app, "esbuild", { version: "0.28.1" }, "node_modules/@nodetool-ai/core-nodes/node_modules");
    expect(() => assertCoreOnlyInstall(app)).toThrow("esbuild is installed outside its required core dependency closure");
  });

  it("admits only the declared compiler dependency of tRPC's resolved TypeScript wrapper", () => {
    const app = appFixture({ "@trpc/server": "1.0.0" });
    installFixture(app, "@trpc/server", { peerDependencies: { typescript: ">=5.7.2" } });
    installFixture(app, "typescript", { name: "@typescript/typescript6", version: "6.0.2", dependencies: { "@typescript/old": "npm:typescript@^6" } });
    installFixture(app, "@typescript/old", { name: "typescript", version: "6.0.3" });
    expect(assertCoreOnlyInstall(app)).toBe(3);
    installFixture(app, "@nodetool-ai/core-nodes");
    installFixture(app, "typescript", { version: "6.0.3" }, "node_modules/@nodetool-ai/core-nodes/node_modules");
    expect(() => assertCoreOnlyInstall(app)).toThrow("typescript is installed outside its required core dependency closure");
  });

  it("rejects a wrapper compiler that violates its declared alias range", () => {
    const app = appFixture({ "@trpc/server": "1.0.0" });
    installFixture(app, "@trpc/server", { peerDependencies: { typescript: ">=5.7.2" } });
    installFixture(app, "typescript", { name: "@typescript/typescript6", version: "6.0.2", dependencies: { "@typescript/old": "npm:typescript@^6" } });
    installFixture(app, "@typescript/old", { name: "typescript", version: "5.6.0" });
    expect(() => assertCoreOnlyInstall(app)).toThrow(/npm ls .* exited 1/);
  });

  it("allows TypeScript only when tRPC's installed mandatory peers require it", () => {
    const app = appFixture({ "@trpc/client": "1.0.0", "@trpc/server": "1.0.0" });
    for (const name of ["@trpc/client", "@trpc/server"]) {
      installFixture(app, name, { peerDependencies: { typescript: ">=5.7.2" } });
    }
    installFixture(app, "typescript", { name: "@typescript/typescript6", version: "6.0.2" });
    expect(assertCoreOnlyInstall(app)).toBe(3);
    installFixture(app, "typescript", { version: "5.6.0" });
    expect(() => assertCoreOnlyInstall(app)).toThrow(/npm ls .* exited 1/);
  });
});

describe("packed runtime probes", () => {
  it("distinguishes a missing required FAL property from a missing-pack-only graph", async () => {
    const { NodeRegistry, validateGraph } = await import("@nodetool-ai/node-sdk");
    const { readCatalogIndex, readCatalogNodes } = await import("@nodetool-ai/node-catalog");
    const registry = new NodeRegistry();
    const graph = missingFalGraph();
    const node = readCatalogNodes().find(node => node.node_type === graph.nodes[0].type);
    expect(node).toBeDefined();
    registry.loadCatalog([node], readCatalogIndex().packs);
    expect(validateGraph(graph, registry).issues.map(issue => issue.code)).toEqual(expect.arrayContaining(["pack_not_installed", "property"]));
    expect(validateGraph(missingFalGraph({ audio: { type: "audio", data: "AA==" } }), registry).issues.map(issue => issue.code)).toEqual(["pack_not_installed"]);
  });

  it("generates valid module source for the codec identity decode", () => {
    const source = codecProbeSource("/tmp/fixture.mp4");
    const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8" });
    expect(checked.status, checked.stderr).toBe(0);
    expect(source).toContain("await ensureCodecs()");
    expect(source).toContain("audio.numberOfFrames, 1024");
    expect(source).toContain("video.displayWidth, 64");
    expect(source).toContain("video.displayHeight, 48");
  });

  it("executes MCP workflow code against the workflow tools", async () => {
    const source = mcpWorkflowCode({ nodes: [], edges: [] }).replace(/^import[^\n]+\n/, "");
    const calls = [];
    const create = async args => { calls.push(args); return { id: "workflow" }; };
    const run = async args => { calls.push(args); return { status: "completed", output: "packed MCP smoke" }; };
    const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
    await expect(new AsyncFunction("create_workflow", "run_workflow", source)(create, run)).resolves.toMatchObject({ status: "completed" });
    expect(calls).toEqual([{ name: "Packed MCP smoke", graph: { nodes: [], edges: [] } }, { workflow_id: "workflow", params: { text: "packed MCP smoke" } }]);
  });
});

it("executes a core workflow through a fresh local MCP database", async () => {
  const home = appFixture();
  const root = resolve(import.meta.dirname, "../..");
  const graph = JSON.parse(readFileSync(join(root, "examples/workflows/hello_input_output_cli.json"), "utf8")).graph;
  const tools = await probeMcp(process.execPath, {
    ...cleanEnv(home), SECRETS_MASTER_KEY: "a".repeat(64)
  }, home, graph, 45000, [join(root, "packages/cli/dist/nodetool.js")]);
  expect(tools).toBeGreaterThan(0);
}, 60000);

it("reports an unavailable MCP executable without an unhandled spawn error", async () => {
  const home = appFixture();
  await expect(probeMcp(join(home, "missing-nodetool"), cleanEnv(home), home))
    .rejects.toMatchObject({ code: "ENOENT" });
});
