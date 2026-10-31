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

import { assertInstalledSelection, assertCoreInstallSize, assertCoreOnlyInstall, cleanEnv, codecProbeSource, existingTarballs, installSmokeCommandFeatures, installedPackages, mcpWorkflowCode, missingCommands, missingFalGraph, probeMcp, probeServe, REQUIRED_COMMANDS, FEATURE_REQUIRED_COMMANDS, COMPOSED_SMOKE_PACK_IDS } from "../smoke-packed-cli.mjs";
import { partitionPlan } from "../packed-verification.mjs";
import { fullPlan, readPackages } from "../test-affected.mjs";

it("retains the published command inventory across independent feature checks", () => {
  const verified = new Set([...REQUIRED_COMMANDS, ...Object.values(FEATURE_REQUIRED_COMMANDS).flat()]);
  for (const command of ["run", "info", "serve", "chat", "workflows", "jobs", "assets", "models", "storage", "secrets", "settings", "mcp", "projects", "package", "packs", "runtime", "worker", "deploy", "agent", "db", "debug", "app", "apps", "validate", "timeline", "sketch", "game", "jsscript", "reliability", "node", "generate", "extension", "eval", "jtbd", "affected", "harness", "collections", "costs", "errors", "generations", "runs", "auth", "telegram", "help"]) {
    expect(verified.has(command), `No independent packed check owns ${command}`).toBe(true);
  }
});

it("explicitly composes every classic core family in the full regression consumer", () => {
  for (const id of ["core", "text", "data", "llm", "code"]) { expect(COMPOSED_SMOKE_PACK_IDS).toContain(id); }
  expect(new Set(COMPOSED_SMOKE_PACK_IDS).size).toBe(COMPOSED_SMOKE_PACK_IDS.length);
  expect(COMPOSED_SMOKE_PACK_IDS).not.toContain("cli-full");
});

it("checks missing FAL with only workflow admitted before installing FAL and the remaining command features", () => {
  const selected = new Set();
  const stages = [];
  const helpChecked = [];
  installSmokeCommandFeatures(args => {
    if (args[0] === "packs" && args[1] === "add") {
      selected.add(args[2]);
      stages.push(`install:${args[2]}`);
      return "";
    }
    if (args[0] === "packs" && args[1] === "list") {
      return JSON.stringify([...selected].map(id => ({ id, installed: true })));
    }
    expect(args).toEqual(["feature", expect.any(String), "--help"]);
    helpChecked.push(args[1]);
    return FEATURE_REQUIRED_COMMANDS[args[1]].map(command => `  ${command}    Command`).join("\n");
  }, {
    probeMissing: () => {
      expect([...selected]).toEqual(["cli-workflow"]);
      stages.push("missing-fal");
    },
    probeInstalled: () => {
      expect([...selected]).toEqual(["cli-workflow", "fal"]);
      stages.push("installed-fal");
    }
  });
  expect(stages.slice(0, 4)).toEqual(["install:cli-workflow", "missing-fal", "install:fal", "installed-fal"]);
  expect(new Set(helpChecked)).toEqual(new Set(Object.keys(FEATURE_REQUIRED_COMMANDS)));
  expect(helpChecked).toHaveLength(Object.keys(FEATURE_REQUIRED_COMMANDS).length);
});

const fixtures = [];
afterEach(() => { for (const root of fixtures.splice(0)) { rmSync(root, { recursive: true, force: true }); } });

