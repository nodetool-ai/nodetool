#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { platform } from "node:os";

const nodeMajor = process.versions.node.split(".")[0];
if (nodeMajor !== "24") {
  console.error(`ERROR: Node.js 24.x required (found ${process.version})`);
  console.error("  Native modules must match Electron's embedded Node ABI.");
  console.error("  Run: nvm use 24");
  process.exit(1);
}

const isWindows = platform() === "win32";

if (isWindows) {
  // Native modules load inside utilityProcess.fork() — ABI must match the
  // *installed* Electron, not the range in package.json.
  const { createRequire } = await import("node:module");
  const req = createRequire(import.meta.url);
  const electronVersion = req("../node_modules/electron/package.json").version;
  console.log(`Rebuilding native modules for Electron ${electronVersion}...`);
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
