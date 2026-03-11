#!/usr/bin/env node

import { spawn } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const mode = process.argv[2] ?? "server";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const websocketDir = resolve(rootDir, "packages", "websocket");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 7777);

const entrypoints = {
  server: "dist/server.js",
  "test-ui": "dist/test-ui-server.js",
};

if (!(mode in entrypoints)) {
  console.error(`Unknown websocket dev mode: ${mode}`);
  process.exit(1);
}

function isPortInUse(hostname, portNumber) {
  return new Promise((resolveCheck) => {
    const socket = net.createConnection({ host: hostname, port: portNumber });

    socket.once("connect", () => {
      socket.end();
      resolveCheck(true);
    });

    socket.once("error", (error) => {
      if (error.code === "ECONNREFUSED" || error.code === "EHOSTUNREACH" || error.code === "ETIMEDOUT") {
        resolveCheck(false);
        return;
      }

      resolveCheck(true);
    });
  });
}

function run(command, args, cwd) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd,
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

if (await isPortInUse(host, port)) {
  console.log(`A process is already listening on http://${host}:${port}.`);
  console.log("The TS backend may already be running, so skipping a second dev server start.");
  console.log(`Existing endpoints: http://${host}:${port} and ws://${host}:${port}/ws`);
  console.log("If this is the wrong process, stop it first or set PORT to another value before running dev.");
  process.exit(0);
}

await run(npmCommand, ["run", "build:all", "--workspace", "@nodetool/websocket"], rootDir);
await run(process.execPath, [entrypoints[mode]], websocketDir);
