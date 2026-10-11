#!/usr/bin/env node
/**
 * Install `@nodetool-ai/cli` from packed tarballs and check that it runs the
 * way an agent uses it on a clean machine: no repository, no `.env`, no
 * keychain, no provider keys.
 *
 * Every public workspace is packed with `npm pack`. A throwaway project
 * depends on the CLI tarball, and `overrides` point every other workspace
 * name at its tarball, so npm resolves the whole tree the way the registry
 * would after a complete publish, without touching the registry for our own
 * packages. Run it after `prepare-publish.mjs` and before `npm publish`: a
 * failure here means the release would not install or start.
 *
 * Checks, each against an empty HOME:
 *   1. `nodetool --version` prints the workspace version.
 *   2. `nodetool --help` lists the agent harness commands.
 *   3. `nodetool mcp serve` answers an MCP initialize and lists tools.
 *   4. `nodetool workflows run` executes a workflow that calls no model.
 *   5. `nodetool serve` answers `GET /health`.
 *
 * Usage:
 *   node scripts/smoke-packed-cli.mjs [--keep] [--work-dir <dir>]
 */

import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = resolve(import.meta.dirname, "..");
const PACKAGE_ROOTS = ["packages", "reliability"];
const CLI_NAME = "@nodetool-ai/cli";
const REQUIRED_COMMANDS = ["serve", "mcp", "run", "validate", "debug", "node"];
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

function pack(packages, dest) {
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

/**
 * Start `nodetool mcp serve`, send initialize and tools/list over stdio, and
 * resolve with the tool count. Stdout is newline-delimited JSON-RPC.
 */
function probeMcp(bin, env, timeoutMs = 120_000) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(bin, ["mcp", "serve"], { env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`mcp serve did not answer within ${timeoutMs}ms\n${stderr}`));
    }, timeoutMs);
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
          clearTimeout(timer);
          child.removeAllListeners("exit");
          child.kill();
          if (msg.error) {
            reject(new Error(`tools/list failed: ${JSON.stringify(msg.error)}`));
          } else {
            resolvePromise(msg.result.tools.length);
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
async function probeServe(bin, env, timeoutMs = 120_000) {
  const port = await freePort();
  // `serve` runs the server as a child process, so start a process group
  // and kill the whole group, or the server outlives the check.
  const child = spawn(bin, ["serve", "--port", String(port)], {
    env,
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
      help: { type: "boolean", short: "h", default: false }
    }
  });
  if (values.help) {
    console.log(`Usage: node scripts/smoke-packed-cli.mjs [--keep] [--work-dir <dir>]

Packs every public workspace, installs ${CLI_NAME} from the tarballs into an
empty project, and runs it against an empty HOME.

  --keep            Keep the work directory for inspection
  --work-dir <dir>  Use this directory instead of a new temp directory`);
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
    const packages = publicPackages();
    const cli = packages.find((p) => p.name === CLI_NAME);
    if (!cli) throw new Error(`${CLI_NAME} is not a public workspace`);

    console.log(`Packing ${packages.length} package(s) into ${tarballDir}`);
    const tarballs = pack(packages, tarballDir);

    writeFileSync(
      join(appDir, "package.json"),
      `${JSON.stringify(smokeManifest(tarballs), null, 2)}\n`
    );
    console.log(`Installing ${CLI_NAME} from tarballs in ${appDir}`);
    run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], {
      cwd: appDir,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const bin = join(appDir, "node_modules", ".bin", "nodetool");
    const env = cleanEnv(home);

    const version = run(bin, ["--version"], { env }).trim();
    if (version !== cli.version) {
      throw new Error(`nodetool --version printed '${version}', expected '${cli.version}'`);
    }
    console.log(`ok  nodetool --version = ${version}`);

    const missing = missingCommands(run(bin, ["--help"], { env }));
    if (missing.length > 0) {
      throw new Error(`nodetool --help is missing: ${missing.join(", ")}`);
    }
    console.log(`ok  nodetool --help lists ${REQUIRED_COMMANDS.join(", ")}`);

    const tools = await probeMcp(bin, env);
    if (tools === 0) throw new Error("nodetool mcp serve listed no tools");
    console.log(`ok  nodetool mcp serve lists ${tools} tools`);

    const out = run(
      bin,
      [
        "workflows",
        "run",
        resolve(ROOT, NO_MODEL_WORKFLOW),
        "--params",
        JSON.stringify({ text: "packed smoke" }),
        "--json"
      ],
      { env }
    );
    if (!out.includes("packed smoke")) {
      throw new Error(`nodetool workflows run did not echo its input:\n${out}`);
    }
    console.log("ok  nodetool workflows run executes a no-model workflow");

    await probeServe(bin, env);
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
