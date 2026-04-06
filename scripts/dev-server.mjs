#!/usr/bin/env node

/**
 * Vite-like dev server for the TypeScript backend.
 *
 * Uses tsx to run the server directly from TypeScript source — no build step.
 * Watches all imported files and restarts automatically on changes.
 *
 * Usage:
 *   node scripts/dev-server.mjs              # default: server mode
 *   node scripts/dev-server.mjs test-ui      # test-ui mode
 */

import { spawn } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const mode = process.argv[2] ?? "server";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 7777);

const entrypoints = {
  server: resolve(rootDir, "packages", "websocket", "src", "server.ts"),
  "test-ui": resolve(rootDir, "packages", "websocket", "src", "test-ui-server.ts"),
};

if (!(mode in entrypoints)) {
  console.error(`Unknown mode: ${mode}. Use: ${Object.keys(entrypoints).join(", ")}`);
  process.exit(1);
}

function isPortInUse(hostname, portNumber) {
  return new Promise((resolveCheck) => {
    const socket = net.createConnection({ host: hostname, port: portNumber });
    socket.setTimeout(2000);
    socket.once("connect", () => { socket.end(); resolveCheck(true); });
    socket.once("timeout", () => { socket.destroy(); resolveCheck(false); });
    socket.once("error", (error) => {
      resolveCheck(!["ECONNREFUSED", "EHOSTUNREACH", "ETIMEDOUT"].includes(error.code));
    });
  });
}

if (await isPortInUse(host, port)) {
  console.log(`Port ${port} already in use — dev server may already be running.`);
  console.log(`Stop the existing process or set PORT=<other> to use a different port.`);
  process.exit(0);
}

// Resolve tsx binary from the workspace
const tsxBinaryName = process.platform === "win32" ? "tsx.cmd" : "tsx";
const tsxBin = resolve(rootDir, "node_modules", ".bin", tsxBinaryName);

console.log(`\n  Starting dev server (tsx --watch) on http://${host}:${port}`);
console.log(`  Entry: ${entrypoints[mode]}`);
console.log(`  Changes to any imported .ts file will trigger a restart.\n`);

const child = spawn(tsxBin, ["--watch", entrypoints[mode]], {
  cwd: rootDir,
  stdio: "inherit",
  env: {
    ...process.env,
    HOST: host,
    PORT: String(port),
    NODE_ENV: "development",
    // tsx resolves "development" condition in package.json exports,
    // loading .ts source instead of compiled .js from dist/
    NODE_OPTIONS: [process.env.NODE_OPTIONS, "--conditions=nodetool-dev"].filter(Boolean).join(" "),
  },
});

child.on("exit", (code) => process.exit(code ?? 1));
process.on("SIGINT", () => { child.kill("SIGINT"); });
process.on("SIGTERM", () => { child.kill("SIGTERM"); });
