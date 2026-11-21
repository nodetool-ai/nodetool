#!/usr/bin/env node
/**
 * First-run setup for local development. Runs as the `predev` and
 * `predev:server` npm hooks, and directly as `npm run bootstrap`.
 *
 * Each step is skipped when its output already exists, so repeat runs cost
 * a few file checks: .env with SECRETS_MASTER_KEY, node_modules, the
 * better-sqlite3 native build, and the backend package build.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const step = (msg) => console.log(`\n==> ${msg}`);
const die = (msg) => {
  console.error(`error ${msg}`);
  process.exit(1);
};
const run = (cmd, args, env = {}) =>
  spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...env },
  }).status === 0;

const want = existsSync(".nvmrc")
  ? readFileSync(".nvmrc", "utf8").trim().replace(/^v/, "")
  : "22";
const wantMajor = want.split(".")[0];
const haveMajor = process.versions.node.split(".")[0];
if (haveMajor !== wantMajor) {
  console.warn(
    `warn Node ${wantMajor}.x expected by .nvmrc (found ${process.version}). Run 'nvm use'.`,
  );
}

if (!run("node", ["scripts/ensure-dev-env.mjs"])) {
  die("could not prepare .env");
}

if (!existsSync("node_modules")) {
  step("Installing dependencies (first run only)");
  // Binary downloads 403 behind proxies and a failed postinstall rolls back
  // the whole tree. Dev never needs these.
  const ok = run("npm", ["install", "--no-audit", "--fund=false"], {
    ELECTRON_SKIP_BINARY_DOWNLOAD: "1",
    npm_config_onnxruntime_node_install_cuda: "skip",
  });
  if (!ok) die("npm install failed. See docs/dev-environment.md.");
}

if (
  existsSync("node_modules/better-sqlite3") &&
  !existsSync("node_modules/better-sqlite3/build")
) {
  step("Rebuilding better-sqlite3 against Node headers");
  if (!run("npm", ["run", "rebuild:native"])) {
    console.warn("warn native rebuild failed, database features may not work");
  }
}

if (!existsSync("packages/base-nodes/dist")) {
  step("Building backend packages (first run only)");
  if (!run("npm", ["run", "build:packages"])) die("build:packages failed");
}
