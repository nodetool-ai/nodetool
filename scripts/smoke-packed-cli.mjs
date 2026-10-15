#!/usr/bin/env node
/** Install original release artifacts and exercise real core and optional pack consumers. */

import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { NODE_PACKS, RUNTIME_LIBRARIES } from "./node-catalog/tiers.mjs";

import { startPackedRegistry, artifactIntegrity } from "./packed-registry.mjs";
import { runFalFixture } from "./packed-fal-fixture.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const PACKAGE_ROOTS = ["packages", "reliability"];
const CLI_NAME = "@nodetool-ai/cli";
export const CORE_INSTALL_BUDGET_KIB = 892_097;
export const REQUIRED_COMMANDS = [
  "run", "info", "serve", "chat", "workflows", "jobs", "assets", "models", "storage",
  "secrets", "settings", "mcp", "projects", "package", "packs", "runtime", "worker",
  "deploy", "agent", "db", "debug", "app", "apps", "validate", "timeline", "sketch",
  "game", "jsscript", "reliability", "node", "generate", "extension", "eval", "jtbd",
  "affected", "harness", "collections", "costs", "errors", "generations", "runs", "auth",
  "telegram", "help"
];
const NO_MODEL_WORKFLOW = "examples/workflows/hello_input_output_cli.json";

