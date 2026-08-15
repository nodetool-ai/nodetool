#!/usr/bin/env node
/**
 * Boot smoke test for the staged backend bundle (backend-bundle/).
 *
 * verify-backend-bundle.mjs checks the layout: are the files where the
 * packaged server expects them. This checks the thing that actually matters —
 * that server.mjs runs. The two miss different failures. A sharp/@img major
 * skew shipped in v0.7.1-nightly.20260728.713 killed the backend on import
 * (`format.jp2.output` of undefined) with a layout that looked perfectly fine,
 * and the release smoke-launch didn't catch it either: it spawns the Electron
 * main process, which survives its backend child dying.
 *
 * The bundle is booted the way the packaged app boots it — externals resolved
 * from a real node_modules (electron-builder's afterPack promotes the staged
 * _modules to that name), against a throwaway data dir, on a free port — then
 * polled on /health.
 *
 * Two kinds of bundle can be passed, and the interpreter follows the bundle:
 *
 *   - The *staged* bundle (electron/backend-bundle), before packaging. No
 *     bundled Node yet, so it runs on the current interpreter. This is what
 *     the Quality Gate checks.
 *   - The *packed* backend (…/resources/backend), after electron-builder. It
 *     ships its own Node at runtime/node — the binary the app actually
 *     launches the backend with (electron/src/server.ts) and the one afterPack
 *     rebuilds better-sqlite3 against. Booting it with anything else is a
 *     NODE_MODULE_VERSION mismatch: electron-builder's npmRebuild leaves the
 *     workspace's native modules on Electron's ABI, which is neither the
 *     runner's Node nor the bundled one.
 *
 * Usage: node scripts/smoke-backend-bundle.mjs [bundleDir] [--timeout <ms>]
 *                                              [--node <path>]
 *        Defaults: electron/backend-bundle, 120000 ms, bundled Node when
 *        present and the current interpreter otherwise.
 *        Exits 1 with the captured server output if the backend dies or never
 *        answers /health.
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const opts = {
    bundleDir: path.join(ROOT_DIR, "electron", "backend-bundle"),
    timeoutMs: 120_000,
  };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--timeout") {
      opts.timeoutMs = Number(rest[++i]);
      if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs <= 0) {
        throw new Error(`--timeout must be a positive number of ms`);
      }
    } else if (rest[i] === "--node") {
      opts.nodePath = path.resolve(rest[++i]);
    } else if (rest[i].startsWith("--")) {
      throw new Error(`Unknown argument: ${rest[i]}`);
    } else {
      opts.bundleDir = path.resolve(rest[i]);
    }
  }
  return opts;
}

/** An OS-assigned free port, so parallel CI legs don't collide on 7777. */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Give the staged externals the name Node resolves: electron-builder's
 * afterPack renames _modules to node_modules in the packaged app (the staged
 * name only exists to dodge electron-builder's node_modules exclusion). A
 * symlink won't do — Node resolves through realpath and would escape into the
 * workspace's own node_modules, which is exactly the resolution the packaged
 * app doesn't have. Returns a restore function.
 */
async function withPackagedModuleLayout(bundleDir) {
  const staged = path.join(bundleDir, "_modules");
  const packaged = path.join(bundleDir, "node_modules");
  if (fs.existsSync(packaged)) return async () => {};
  if (!fs.existsSync(staged)) {
    throw new Error(
      `neither _modules/ nor node_modules/ exists in ${bundleDir} — ` +
        `run 'npm run prepare-backend' in electron/ first`
    );
  }
  await fsp.rename(staged, packaged);
  return async () => {
    await fsp.rename(packaged, staged);
  };
}

function toneWav() {
  const sampleRate = 8_000;
  const frames = 800;
  const bytes = new Uint8Array(44 + frames * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset, value) => {
    for (let i = 0; i < value.length; i += 1) {
      bytes[offset + i] = value.charCodeAt(i);
    }
  };
  text(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i += 1) {
    const sample = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.2;
    view.setInt16(44 + i * 2, Math.round(sample * 0x7fff), true);
  }
  return bytes;
}

/** Prove the staged native codec loads and performs work after relocation. */
async function probeMediabunnyCodecs(bundleDir) {
  const modulesDir = path.join(bundleDir, "node_modules");
  const mediabunny = await import(
    pathToFileURL(
      path.join(modulesDir, "mediabunny", "dist", "modules", "src", "index.js")
    ).href
  );
  const server = await import(
    pathToFileURL(
      path.join(
        modulesDir,
        "@mediabunny",
        "server",
        "dist",
        "bundles",
        "mediabunny-server.mjs"
      )
    ).href
  );
  server.registerMediabunnyServer();

  const target = new mediabunny.BufferTarget();
  const output = new mediabunny.Output({
    format: new mediabunny.Mp4OutputFormat(),
    target,
  });
  const conversion = await mediabunny.Conversion.init({
    input: new mediabunny.Input({
      source: new mediabunny.BufferSource(toneWav()),
      formats: mediabunny.ALL_FORMATS,
    }),
    output,
    audio: { codec: "aac" },
    showWarnings: false,
  });
  if (!conversion.isValid) {
    throw new Error("staged Mediabunny codecs cannot convert WAV to AAC");
  }
  await conversion.execute();
  if (!target.buffer || target.buffer.byteLength === 0) {
    throw new Error("staged Mediabunny WAV-to-AAC conversion returned no data");
  }
}

/**
 * The Node the packaged app launches the backend with, when the bundle carries
 * one. Falls back to the current interpreter for a staged (unpacked) bundle.
 */
function resolveNodeBinary(bundleDir, override) {
  if (override) return override;
  const bundled = path.join(
    bundleDir,
    "runtime",
    process.platform === "win32" ? "node.exe" : "node"
  );
  return fs.existsSync(bundled) ? bundled : process.execPath;
}

async function bootAndProbe(bundleDir, timeoutMs, nodeBinary) {
  const port = await freePort();
  const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), "nodetool-smoke-"));
  const output = [];

  const child = spawn(nodeBinary, ["server.mjs"], {
    cwd: bundleDir,
    env: {
      ...process.env,
      PORT: String(port),
      // Keep every write inside the throwaway dir: the data dir is derived
      // from XDG_DATA_HOME / APPDATA, both falling back to the home dir.
      HOME: dataDir,
      XDG_DATA_HOME: dataDir,
      APPDATA: dataDir,
      // CI runners have no keychain, and keytar failing aborts DB setup.
      SECRETS_MASTER_KEY: randomBytes(32).toString("base64"),
      NODETOOL_LOG_LEVEL: process.env["NODETOOL_LOG_LEVEL"] ?? "info",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const capture = (chunk) => output.push(chunk.toString());
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);

  let exit = null;
  child.on("exit", (code, signal) => {
    exit = { code, signal };
  });

  const deadline = Date.now() + timeoutMs;
  let healthy = false;
  let lastProbeError = "";
  while (Date.now() < deadline && exit === null && !healthy) {
    await sleep(500);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) {
        healthy = true;
        output.push(`\n--- GET /health -> ${res.status} ${await res.text()}\n`);
      } else {
        lastProbeError = `HTTP ${res.status}`;
      }
    } catch (e) {
      lastProbeError = e.message;
    }
  }

  if (exit === null) {
    child.kill("SIGTERM");
    // Don't let a backend that ignores SIGTERM hang the job.
    const hardKill = setTimeout(() => child.kill("SIGKILL"), 10_000);
    await new Promise((r) => child.once("exit", r));
    clearTimeout(hardKill);
  }
  await fsp.rm(dataDir, { recursive: true, force: true });

  return { healthy, exit, output: output.join(""), port, lastProbeError };
}