it("keeps the required core-smoke status dependent on verification and the independent packed install", () => {
  const workflow = yaml.load(readFileSync(new URL("../../.github/workflows/packed-core-cli.yml", import.meta.url), "utf8"));
  const guard = workflow.jobs["core-smoke"];
  expect(guard.needs).toEqual(["verification-plan", "verification", "packed-install"]);
  expect(guard.if).toBe("always()");
  const scripts = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).scripts;
  const jobs = partitionPlan(fullPlan(), readPackages({}), scripts);
  const checks = jobs.flatMap(({ commands }) => commands).map(({ command, args }) => [command, ...args].join(" "));
  expect(workflow.jobs.verification.needs).toBe("verification-plan");
  expect(workflow.jobs.verification.strategy.matrix).toBe("${{ fromJSON(needs.verification-plan.outputs.matrix) }}");
  expect(workflow.jobs.verification.steps.map(step => step.run)).toContain('node scripts/packed-verification.mjs run "$RUNNER_TEMP/packed-verification.json" "$PACKED_TASK"');
  expect(jobs.filter(({ id }) => id.startsWith("test-packages-")).length).toBeGreaterThan(0);
  for (const command of ["npm run typecheck", "npm run lint", "npm run dev:nodetool -- harness gate --base origin/main --jobs 1", "npm run backend:smoke"]) {
    expect(checks).toContain(command);
  }
  expect(workflow.jobs["packed-install"].needs).toBeUndefined();
  expect(workflow.jobs["packed-install"].steps.find(step => step.uses === "./.github/actions/setup-build").with["extra-apt"]?.split(/\s+/)).toContain("libsecret-1-dev");
  const packedChecks = workflow.jobs["packed-install"].steps.map(step => step.run);
  expect(packedChecks).toContain("node scripts/publish-packages.mjs --pack-only --tarballs-dir .packed-artifacts");
  expect(packedChecks.indexOf("node scripts/publish-packages.mjs --pack-only --tarballs-dir .packed-artifacts")).toBeLessThan(packedChecks.indexOf("node scripts/smoke-packed-cli.mjs --core-only --tarballs-dir .packed-artifacts"));
  expect(packedChecks).toContain("node scripts/smoke-packed-cli.mjs --core-only --tarballs-dir .packed-artifacts");
  expect(packedChecks).toContain("node scripts/smoke-packed-cli.mjs --tarballs-dir .packed-artifacts");
  expect(packedChecks.indexOf("node scripts/smoke-packed-cli.mjs --tarballs-dir .packed-artifacts")).toBeGreaterThan(packedChecks.indexOf("node scripts/smoke-packed-cli.mjs --core-only --tarballs-dir .packed-artifacts"));
  for (const job of ["verification", "packed-install", "release-pins"]) {
    expect(workflow.jobs[job].steps.find(step => step.uses === "./.github/actions/setup-build").with.cache).toBe("read-only");
  }
  for (const planned of ["success", "failure", "cancelled", "skipped"]) {
    for (const verification of ["success", "failure", "cancelled", "skipped"]) {
      for (const installed of ["success", "failure", "cancelled", "skipped"]) {
        for (const qualityGate of ["false", "true"]) {
          const result = spawnSync("bash", ["-c", guard.steps[0].run], {
            env: { ...process.env, PLAN_RESULT: planned, VERIFICATION_RESULT: verification, PACKED_INSTALL_RESULT: installed, QUALITY_GATE_VERIFIES: qualityGate }
          });
          const verified = (planned === "success" && verification === "success")
            || (qualityGate === "true" && planned === "skipped" && verification === "skipped");
          expect(result.status, `${planned} ${verification} ${installed} ${qualityGate}`).toBe(installed === "success" && verified ? 0 : 1);
        }
      }
    }
  }
});

it("leaves verification to the Quality Gate only on pull requests into main", () => {
  const workflow = yaml.load(readFileSync(new URL("../../.github/workflows/packed-core-cli.yml", import.meta.url), "utf8"));
  expect(workflow.jobs["verification-plan"].if).toBe("github.event_name != 'pull_request' || github.base_ref != 'main'");
  expect(workflow.jobs.verification.needs).toBe("verification-plan");
  expect(workflow.jobs.verification.if).toBeUndefined();
  expect(workflow.jobs["core-smoke"].steps[0].env.QUALITY_GATE_VERIFIES)
    .toBe("${{ github.event_name == 'pull_request' && github.base_ref == 'main' }}");
  // The skip is safe only while Test runs on every pull request into main
  // and its Quality Gate runs each command verification would.
  const test = yaml.load(readFileSync(new URL("../../.github/workflows/test.yml", import.meta.url), "utf8"));
  expect(test.on.pull_request).toEqual({ branches: ["main"] });
  expect(test.jobs.quality.uses).toBe("./.github/workflows/quality-checks.yml");
  const quality = readFileSync(new URL("../../.github/workflows/quality-checks.yml", import.meta.url), "utf8");
  for (const command of ["npm run typecheck", "npm run lint", "npm run dev:nodetool -- harness gate --base", "npm run backend:smoke", "npm run test:scripts", "npx turbo run test"]) {
    expect(quality, command).toContain(command);
  }
});