/** Every public package under PACKAGE_ROOTS, as { name, version, dir }. */
function publicPackages() {
  const found = [];
  for (const root of PACKAGE_ROOTS) {
    const rootDir = resolve(ROOT, root);
    if (!existsSync(rootDir)) continue;
    for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = resolve(rootDir, entry.name);
      const manifest = resolve(dir, "package.json");
      if (!existsSync(manifest)) continue;
      const pkg = JSON.parse(readFileSync(manifest, "utf8"));
      if (pkg.private || !pkg.name || !pkg.version) continue;
      found.push({ name: pkg.name, version: pkg.version, dir });
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

const EXCLUDED_PACKAGES = new Set(["@nodetool-ai/base-nodes", ...NODE_PACKS.flatMap(pack => [pack.npmName, ...pack.provides])]);

export function assertInstalledSelection(output, selected) {
  const rows = JSON.parse(output);
  if (!Array.isArray(rows) || selected.length === 0) { throw new Error("Pack selection audit requires installed rows and selected packs"); }
  for (const id of selected) {
    if (!rows.some(row => row.id === id && row.installed === true)) { throw new Error(`Selected pack was not installed: ${id}`); }
  }
  for (const row of rows) {
    if (row.kind === "runtime-library" && row.requiredBy.some(id => selected.includes(id)) && !row.installed) { throw new Error(`Required runtime was not installed: ${row.id}`); }
  }
}

function assertDesiredSelection(env, root, selected) {
  const data = process.platform === "win32" ? join(env.HOME, "AppData", "Roaming") : env.XDG_DATA_HOME;
  const state = JSON.parse(readFileSync(join(data, "nodetool", "cli-packs.json"), "utf8"))[realpathSync(root)];
  if (!state || state.dirty || selected.some(id => !state.packs.includes(id))) { throw new Error("Installed selection was not persisted as clean desired state"); }
}

export function assertCoreInstallSize(diskUsage, maxKiB) {
  if (!Number.isSafeInteger(maxKiB) || maxKiB <= 0) { throw new Error("Core install size limit must be a positive safe integer in KiB"); }
  const match = typeof diskUsage === "string" ? /^([1-9]\d*)\s+node_modules\r?\n?$/.exec(diskUsage) : null;
  const measuredKiB = match ? Number(match[1]) : NaN;
  if (!Number.isSafeInteger(measuredKiB) || measuredKiB <= 0) { throw new Error(`Invalid core install disk usage: ${JSON.stringify(diskUsage)}`); }
  if (measuredKiB > maxKiB) { throw new Error(`Core install uses ${measuredKiB} KiB, exceeding the ${maxKiB} KiB limit`); }
  return measuredKiB;
}

/** Enumerate installed manifests, including nested and scoped packages. */
export function installedPackages(root) {
  const packages = [];
  const pending = [root];
  const visited = new Set();
  while (pending.length > 0) {
    const modules = pending.pop();
    if (!existsSync(modules)) { continue; }
    const actual = realpathSync(modules);
    if (visited.has(actual)) { continue; }
    visited.add(actual);
    for (const entry of readdirSync(modules, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) { continue; }
      const dir = join(modules, entry.name);
      if (entry.name.startsWith("@")) { pending.push(dir); continue; }
      const manifest = join(dir, "package.json");
      if (!existsSync(manifest)) { continue; }
      const name = basename(modules).startsWith("@") ? `${basename(modules)}/${entry.name}` : entry.name;
      packages.push({ name, dir: realpathSync(dir), manifest: JSON.parse(readFileSync(manifest, "utf8")) });
      pending.push(join(dir, "node_modules"));
    }
  }
  return packages;
}

/** Reject accidental packs and optional runtimes anywhere in the clean tree. */
export function assertCoreOnlyInstall(appDir) {
  const packages = installedPackages(join(appDir, "node_modules"));
  if (packages.length === 0) { throw new Error("Core-only guard inspected no installed packages"); }
  const forbiddenRuntime = new Set(RUNTIME_LIBRARIES.flatMap(library => library.packages).filter(name => name !== "esbuild" && name !== "typescript"));
  const contamination = packages.filter(({ name, manifest }) => EXCLUDED_PACKAGES.has(name) || EXCLUDED_PACKAGES.has(manifest.name) || forbiddenRuntime.has(name) || forbiddenRuntime.has(manifest.name));
  if (contamination.length > 0) {
    throw new Error(`Core-only install contains excluded packages: ${contamination.map(({ manifest, dir }) => `${manifest.name} (${dir})`).join(", ")}`);
  }
  for (const [compiler, dependentNames, field] of [
    ["esbuild", ["tsx"], "dependencies"],
    ["typescript", ["@trpc/client", "@trpc/server"], "peerDependencies"]
  ]) {
    const copies = packages.filter(({ name, manifest }) => name === compiler || manifest.name === compiler || (compiler === "typescript" && manifest.name === "@typescript/typescript6"));
    if (copies.length === 0) { continue; }
    const dependents = packages.filter(({ manifest }) => dependentNames.includes(manifest.name));
    const permitted = new Set();
    const requiredAliases = new Set();
    for (const { manifest, dir } of dependents) {
      if (!manifest[field]?.[compiler]) { throw new Error(`${manifest.name} does not declare its ${compiler} requirement`); }
      const requireFromDependent = createRequire(join(dir, "package.json"));
      permitted.add(realpathSync(join(requireFromDependent.resolve(`${compiler}/package.json`), "..")));
    }
    if (compiler === "typescript") {
      for (const { manifest, dir } of copies) {
        if (!permitted.has(dir) || manifest.name !== "@typescript/typescript6" || !manifest.dependencies?.["@typescript/old"]?.startsWith("npm:typescript@")) { continue; }
        const requireFromWrapper = createRequire(join(dir, "package.json"));
        permitted.add(realpathSync(join(requireFromWrapper.resolve("@typescript/old/package.json"), "..")));
        requiredAliases.add("@typescript/old");
      }
    }
    if (copies.some(({ dir }) => !permitted.has(dir))) { throw new Error(`${compiler} is installed outside its required core dependency closure`); }
    // npm validates every installed copy against the dependents' declared semver ranges.
    run("npm", ["ls", "--all", "--json", compiler], { cwd: appDir });
    for (const alias of requiredAliases) {
      run("npm", ["ls", "--all", "--json", alias], { cwd: appDir });
    }
  }
  return packages.length;
}

/** Decode through the agents bootstrap and the same installed Mediabunny instance. */
export function codecProbeSource(fixture) {
  return `
import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const rootRequire = createRequire(join(process.cwd(), 'package.json'));
const agentsEntry = rootRequire.resolve('@nodetool-ai/agents');
const agentsRequire = createRequire(agentsEntry);
const serverRequire = createRequire(agentsRequire.resolve('@mediabunny/server'));
assert.equal(realpathSync(agentsRequire.resolve('mediabunny')), realpathSync(serverRequire.resolve('mediabunny')));
assert.equal(realpathSync(rootRequire.resolve('mediabunny')), realpathSync(agentsRequire.resolve('mediabunny')));
const { ensureCodecs, inputFrom } = await import(pathToFileURL(join(dirname(agentsEntry), 'analysis', 'mediabunny-runtime.js')).href);
const { AudioSampleSink, VideoSampleSink } = await import('mediabunny');
await ensureCodecs();
const input = inputFrom(new Uint8Array(readFileSync(${JSON.stringify(fixture)})));
try {
  const audioTrack = await input.getPrimaryAudioTrack();
  const videoTrack = await input.getPrimaryVideoTrack();
  assert.ok(audioTrack);
  assert.ok(videoTrack);
  const audio = await new AudioSampleSink(audioTrack).getSample(0);
  const video = await new VideoSampleSink(videoTrack).getSample(0);
  assert.ok(audio);
  assert.ok(video);
  try {
    assert.equal(audio.numberOfFrames, 1024);
    assert.equal(audio.numberOfChannels, 1);
    assert.equal(video.displayWidth, 64);
    assert.equal(video.displayHeight, 48);
    const pixels = new Uint8Array(64 * 48 * 4);
    await video.copyTo(pixels, { format: 'RGBA' });
    assert.ok(pixels.some(value => value !== 0));
  } finally { audio.close(); video.close(); }
} finally { input.dispose(); }
console.log('ok  packed Mediabunny decodes 1024 audio samples and a 64x48 video frame');
`;
}

/** Commands from REQUIRED_COMMANDS that `help` does not list. */
export function missingCommands(help) {
  return REQUIRED_COMMANDS.filter(
    (cmd) => !new RegExp(`^  ${cmd}( |$)`, "m").test(help)
  );
}

/**
 * Environment for a first run on a clean machine: an empty HOME and XDG
 * dirs, no NodeTool or provider variables, and no desktop session, so the
 * keychain is unreachable the way it is in a container.
 */
export function cleanEnv(home, base = process.env) {
  const keep = ["PATH", "TMPDIR", "LANG", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE"];
  const env = {};
  for (const key of keep) {
    if (base[key] !== undefined) env[key] = base[key];
  }
  return {
    ...env,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_DATA_HOME: join(home, ".local", "share"),
    XDG_CACHE_HOME: join(home, ".cache"),
    CI: "1"
  };
}

function run(cmd, args, opts) {
  const res = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  if (res.status !== 0) {
    const out = `${res.stdout ?? ""}${res.stderr ?? ""}`.trim();
    throw new Error(`${cmd} ${args.join(" ")} exited ${res.status}\n${out}`);
  }
  return res.stdout;
}

export function pack(packages, dest) {
  const tarballs = {};
  for (const { name, dir } of packages) {
    const out = run(
      "npm",
      ["pack", "--json", "--ignore-scripts", "--pack-destination", dest],
      { cwd: dir }
    );
    const [info] = JSON.parse(out);
    tarballs[name] = join(dest, info.filename);
  }
  return tarballs;
}

/** Reuse the exact release tarballs rather than packing the workspaces again. */
export function existingTarballs(packages, directory) {
  const expected = new Map(packages.map((pkg) => [pkg.name, pkg.version]));
  const tarballs = {};
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".tgz")) { continue; }
    const file = resolve(directory, entry.name);
    const manifest = JSON.parse(run("tar", ["-xOf", file, "package/package.json"], {}));
    if (!expected.has(manifest.name)) { continue; }
    if (manifest.version !== expected.get(manifest.name)) {
      throw new Error(`${manifest.name} tarball version ${manifest.version} differs from workspace ${expected.get(manifest.name)}`);
    }
    if (tarballs[manifest.name]) { throw new Error(`Duplicate tarball for ${manifest.name}`); }
    tarballs[manifest.name] = file;
  }
  const missing = [...expected.keys()].filter((name) => !tarballs[name]);
  if (missing.length > 0) { throw new Error(`Missing release tarballs: ${missing.join(", ")}`); }
  return tarballs;
}