export async function smokeBackendBundle(
  bundleDir,
  { timeoutMs = 120_000, nodePath } = {}
) {
  const nodeBinary = resolveNodeBinary(bundleDir, nodePath);
  const restore = await withPackagedModuleLayout(bundleDir);
  let result;
  try {
    await probeMediabunnyCodecs(bundleDir);
    result = await bootAndProbe(bundleDir, timeoutMs, nodeBinary);
  } finally {
    await restore();
  }
  result.nodeBinary = nodeBinary;

  if (result.healthy) return result;

  const why =
    result.exit !== null
      ? `server.mjs exited (code ${result.exit.code}, signal ${result.exit.signal}) ` +
        `before answering /health`
      : `server.mjs never answered /health within ${timeoutMs}ms ` +
        `(last probe: ${result.lastProbeError || "no response"})`;
  throw new Error(
    `backend bundle smoke test failed: ${why}\n` +
      `  bundle: ${bundleDir}\n  node:   ${nodeBinary}\n` +
      `--- server output ---\n${result.output.trimEnd() || "(no output)"}`
  );
}

const isCli =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  const { bundleDir, timeoutMs, nodePath } = parseArgs(process.argv);
  console.log(`Smoke-testing backend bundle: ${bundleDir}`);
  try {
    const { port, nodeBinary } = await smokeBackendBundle(bundleDir, {
      timeoutMs,
      nodePath,
    });
    console.log(
      `  OK: server.mjs booted on ${nodeBinary} and answered /health on :${port}`
    );
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
