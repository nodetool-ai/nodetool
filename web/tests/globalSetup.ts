/**
 * Playwright global setup: starts the real NodeTool backend server before any
 * tests run, using an in-memory SQLite database pre-seeded with mock data.
 *
 * How it works:
 *   1. Spawns `packages/websocket/src/screenshot-server.ts` via tsx.
 *   2. The server initialises an in-memory DB, seeds it with realistic mock
 *      data (workflows, assets, threads, messages, secrets) and starts the
 *      full NodeTool HTTP + WebSocket API on port 7777.
 *   3. globalSetup polls until the server is accepting TCP connections, then
 *      returns a teardown function that kills the process.
 *
 * The Vite dev server (started by playwright.config.ts webServer) proxies
 * /api/* and /ws to http://localhost:7777 by default — no extra env vars needed.
 *
 * Prerequisites:
 *   The @nodetool/* workspace packages must be importable.  If tsx cannot
 *   resolve them from source (development condition), build them first:
 *     npm run build:packages
 *
 * playwright.config.ts references this file via `globalSetup`.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as net from "node:net";

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
// CURRENT_DIR = web/tests — go up two levels to reach the repo root
const REPO_ROOT = resolve(CURRENT_DIR, "../..");
const SERVER_SCRIPT = resolve(
  REPO_ROOT,
  "packages/websocket/src/screenshot-server.ts"
);
const TSX_BIN = resolve(REPO_ROOT, "node_modules/.bin/tsx");

const BACKEND_HOST = "127.0.0.1";
const BACKEND_PORT = 7777;
const STARTUP_TIMEOUT_MS = 90_000;

/**
 * Poll until a TCP connection to host:port succeeds or the timeout elapses.
 */
async function waitForPort(
  host: string,
  port: number,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host, port });
      socket.once("connect", () => {
        socket.end();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
    });
    if (ready) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `[globalSetup] Timed out waiting for backend on ${host}:${port}`
  );
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  console.log("[globalSetup] Starting screenshot backend server…");

  const serverProcess: ChildProcess = spawn(
    TSX_BIN,
    ["--conditions", "development", SERVER_SCRIPT],
    {
      env: {
        ...process.env,
        PORT: String(BACKEND_PORT),
        HOST: BACKEND_HOST,
        // Suppress noisy Python detection on machines without Python
        METADATA_ROOTS: ""
      },
      // Inherit stderr so startup errors are visible; pipe stdout to detect READY
      stdio: ["ignore", "pipe", "inherit"]
    }
  );

  // Stream backend stdout to the parent console
  serverProcess.stdout?.on("data", (chunk: Buffer) => {
    process.stdout.write(chunk);
  });

  serverProcess.on("error", (err) => {
    console.error("[globalSetup] Failed to start backend process:", err);
  });

  // Wait for the server to accept TCP connections
  try {
    await waitForPort(BACKEND_HOST, BACKEND_PORT, STARTUP_TIMEOUT_MS);
  } catch (err) {
    serverProcess.kill("SIGKILL");
    throw err;
  }

  console.log(
    `[globalSetup] Backend server ready on http://${BACKEND_HOST}:${BACKEND_PORT}`
  );

  // Return teardown function (called after all tests complete)
  return async () => {
    console.log("[globalSetup] Stopping backend server…");
    serverProcess.kill("SIGTERM");
    await new Promise<void>((done) => {
      const timer = setTimeout(() => {
        serverProcess.kill("SIGKILL");
        done();
      }, 5_000);
      serverProcess.once("exit", () => {
        clearTimeout(timer);
        done();
      });
    });
    console.log("[globalSetup] Backend server stopped");
  };
}