export function mcpWorkflowCode(graph) {
  return `import { create_workflow, run_workflow } from "@nodetool-ai/sandbox-nodetool/workflows";
const created = await create_workflow({ name: "Packed MCP smoke", graph: ${JSON.stringify(graph)} });
if (created.error || !created.id) { throw new Error(JSON.stringify(created)); }
const result = await run_workflow({ workflow_id: created.id, params: { text: "packed MCP smoke" } });
if (result.error || result.status === "failed") { throw new Error(JSON.stringify(result)); }
return result;`;
}

export function missingFalGraph(properties = {}) {
  return { nodes: [{ id: "fal", type: "fal.audio_to_audio.AudioUnderstanding", properties }], edges: [] };
}

/**
 * Start `nodetool mcp serve`, send initialize and tools/list over stdio, and
 * resolve with the tool count. Stdout is newline-delimited JSON-RPC.
 */
export async function probeMcp(bin, env, cwd, workflow, timeoutMs = 120_000, launchArgs = []) {
  const port = await freePort();
  return new Promise((resolvePromise, reject) => {
    const child = spawn(bin, [...launchArgs, "mcp", "serve"], { env: { ...env, PORT: String(port) }, cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let listedTools = 0;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`mcp serve did not answer within ${timeoutMs}ms\n${stderr}`));
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    const send = (msg) => child.stdin.write(`${JSON.stringify(msg)}\n`);
    child.stderr.on("data", (d) => (stderr += d));
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`mcp serve exited ${code} before listing tools\n${stderr}`));
    });
    child.stdout.on("data", (d) => {
      stdout += d;
      let nl;
      while ((nl = stdout.indexOf("\n")) >= 0) {
        const line = stdout.slice(0, nl).trim();
        stdout = stdout.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line);
        if (msg.id === 1) {
          send({ jsonrpc: "2.0", method: "notifications/initialized" });
          send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
        } else if (msg.id === 2) {
          listedTools = msg.result?.tools?.length ?? 0;
          if (msg.error) {
            clearTimeout(timer);
            child.kill();
            reject(new Error(`tools/list failed: ${JSON.stringify(msg.error)}`));
          } else if (workflow) {
            if (!msg.result.tools.some(tool => tool.name === "execute_code")) {
              clearTimeout(timer);
              child.kill();
              reject(new Error("MCP did not expose execute_code"));
              return;
            }
            send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: {
              name: "execute_code", arguments: { title: "Run a core-only smoke workflow", code: mcpWorkflowCode(workflow) }
            } });
          } else {
            clearTimeout(timer);
            child.removeAllListeners("exit");
            child.kill();
            resolvePromise(msg.result.tools.length);
          }
        } else if (msg.id === 3) {
          clearTimeout(timer);
          child.removeAllListeners("exit");
          child.kill();
          const text = (msg.result?.content ?? []).filter(item => item.type === "text").map(item => item.text).join("\n");
          if (msg.error || msg.result?.isError || !text.includes("packed MCP smoke")) {
            reject(new Error(`MCP execute_code did not run the core workflow: ${JSON.stringify(msg)}`));
          } else {
            const outcome = JSON.parse(text);
            if (outcome.ok !== true) { reject(new Error(`MCP code action failed: ${text}`)); }
            else { resolvePromise(listedTools); }
          }
        }
      }
    });
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "nodetool-packed-smoke", version: "1" }
      }
    });
  });
}

