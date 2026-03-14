#!/usr/bin/env node

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const workspaces = [
  "@nodetool/protocol",
  "@nodetool/config",
  "@nodetool/runtime",
  "@nodetool/auth",
  "@nodetool/security",
  "@nodetool/kernel",
  "@nodetool/node-sdk",
  "@nodetool/base-nodes",
  "@nodetool/models",
  "@nodetool/agents",
  "@nodetool/websocket",
];

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("error", rejectRun);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }

      rejectRun(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`));
    });
  });
}

for (const workspace of workspaces) {
  await run(npmCommand, ["run", "build", "--workspace", workspace]);
}
