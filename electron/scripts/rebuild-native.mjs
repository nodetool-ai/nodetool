// Rebuild the V8/NAN-locked native module(s) against the Node ABI the backend
// runs on (system Node in dev, the bundled Node 22.x in prod — same ABI).
//
// The backend always runs on vanilla Node, NOT Electron's embedded Node, so we
// build against Node headers (node-gyp's default dist-url), not Electron's.
// Only better-sqlite3 is V8-locked; N-API modules are ABI-stable and skipped.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);
const arch = process.arch;
const moduleDir = dirname(require.resolve("better-sqlite3/package.json"));
const nodeGyp = require.resolve("node-gyp/bin/node-gyp.js");

console.log(`Rebuilding better-sqlite3 for Node ${process.versions.node} (${arch})`);

const result = spawnSync(
  process.execPath,
  [nodeGyp, "rebuild", "--release", `--arch=${arch}`],
  { cwd: moduleDir, stdio: "inherit" }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
