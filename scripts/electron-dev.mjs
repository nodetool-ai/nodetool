#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { platform } from "node:os";

const requiredNode = readFileSync(new URL("../.nvmrc", import.meta.url), "utf8").trim();
if (process.versions.node !== requiredNode) {
  console.error(`ERROR: Node.js ${requiredNode} required (found ${process.version})`);
  console.error("  Run: nvm use");
  process.exit(1);
}

const isWindows = platform() === "win32";
const env = { ...process.env, NODETOOL_NODE: process.execPath };

if (isWindows) {
  console.log("Starting Electron development mode...");
  const r = spawnSync(
    "powershell",
    ["-ExecutionPolicy", "Bypass", "-File", "scripts/electron-dev.ps1"],
    { stdio: "inherit", env }
  );
  process.exit(r.status ?? 1);
} else {
  console.log("Starting Electron development mode...");
  const r = spawnSync("bash", ["scripts/electron-dev.sh"], { stdio: "inherit", env });
  process.exit(r.status ?? 1);
}