it("prepares sandboxed Chromium before packed verification runs browser suites", () => {
  const workflow = yaml.load(readFileSync(new URL("../../.github/workflows/packed-core-cli.yml", import.meta.url), "utf8"));
  const steps = workflow.jobs.verification.steps;
  const affectedIndex = steps.findIndex(step => step.name === "Run the selected verification bucket");
  const installIndex = steps.findIndex(step => step.run === "npx playwright install --with-deps chromium");
  const sandboxIndex = steps.findIndex(step => step.name === "Enable and verify the Chromium sandbox");
  expect(affectedIndex).toBeGreaterThan(0);
  expect(installIndex).toBeGreaterThanOrEqual(0);
  expect(sandboxIndex).toBeGreaterThan(installIndex);
  expect(affectedIndex).toBeGreaterThan(sandboxIndex);
  expect(steps[sandboxIndex].run).toContain("chromiumSandbox: true");
  expect(steps[sandboxIndex].run).toContain("sudo apparmor_parser -r");
  const mobileIndex = steps.findIndex(step => step.run === "npm --prefix mobile ci");
  expect(mobileIndex).toBeGreaterThanOrEqual(0);
  expect(mobileIndex).toBeLessThan(affectedIndex);
  expect(steps.find(step => step.uses === "./.github/actions/setup-build").with["extra-apt"]).toBe("mesa-vulkan-drivers");
});

