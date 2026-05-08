#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { platform } from "node:os";

// Pin to Node 22 to match Electron 39's embedded Node (22.22.1). Diverging
// majors causes API/runtime drift between dev and the packaged app.
const nodeMajor = process.versions.node.split(".")[0];
if (nodeMajor !== "22") {
  console.error(`ERROR: Node.js 22.x required (found ${process.version})`);
  console.error("  Matches Electron 39's embedded Node — see .nvmrc.");
  console.error("  Run: nvm use");
  process.exit(1);
}

const isWindows = platform() === "win32";

if (isWindows) {
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
