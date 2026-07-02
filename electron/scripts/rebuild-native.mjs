// Rebuild the V8/NAN-locked native module(s) against the Node ABI the backend
// runs on (system Node in dev, the bundled Node 22.x in prod — same ABI).
//
// The backend always runs on vanilla Node, NOT Electron's embedded Node, so we
// build against Node headers (node-gyp's default dist-url), not Electron's.
// Only better-sqlite3 is V8-locked; N-API modules (bufferutil, etc.) are
// ABI-stable, ship their own prebuilds, and are skipped here.
//
// This runs from the ROOT postinstall (see the root package.json), i.e. AFTER
// npm has fully materialized the dependency tree — never during reify. Running
// mid-reify used to race npm's atomic renames of node-gyp's own deps (e.g.
// `tinyglobby`), which surfaced as "Cannot find module 'tinyglobby'". The retry
// loop below is defense-in-depth against any residual transient resolution
// failure. Also exposed as `npm run rebuild:native` for a manual force-rebuild.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);
const arch = process.arch;

// better-sqlite3 is hoisted to the root node_modules; resolve it from here.
// If it isn't installed (e.g. a filtered/minimal install), there's nothing to
// rebuild — skip cleanly rather than failing the postinstall.
let moduleDir;
try {
  moduleDir = dirname(require.resolve("better-sqlite3/package.json"));
} catch {
  console.log("better-sqlite3 not installed; skipping native rebuild.");
  process.exit(0);
}

// Resolve node-gyp's CLI. During `npm ci`/`npm install`/`npm run`, npm exports
// its OWN bundled node-gyp via `npm_config_node_gyp` — the only copy guaranteed
// present during a clean install (project deps don't reliably hoist node-gyp to
// a resolvable path, and its bundled deps like `tinyglobby` are never touched by
// the project's reify, so there's no race). Fall back to require.resolve for the
// case where the script is run directly with plain `node`, not via npm.
function resolveNodeGyp() {
  const fromNpm = process.env.npm_config_node_gyp;
  if (fromNpm && existsSync(fromNpm)) {
    return fromNpm;
  }
  const candidates = [
    () => require.resolve("node-gyp/bin/node-gyp.js"),
    () => createRequire(`${moduleDir}/`).resolve("node-gyp/bin/node-gyp.js"),
  ];
  for (const resolve of candidates) {
    try {
      return resolve();
    } catch {
      // try the next candidate
    }
  }
  return null;
}

const isTransientResolutionError = (out) =>
  /Cannot find module|MODULE_NOT_FOUND/.test(out ?? "");

// Block synchronously (no busy-wait) so the sync spawn retry loop stays simple.
const sleep = (ms) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

console.log(
  `Rebuilding better-sqlite3 for Node ${process.versions.node} (${arch})`
);

const MAX_ATTEMPTS = 3;
let lastStatus = 1;

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  const nodeGyp = resolveNodeGyp();
  if (!nodeGyp) {
    if (attempt < MAX_ATTEMPTS) {
      console.warn(
        `node-gyp not resolvable yet (attempt ${attempt}/${MAX_ATTEMPTS}); retrying…`
      );
      sleep(500 * attempt);
      continue;
    }
    console.error("Could not resolve node-gyp to rebuild better-sqlite3.");
    process.exit(1);
  }

  // Capture (rather than inherit) so we can inspect stderr for a transient
  // resolution failure before deciding whether to retry, then echo it through.
  const result = spawnSync(
    process.execPath,
    [nodeGyp, "rebuild", "--release", `--arch=${arch}`],
    { cwd: moduleDir, encoding: "utf8" }
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  lastStatus = result.status ?? 1;

  if (lastStatus === 0) {
    process.exit(0);
  }

  // node-gyp exits non-zero on a transient dep-resolution failure; retry.
  const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (attempt < MAX_ATTEMPTS && isTransientResolutionError(combined)) {
    console.warn(
      `better-sqlite3 rebuild hit a transient module-resolution error (attempt ${attempt}/${MAX_ATTEMPTS}); retrying…`
    );
    sleep(500 * attempt);
    continue;
  }

  break;
}

process.exit(lastStatus);
