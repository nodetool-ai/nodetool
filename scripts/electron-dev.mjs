#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { platform } from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const nodeMajor = process.versions.node.split(".")[0];
if (nodeMajor !== "22") {
  console.error(`ERROR: Node.js 22.x required (found ${process.version})`);
  console.error("  Electron 35 embeds Node 22 — native modules must match.");
  console.error("  Run: nvm use 22");
  process.exit(1);
}

const isWindows = platform() === "win32";

if (isWindows) {
  // Windows: force native rebuild, then hand off to PowerShell script.
  // The .ps1 does not re-do the rebuild; we do it here to match Makefile behavior.
  const electronVersion = require("../electron/package.json").devDependencies.electron;
  const gyp = (cwd) =>
    spawnSync(
      "npx",
      [
        "node-gyp",
        "rebuild",
        `--target=${electronVersion}`,
        "--arch=x64",
        "--dist-url=https://electronjs.org/headers",
      ],
      { cwd, stdio: "inherit", shell: true }
    );

  console.log("Rebuilding native modules for Electron ABI (force)...");
  if (gyp("node_modules/better-sqlite3").status !== 0) process.exit(1);
  if (gyp("node_modules/bufferutil").status !== 0) process.exit(1);

  console.log("Starting Electron development mode...");
  const r = spawnSync(
    "powershell",
    ["-ExecutionPolicy", "Bypass", "-File", "scripts/electron-dev.ps1"],
    { stdio: "inherit" }
  );
  process.exit(r.status ?? 1);
} else {
  console.log("Starting Electron development mode...");
  const r = spawnSync("bash", ["scripts/electron-dev.sh"], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}
