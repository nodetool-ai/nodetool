// Rebuild non-N-API native modules against Electron's ABI.
//
// Only better-sqlite3 needs this: it uses raw V8/NAN bindings, so its compiled
// .node is locked to a specific NODE_MODULE_VERSION (140 for Electron 39, vs 127
// for system Node 22). bufferutil/keytar/msgpackr-extract are N-API and ABI-stable
// across both runtimes, so they are intentionally NOT rebuilt here.
//
// We compile from source against Electron headers rather than using
// `electron-rebuild` because that tool's artifact cache repeatedly restored a
// stale system-Node (127) build, and its dependency discovery failed to find the
// hoisted module in this monorepo.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);

const electronVersion = require("electron/package.json").version;
const arch = process.arch;
const distUrl = "https://electronjs.org/headers";

const moduleDir = dirname(require.resolve("better-sqlite3/package.json"));
const nodeGyp = require.resolve("node-gyp/bin/node-gyp.js");

console.log(
  `Rebuilding better-sqlite3 from source for Electron ${electronVersion} (${arch})`
);

const result = spawnSync(
  process.execPath,
  [
    nodeGyp,
    "rebuild",
    "--release",
    `--target=${electronVersion}`,
    `--arch=${arch}`,
    `--dist-url=${distUrl}`,
  ],
  { cwd: moduleDir, stdio: "inherit" }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
