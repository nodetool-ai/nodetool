#!/usr/bin/env node
/**
 * Install `@nodetool-ai/cli` from packed tarballs and check that it runs the
 * way an agent uses it on a clean machine: no repository, no `.env`, no
 * keychain, no provider keys. A fresh test-only master key keeps secret-store
 * initialization independent of the host keychain.
 *
 * By default every public workspace is packed with `npm pack`. Pass
 * `--tarballs-dir` to reuse the release tarballs. A throwaway project
 * depends on the CLI tarball, and `overrides` point every other workspace
 * name at its tarball, so npm resolves the whole tree the way the registry
 * would after a complete publish, without touching the registry for our own
 * packages. Run it after `prepare-publish.mjs` and before `npm publish`: a
 * failure here means the release would not install or start.
 *
 * Checks, each against an empty HOME:
 *   1. `nodetool --version` prints the workspace version.
 *   2. `nodetool --help` lists the agent harness commands.
 *   3. `nodetool mcp serve` answers initialize and lists tools. Core-only also
 *      runs a core workflow through execute_code.
 *   4. JSON and TypeScript DSL workflows run without calling a model.
 *   5. Mediabunny decodes the checked-in audio/video fixture.
 *   6. `nodetool serve` answers `GET /health`.
 * Core-only additionally imports the DSL, validates a missing FAL node's
 * properties, checks its run fails, and rejects excluded installed packages.
 *
 * Usage:
 *   node scripts/smoke-packed-cli.mjs [--keep] [--work-dir <dir>] [--tarballs-dir <dir>] [--core-only]
 */

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
import { CORE_PACKAGES, NODE_PACKS, RUNTIME_LIBRARIES } from "./node-catalog/tiers.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const PACKAGE_ROOTS = ["packages", "reliability"];
const CLI_NAME = "@nodetool-ai/cli";
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

/**
 * The throwaway project manifest: depend on the CLI tarball, and override
 * every other workspace name with its tarball. npm refuses an override that
 * conflicts with a direct dependency, so the CLI is not overridden.
 */
export function smokeManifest(tarballs) {
  const overrides = {};
  for (const [name, file] of Object.entries(tarballs)) {
    if (name !== CLI_NAME) overrides[name] = `file:${file}`;
  }
  return {
    name: "nodetool-packed-smoke",
    private: true,
    dependencies: { [CLI_NAME]: `file:${tarballs[CLI_NAME]}` },
    overrides
  };
}

const CORE_NODE_PACKAGES = ["core-nodes", "text-nodes", "data-nodes", "llm-nodes", "code-nodes"].map(name => `@nodetool-ai/${name}`);
const EXCLUDED_PACKAGES = new Set(["@nodetool-ai/base-nodes", ...NODE_PACKS.flatMap(pack => [pack.npmName, ...pack.provides])]);

/** Test-only manifest cut. The published CLI keeps its bundled packs until A24. */
export function coreOnlyCliManifest(manifest) {
  const result = structuredClone(manifest);
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies", "peerDependenciesMeta"]) {
    if (!result[field]) { continue; }
    for (const name of EXCLUDED_PACKAGES) { delete result[field][name]; }
  }
  result.dependencies ??= {};
  for (const name of CORE_NODE_PACKAGES) { result.dependencies[name] = manifest.version; }
  return result;
}

