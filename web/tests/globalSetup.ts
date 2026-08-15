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
 *   The @nodetool-ai/* workspace packages must be importable.  If tsx cannot
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
const BACKEND_PORT = Number(process.env.SCREENSHOT_BACKEND_PORT ?? 7777);
const STARTUP_TIMEOUT_MS = 90_000;
// Base64-encoded 32-byte placeholder key used only for screenshot tests.
// Never use this value in production.
const SCREENSHOT_TEST_MASTER_KEY_B64 =
  "U0NSRUVOU0hPVF9URVNUX0tFWV9ET19OT1RfVVNFISE=";

/**
 * Resolve true when host:port already accepts connections.
 */
async function isPortOpen(host: string, port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

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

  // CI/headless Linux often has no keychain backend (libsecret). Provide a
  // deterministic test-only master key so screenshot-server can boot reliably.
  if (
    process.env.NODE_ENV === "production" &&
    !process.env.SECRETS_MASTER_KEY
  ) {
    throw new Error(
      "[globalSetup] SECRETS_MASTER_KEY must be set when NODE_ENV=production"
    );
  }
  const screenshotTestMasterKey =
    process.env.SECRETS_MASTER_KEY ?? SCREENSHOT_TEST_MASTER_KEY_B64;

  // A process already on the port would make waitForPort succeed while our own
  // server dies with EADDRINUSE — the suite then screenshots whatever that
  // process serves and reports the mismatch as pixel diffs instead of a crash.
  if (await isPortOpen(BACKEND_HOST, BACKEND_PORT)) {
    throw new Error(
      `[globalSetup] ${BACKEND_HOST}:${BACKEND_PORT} is already in use. The visual ` +
        `suite needs its own seeded backend on that port — stop the process ` +
        `holding it (e.g. a leftover screenshot-server or \`npm run dev\`), or ` +
        `set SCREENSHOT_BACKEND_PORT to a free port.`
    );
  }

  const serverProcess: ChildProcess = spawn(
    TSX_BIN,
    ["--conditions", "development", SERVER_SCRIPT],
    {
      env: {
        ...process.env,
        PORT: String(BACKEND_PORT),
        HOST: BACKEND_HOST,
        SECRETS_MASTER_KEY: screenshotTestMasterKey,
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

  // Surface an early exit (bad key, port race, import failure) as itself rather
  // than as a startup timeout 90s later. Held in a mutable object rather than
  // reassigning a `let` directly — TS narrows a variable only ever assigned
  // inside a callback to its initializer's literal type, which turns
  // `exited.code` below into a `never` access.
  const exitState: {
    exited: { code: number | null; signal: NodeJS.Signals | null } | null;
  } = { exited: null };
  serverProcess.once("exit", (code, signal) => {
    exitState.exited = { code, signal };
  });

  // Wait for the server to accept TCP connections
  try {
    await Promise.race([
      waitForPort(BACKEND_HOST, BACKEND_PORT, STARTUP_TIMEOUT_MS),
      new Promise<never>((_, reject) => {
        serverProcess.once("exit", (code, signal) =>
          reject(
            new Error(
              `[globalSetup] Backend exited before becoming ready (code=${code}, signal=${signal}). See the server output above.`
            )
          )
        );
      })
    ]);
  } catch (err) {
    serverProcess.kill("SIGKILL");
    throw err;
  }
  if (exitState.exited) {
    throw new Error(
      `[globalSetup] Backend exited during startup (code=${exitState.exited.code}).`
    );
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