/** A TCP port nothing is listening on right now. */
function freePort() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolvePromise(port));
    });
  });
}

/**
 * Start `nodetool serve` and resolve once `GET /health` answers 200. The
 * server is killed either way.
 */
export async function probeServe(bin, env, cwd, timeoutMs = 120_000) {
  const port = await freePort();
  // `serve` runs the server as a child process, so start a process group
  // and kill the whole group, or the server outlives the check.
  const child = spawn(bin, ["serve", "--port", String(port)], {
    env,
    cwd,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  let exitCode = null;
  child.on("exit", (code) => (exitCode = code ?? -1));
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      if (exitCode !== null) {
        throw new Error(`nodetool serve exited ${exitCode} before /health answered\n${output}`);
      }
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        if (res.ok) return port;
      } catch {
        // not listening yet
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`nodetool serve did not answer /health within ${timeoutMs}ms\n${output}`);
  } finally {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // the group already exited
    }
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      keep: { type: "boolean", default: false },
      "work-dir": { type: "string" },
      "tarballs-dir": { type: "string" },
      "core-only": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false }
    }
  });
  if (values.help) {
    console.log(`Usage: node scripts/smoke-packed-cli.mjs [--keep] [--work-dir <dir>] --tarballs-dir <dir> [--core-only]

Installs ${CLI_NAME} from original pinned release tarballs into isolated
project and global consumers, each with an empty HOME.

  --core-only       Exercise the core and install only FAL after the core checks
  --keep            Keep the work directory for inspection
  --work-dir <dir>  Use this directory instead of a new temp directory
  --tarballs-dir <dir>  Reuse release tarballs, checking workspace names and versions`);
    return;
  }

  if (!values["tarballs-dir"]) { throw new Error("--tarballs-dir is required. Prepare pinned artifacts with publish-packages.mjs --pack-only first."); }

  const work = values["work-dir"]
    ? resolve(values["work-dir"])
    : mkdtempSync(join(tmpdir(), "nodetool-packed-"));
  const appDir = join(work, "app");
  const home = join(work, "home");
  for (const d of [appDir, home]) mkdirSync(d, { recursive: true });

  let registry;
  let hashes;
  try {
    const packages = publicPackages();
    const cli = packages.find((p) => p.name === CLI_NAME);
    if (!cli) throw new Error(`${CLI_NAME} is not a public workspace`);

    const tarballs = existingTarballs(packages, resolve(values["tarballs-dir"]));
    hashes = Object.entries(tarballs).map(([name, file]) => ({ name, file, integrity: artifactIntegrity(file) }));
    registry = await startPackedRegistry(tarballs);
    writeFileSync(join(home, ".npmrc"), `registry=${registry.url}\ncache=${join(work, "npm-cache")}\n`);
    const env = { ...cleanEnv(home), SECRETS_MASTER_KEY: randomBytes(32).toString("base64") };
    writeFileSync(join(appDir, "package.json"), JSON.stringify({ name: "nodetool-packed-smoke", private: true }));
    run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error", `${CLI_NAME}@${cli.version}`], { cwd: appDir, env });
    {
      const inspected = assertCoreOnlyInstall(appDir);
      console.log(`ok  core-only guard inspected ${inspected} installed packages`);
      run(process.execPath, ["--input-type=module", "-e", 'await import("@nodetool-ai/dsl");'], { cwd: appDir, timeout: 120_000 });
      console.log("ok  the packed DSL imports without node packs");
    }
    const diskUsage = run("du", ["-sk", "node_modules"], { cwd: appDir }).trim();
    console.log(`Packed CLI disk usage (KiB): ${diskUsage}`);
    if (process.platform === "linux" && process.arch === "x64") {
      const measuredKib = assertCoreInstallSize(diskUsage, CORE_INSTALL_BUDGET_KIB);
      console.log(`ok  core-only size ${measuredKib} KiB <= ${CORE_INSTALL_BUDGET_KIB} KiB`);
    }

    const bin = join(appDir, "node_modules", ".bin", "nodetool");
    const cliOptions = { env, cwd: appDir, timeout: 120_000 };

    const version = run(bin, ["--version"], cliOptions).trim();
    if (version !== cli.version) {
      throw new Error(`nodetool --version printed '${version}', expected '${cli.version}'`);
    }
    console.log(`ok  nodetool --version = ${version}`);

    const missing = missingCommands(run(bin, ["--help"], cliOptions));
    if (missing.length > 0) {
      throw new Error(`nodetool --help is missing: ${missing.join(", ")}`);
    }
    console.log(`ok  nodetool --help lists ${REQUIRED_COMMANDS.join(", ")}`);

    const coreWorkflow = JSON.parse(readFileSync(join(ROOT, NO_MODEL_WORKFLOW), "utf8")).graph;
    const tools = await probeMcp(bin, env, appDir, coreWorkflow);
    if (tools === 0) throw new Error("nodetool mcp serve listed no tools");
    console.log(`ok  nodetool mcp serve lists tools${coreWorkflow ? " and runs a core workflow through execute_code" : ` (${tools})`}`);

    const workflowFixture = join(appDir, "hello_input_output_cli.json");
    writeFileSync(workflowFixture, readFileSync(join(ROOT, NO_MODEL_WORKFLOW)));
    const out = run(
      bin,
      [
        "workflows",
        "run",
        workflowFixture,
        "--params",
        JSON.stringify({ text: "packed smoke" }),
        "--json"
      ],
      cliOptions
    );
    if (!out.includes("packed smoke")) {
      throw new Error(`nodetool workflows run did not echo its input:\n${out}`);
    }
    console.log("ok  nodetool workflows run executes a no-model workflow");

    const dslDir = join(appDir, "examples", "workflows");
    mkdirSync(dslDir, { recursive: true });
    for (const filename of ["package.json", "concat_text.ts"]) {
      writeFileSync(join(dslDir, filename), readFileSync(join(ROOT, "examples", "workflows", filename)));
    }
    const dslOutput = run(bin, ["run", join(dslDir, "concat_text.ts"), "--json"], cliOptions);
    if (!dslOutput.includes("Hello, NodeTool!")) {
      throw new Error(`nodetool run did not execute the TypeScript workflow:\n${dslOutput}`);
    }
    console.log("ok  nodetool run executes a TypeScript workflow without downloads");

    {
      const falFixture = join(appDir, "missing-fal.json");
      writeFileSync(falFixture, JSON.stringify({ graph: missingFalGraph() }));
      const validated = spawnSync(bin, ["validate", falFixture, "--json"], { encoding: "utf8", ...cliOptions });
      if (validated.status !== 1) { throw new Error(`Missing FAL validation exited ${validated.status}: ${validated.stdout}${validated.stderr}`); }
      const report = JSON.parse(validated.stdout).report;
      if (!report.issues.some(issue => issue.code === "pack_not_installed") || !report.issues.some(issue => issue.code === "property")) {
        throw new Error(`Missing FAL validation omitted availability or property issues: ${validated.stdout}`);
      }
      const failed = spawnSync(bin, ["workflows", "run", falFixture, "--json"], { encoding: "utf8", ...cliOptions });
      const missingPack = JSON.parse(failed.stdout);
      if (failed.status !== 3 || missingPack.error !== "missing_pack" || !missingPack.packs.some(pack => pack.id === "fal")) {
        throw new Error(`Missing FAL execution must return missing_pack and exit 3: ${failed.stdout}${failed.stderr}`);
      }
      writeFileSync(falFixture, JSON.stringify({ graph: missingFalGraph({ audio: { type: "audio", data: "AA==" } }) }));
      const installOnly = spawnSync(bin, ["validate", falFixture, "--json"], { encoding: "utf8", ...cliOptions });
      const installReport = JSON.parse(installOnly.stdout).report;
      if (installOnly.status !== 3 || !installReport.issues.some(issue => issue.code === "pack_not_installed") || installReport.issues.some(issue => issue.severity === "error" && issue.code !== "pack_not_installed")) {
        throw new Error(`Missing-pack-only validation must exit 3: ${installOnly.stdout}${installOnly.stderr}`);
      }
      console.log("ok  missing FAL validates properties and fails execution with the pack name");
    }

    const codecFixture = join(appDir, "codec-identity.mp4");
    copyFileSync(join(ROOT, "scripts", "fixtures", "codec-identity.mp4"), codecFixture);
    console.log(run(process.execPath, ["--input-type=module", "-e", codecProbeSource(codecFixture)], { env, cwd: appDir, timeout: 120_000 }).trim());

    await probeServe(bin, env, appDir);
    console.log("ok  nodetool serve answers /health");

    const selectedPacks = values["core-only"] ? ["fal"] : NODE_PACKS.map(pack => pack.id);
    run(bin, ["packs", "add", ...selectedPacks, "--yes"], { ...cliOptions, timeout: 900_000 });
    assertInstalledSelection(run(bin, ["packs", "list", "--json"], cliOptions), selectedPacks);
    assertDesiredSelection(env, appDir, selectedPacks);
    run(bin, ["packs", "doctor", "--installed", "--json"], cliOptions);
    runFalFixture(realpathSync(bin), appDir, env, run);
    console.log(`ok  actual packs add installed ${selectedPacks.join(", ")} and FAL workflow completed`);

    const prefix = join(work, "global");
    const globalHome = join(work, "global-home");
    const globalCwd = join(work, "global-consumer");
    for (const directory of [globalHome, globalCwd]) { mkdirSync(directory, { recursive: true }); }
    writeFileSync(join(globalHome, ".npmrc"), `registry=${registry.url}\nprefix=${prefix}\ncache=${join(work, "npm-cache")}\n`);
    const globalEnv = { ...cleanEnv(globalHome), SECRETS_MASTER_KEY: randomBytes(32).toString("base64") };
    run("npm", ["install", "--global", "--prefix", prefix, "--no-audit", "--no-fund", `${CLI_NAME}@${cli.version}`], { cwd: globalCwd, env: globalEnv, timeout: 900_000 });
    const globalRoot = join(prefix, process.platform === "win32" ? "node_modules" : "lib/node_modules", "@nodetool-ai/cli");
    assertCoreOnlyInstall(globalRoot);
    if (process.platform === "linux" && process.arch === "x64") {
      assertCoreInstallSize(run("du", ["-sk", "node_modules"], { cwd: process.platform === "win32" ? prefix : join(prefix, "lib") }), CORE_INSTALL_BUDGET_KIB);
    }
    const globalEntry = join(globalRoot, "dist/nodetool.js");
    const globalOptions = { cwd: globalCwd, env: globalEnv, timeout: 900_000 };
    if (run(process.execPath, [globalEntry, "--version"], globalOptions).trim() !== cli.version) { throw new Error("Global CLI version differs"); }
    run(process.execPath, [globalEntry, "packs", "add", ...selectedPacks, "--yes"], globalOptions);
    assertInstalledSelection(run(process.execPath, [globalEntry, "packs", "list", "--json"], globalOptions), selectedPacks);
    assertDesiredSelection(globalEnv, globalRoot, selectedPacks);
    run(process.execPath, [globalEntry, "packs", "doctor", "--installed", "--json"], globalOptions);
    runFalFixture(globalEntry, globalCwd, globalEnv, run);
    console.log("ok  global packed CLI installs packs and executes the FAL workflow");


  } finally {
    await registry?.close();
    for (const artifact of hashes ?? []) {
      if (artifactIntegrity(artifact.file) !== artifact.integrity) { throw new Error(`Original artifact changed: ${artifact.name}`); }
    }
    if (values.keep || values["work-dir"]) {
      console.log(`Work directory kept at ${work}`);
    } else {
      rmSync(work, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`\nPacked CLI smoke failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