it("bounds verification test concurrency without changing build scheduling", () => {
  const workflow = yaml.load(readFileSync(new URL("../../.github/workflows/packed-core-cli.yml", import.meta.url), "utf8"));
  const job = workflow.jobs.verification;
  expect(job.env?.NODETOOL_TURBO_CONCURRENCY).toBeUndefined();
  const affected = job.steps.find(step => step.name === "Run the selected verification bucket");
  expect(affected.env).toMatchObject({ NODETOOL_TURBO_CONCURRENCY: "1", NODETOOL_TEST_WORKERS: "1" });
  const scripts = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).scripts;
  const fixed = partitionPlan(fullPlan(), readPackages({}), scripts).find(({ id }) => id === "fixed-checks");
  const harness = fixed.commands.find(({ label }) => label === "harnesses");
  expect([harness.command, ...harness.args].join(" ")).toBe("npm run dev:nodetool -- harness gate --base origin/main --jobs 1");
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

it.skipIf(process.platform === "win32")("launches MCP and server probes from the installed consumer directory", async () => {
  const root = mkdtempSync(join(tmpdir(), "packed-probes-"));
  const consumer = join(root, "consumer");
  mkdirSync(consumer);
  const bin = join(root, "fake-cli");
  const trace = join(root, "cwd.jsonl");
  writeFileSync(bin, `#!${process.execPath}\nimport { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createServer } from 'node:http';
appendFileSync(process.env.PROBE_TRACE, JSON.stringify(process.cwd()) + '\\n');
if (process.argv[2] === 'mcp') createInterface({ input: process.stdin }).on('line', line => {
const msg = JSON.parse(line); if (!msg.id) return;
console.log(JSON.stringify({ jsonrpc:'2.0', id:msg.id, result: msg.id === 2 ? {tools:[{name:'fixture'}]} : {} }));
});
else createServer((req,res) => {res.end('ok');}).listen(Number(process.argv[4]), '127.0.0.1');`, { mode: 0o755 });
  try {
    const env = { ...process.env, PROBE_TRACE: trace };
    expect(await probeMcp(bin, env, consumer, undefined, 5000)).toBe(1);
    await probeServe(bin, env, consumer, 5000);
    expect(readFileSync(trace, "utf8").trim().split("\n").map(JSON.parse)).toEqual([consumer, consumer]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("missingCommands", () => {
  it("finds commands only at the command-list indent", () => {
    const help = [
      "Commands:",
      ...REQUIRED_COMMANDS.filter(name => name !== "run").map(name => `  ${name} [options]    Description`),
      "    run             (an option description, not a command)"
    ].join("\n");
    expect(missingCommands(help)).toEqual(["run"]);
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
  writeFileSync(join(dir, "index.js"), "export {};");
  return dir;
}

function appFixture(dependencies = {}) {
  const root = mkdtempSync(join(tmpdir(), "nodetool-core-guard-"));
  fixtures.push(root);
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "core-guard-fixture", version: "1.0.0", private: true, dependencies }));
  return root;
}

describe("core-only contamination guard", () => {
  it("rejects an empty audit and accepts a tree containing executable core packages", () => {
    const app = appFixture();
    expect(() => assertCoreOnlyInstall(app)).toThrow("inspected no installed packages");
    installFixture(app, "@nodetool-ai/nodes-core");
    expect(assertCoreOnlyInstall(app)).toBe(1);
  });

  it.each(["@nodetool-ai/fal-nodes", "@nodetool-ai/base-nodes", "@nodetool-ai/game-renderer", "sharp", "@napi-rs/canvas", "@dimforge/rapier3d-compat"])("fails when %s is deliberately installed as a nested dependency", name => {
    const app = appFixture();
    installFixture(app, "@nodetool-ai/nodes-core");
    const nested = installFixture(app, name, {}, "node_modules/@nodetool-ai/nodes-core/node_modules");
    expect(installedPackages(join(app, "node_modules")).map(entry => entry.manifest.name)).toContain(name);
    expect(() => assertCoreOnlyInstall(app)).toThrow(name);
    expect(() => assertCoreOnlyInstall(app)).toThrow(nested);
  });

  it("rejects a deliberately installed pack tarball", () => {
    const app = appFixture();
    const tarball = releaseTarball(app, "fal.tgz", "@nodetool-ai/fal-nodes", "1.2.3");
    const installed = spawnSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", `file:${tarball}`], { cwd: app, encoding: "utf8", timeout: 30000 });
    expect(installed.status, installed.stderr).toBe(0);
    expect(() => assertCoreOnlyInstall(app)).toThrow("@nodetool-ai/fal-nodes");
  });

  it.each(["esbuild", "typescript", "react", "ink", "@nodetool-ai/cli-full", "@nodetool-ai/runtime", "@nodetool-ai/agents"])("rejects full-only dependency %s even when another package requires it", name => {
    const app = appFixture();
    installFixture(app, "@nodetool-ai/nodes-core");
    installFixture(app, "fixture-dependent", { dependencies: { [name]: "*" } });
    installFixture(app, name);
    expect(() => assertCoreOnlyInstall(app)).toThrow();
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
  }, 30_000);

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

describe("core install size budget", () => {
  it("accepts valid measurements through the exact limit", () => {
    expect(assertCoreInstallSize("123\tnode_modules\n", 124)).toBe(123);
    expect(assertCoreInstallSize("123 node_modules", 123)).toBe(123);
    expect(() => assertCoreInstallSize("124\tnode_modules", 123)).toThrow(/124 KiB.*123 KiB/);
    expect(assertCoreInstallSize(`${Number.MAX_SAFE_INTEGER}\tnode_modules`, Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });
  it.each([undefined, null, 1, ["1 node_modules"], { toString: () => "1 node_modules" }, "", "0 node_modules", "-1 node_modules", "1.5 node_modules", "9007199254740992 node_modules", "12 other", "12 node_modules extra", "12 node_modules\n13 node_modules"])("rejects invalid measurement %j", measurement => {
    expect(() => assertCoreInstallSize(measurement, 123)).toThrow(/Invalid core install disk usage/);
  });
  it.each([undefined, null, "123", 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid KiB budget %j", limit => {
    expect(() => assertCoreInstallSize("1 node_modules", limit)).toThrow(/positive safe integer/);
  });
  it.runIf(process.platform !== "win32")("rejects a real oversized du measurement", () => {
    const root = appFixture(); const modules = join(root, "node_modules"); mkdirSync(modules);
    writeFileSync(join(modules, "fixture.bin"), Buffer.alloc(16 * 1024, 1));
    const measured = spawnSync("du", ["-sk", "node_modules"], { cwd: root, encoding: "utf8" });
    expect(measured.status, measured.stderr).toBe(0); expect(measured.error).toBeUndefined();
    expect(() => assertCoreInstallSize(measured.stdout, 1)).toThrow(/exceeding the 1 KiB limit/);
    const value = Number(measured.stdout.split(/\s+/)[0]);
    expect(assertCoreInstallSize(measured.stdout, value)).toBe(value);
  });
});

it("requires original pinned artifacts before attempting installation", () => {
  const result = spawnSync(process.execPath, [resolve(import.meta.dirname, "../smoke-packed-cli.mjs")], { encoding: "utf8" });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("--tarballs-dir is required");
});

it("rejects a full smoke selection with a missing pack or required runtime", () => {
  const rows = [{id:"fal",installed:true}, {id:"image",installed:false}, {id:"imaging",kind:"runtime-library",installed:false,requiredBy:["image"]}];
  expect(() => assertInstalledSelection(JSON.stringify(rows), ["fal", "image"])).toThrow("image");
  rows[1].installed = true;
  expect(() => assertInstalledSelection(JSON.stringify(rows), ["fal", "image"])).toThrow("imaging");
  rows[2].installed = true;
  expect(() => assertInstalledSelection(JSON.stringify(rows), ["fal", "image"])).not.toThrow();
});
