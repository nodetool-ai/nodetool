import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Fast, network-free guard for the package build environment. Two failure
// modes have historically produced cryptic errors that look like missing
// dependencies:
//
//   1. NODE_ENV=production makes `npm install`/`npm ci` silently omit ALL
//      devDependencies (typescript, turbo, node-gyp). The build then dies with
//      "turbo: not found" / "Cannot find module 'typescript'" and sends you
//      hunting for a dependency that was never missing.
//   2. Running on a Node major other than the `.nvmrc` pin (e.g. Node 24 vs
//      the pinned 22) drifts away from the version the packaged app embeds.
//
// This runs before `build:packages` so both fail loudly with the actual fix
// instead of a downstream red herring.

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

function fail(message) {
  process.stderr.write(`\n\x1b[31m✖ build preflight: ${message}\x1b[0m\n\n`);
  process.exit(1);
}

function warn(message) {
  process.stderr.write(`\x1b[33m⚠ build preflight: ${message}\x1b[0m\n`);
}

export function checkNodeEnv(env = process.env) {
  if (env.NODE_ENV === "production") {
    fail(
      "NODE_ENV=production is set. npm omits ALL devDependencies (typescript, " +
        "turbo, node-gyp) in this mode, so the build fails with misleading " +
        '"module not found" / "turbo: not found" errors.\n' +
        "  Fix: run `unset NODE_ENV` (or `NODE_ENV= npm run build:packages`), " +
        "then reinstall with `npm install --include=dev` if devDeps were " +
        "already pruned.\n" +
        "  (This guards the build only — production runtime is unaffected.)"
    );
  }
}

export function checkNodeVersion(
  running = process.versions.node,
  root = repoRoot
) {
  let pinned;
  try {
    pinned = readFileSync(resolve(root, ".nvmrc"), "utf8").trim();
  } catch {
    // No .nvmrc — nothing to compare against.
    return;
  }
  if (!pinned) {
    return;
  }

  const runningMajor = running.split(".")[0];
  const pinnedMajor = pinned.replace(/^v/, "").split(".")[0];

  if (runningMajor !== pinnedMajor) {
    warn(
      `Node ${running} differs from the pinned major (.nvmrc: ${pinned}). ` +
        "The packaged app embeds the pinned major; building on another can " +
        "drift dev from prod.\n" +
        "  Fix: `nvm use` (installs/activates the pinned Node)."
    );
  }
}

export function preflight(env = process.env) {
  checkNodeEnv(env);
  checkNodeVersion();
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  preflight();
}