export function repackCoreCli(file, dest) {
  const staging = mkdtempSync(join(dest, "cli-repack-"));
  try {
    run("tar", ["-xzf", file, "-C", staging], {});
    const manifestFile = join(staging, "package", "package.json");
    const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
    if (manifest.name !== CLI_NAME) { throw new Error(`Expected ${CLI_NAME}, got ${manifest.name}`); }
    writeFileSync(manifestFile, `${JSON.stringify(coreOnlyCliManifest(manifest), null, 2)}\n`);
    return pack([{ name: CLI_NAME, dir: join(staging, "package") }], dest)[CLI_NAME];
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
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
    for (const { manifest, dir } of dependents) {
      if (!manifest[field]?.[compiler]) { throw new Error(`${manifest.name} does not declare its ${compiler} requirement`); }
      const requireFromDependent = createRequire(join(dir, "package.json"));
      permitted.add(realpathSync(join(requireFromDependent.resolve(`${compiler}/package.json`), "..")));
    }
    if (copies.some(({ dir }) => !permitted.has(dir))) { throw new Error(`${compiler} is installed outside its required core dependency closure`); }
    // npm validates every installed copy against the dependents' declared semver ranges.
    run("npm", ["ls", "--all", "--json", compiler], { cwd: appDir });
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
async function probeServe(bin, env, cwd, timeoutMs = 120_000) {
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
    console.log(`Usage: node scripts/smoke-packed-cli.mjs [--keep] [--work-dir <dir>] [--tarballs-dir <dir>] [--core-only]

Packs every public workspace, installs ${CLI_NAME} from the tarballs into an
empty project, and runs it against an empty HOME.

  --core-only       Repack the CLI without on-demand node packs and check the isolated core
  --keep            Keep the work directory for inspection
  --work-dir <dir>  Use this directory instead of a new temp directory
  --tarballs-dir <dir>  Reuse release tarballs, checking workspace names and versions`);
    return;
  }

  const work = values["work-dir"]
    ? resolve(values["work-dir"])
    : mkdtempSync(join(tmpdir(), "nodetool-packed-"));
  const tarballDir = join(work, "tarballs");
  const appDir = join(work, "app");
  const home = join(work, "home");
  for (const d of [tarballDir, appDir, home]) mkdirSync(d, { recursive: true });

  try {
    const packages = publicPackages().filter(pkg => !values["core-only"] || CORE_PACKAGES.includes(pkg.name));
    const cli = packages.find((p) => p.name === CLI_NAME);
    if (!cli) throw new Error(`${CLI_NAME} is not a public workspace`);

    const tarballs = values["tarballs-dir"]
      ? existingTarballs(packages, resolve(values["tarballs-dir"]))
      : pack(packages, tarballDir);
    if (values["core-only"]) {
      for (const [name, file] of Object.entries(tarballs)) {
        const copied = join(tarballDir, file.split(/[\\/]/).pop());
        if (resolve(file) !== resolve(copied)) { copyFileSync(file, copied); }
        tarballs[name] = copied;
      }
      tarballs[CLI_NAME] = repackCoreCli(tarballs[CLI_NAME], tarballDir);
    }
    console.log(`Using ${packages.length} packed package(s)${values["core-only"] ? " for core-only smoke" : ""}`);

    writeFileSync(
      join(appDir, "package.json"),
      `${JSON.stringify(smokeManifest(tarballs), null, 2)}\n`
    );
    console.log(`Installing ${CLI_NAME} from tarballs in ${appDir}`);
    run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], {
      cwd: appDir,
      stdio: ["ignore", "pipe", "pipe"]
    });
    if (values["core-only"]) {
      const inspected = assertCoreOnlyInstall(appDir);
      console.log(`ok  core-only guard inspected ${inspected} installed packages`);
      run(process.execPath, ["--input-type=module", "-e", 'await import("@nodetool-ai/dsl");'], { cwd: appDir, timeout: 120_000 });
      console.log("ok  the packed DSL imports without node packs");
    }
    const diskUsage = run("du", ["-sk", "node_modules"], { cwd: appDir }).trim();
    console.log(`Packed CLI disk usage (KiB, report only): ${diskUsage}`);

    const bin = join(appDir, "node_modules", ".bin", "nodetool");
    const env = { ...cleanEnv(home), SECRETS_MASTER_KEY: randomBytes(32).toString("base64") };
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

    const coreWorkflow = values["core-only"] ? JSON.parse(readFileSync(join(ROOT, NO_MODEL_WORKFLOW), "utf8")).graph : undefined;
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

    if (values["core-only"]) {
      const falFixture = join(appDir, "missing-fal.json");
      writeFileSync(falFixture, JSON.stringify({ graph: { nodes: [{ id: "fal", type: "fal.text_to_image.Flux1Dev", properties: { prompt: 42 } }], edges: [] } }));
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
      writeFileSync(falFixture, JSON.stringify({ graph: { nodes: [{ id: "fal", type: "fal.text_to_image.Flux1Dev", properties: { prompt: "Core-only pack preflight" } }], edges: [] } }));
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
  } finally {
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
