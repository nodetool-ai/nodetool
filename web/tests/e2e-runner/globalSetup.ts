/**
 * Playwright global setup for the E2E workflow runner.
 *
 *   1. Builds the suite (copies workflow graphs + manifest into web/public/e2e-suite).
 *   2. Spawns the real backend (packages/websocket/src/e2e-server.ts) with an
 *      in-memory DB, passthrough node resolution and JSONL tracing enabled.
 *   3. Waits for the server to accept connections, returns a teardown.
 *
 * The Vite dev server (started by the Playwright config) proxies /api and /ws to
 * http://localhost:7777 — the backend started here.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import * as net from "node:net";
import { prepareSuite } from "./prepareSuite";

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(CURRENT_DIR, "../../..");
const WEB_ROOT = resolve(CURRENT_DIR, "../..");
const SERVER_SCRIPT = resolve(REPO_ROOT, "packages/websocket/src/e2e-server.ts");
const TSX_BIN = resolve(REPO_ROOT, "node_modules/.bin/tsx");
export const ARTIFACT_DIR = resolve(WEB_ROOT, "test-results/e2e-runner");
export const TRACE_FILE = resolve(ARTIFACT_DIR, "traces.jsonl");

const BACKEND_HOST = "127.0.0.1";
const BACKEND_PORT = 7777;
const STARTUP_TIMEOUT_MS = 120_000;
const E2E_TEST_MASTER_KEY_B64 = "RTJFX1RFU1RfS0VZX0RPX05PVF9VU0VfSU5fUFJPRCE=";

async function waitForPort(host: string, port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await new Promise<boolean>((res) => {
      const socket = net.createConnection({ host, port });
      socket.once("connect", () => {
        socket.end();
        res(true);
      });
      socket.once("error", () => res(false));
    });
    if (ready) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`[e2e globalSetup] Timed out waiting for backend on ${host}:${port}`);
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  const { count } = prepareSuite();
  console.log(`[e2e globalSetup] Prepared suite with ${count} workflows`);

  const serverProcess: ChildProcess = spawn(
    TSX_BIN,
    ["--conditions", "development", SERVER_SCRIPT],
    {
      env: {
        ...process.env,
        PORT: String(BACKEND_PORT),
        HOST: BACKEND_HOST,
        SECRETS_MASTER_KEY:
          process.env.SECRETS_MASTER_KEY ?? E2E_TEST_MASTER_KEY_B64,
        NODETOOL_TRACE_FILE: TRACE_FILE,
        METADATA_ROOTS: ""
      },
      stdio: ["ignore", "pipe", "inherit"]
    }
  );
  serverProcess.stdout?.on("data", (chunk: Buffer) => process.stdout.write(chunk));
  serverProcess.on("error", (err) =>
    console.error("[e2e globalSetup] Failed to start backend:", err)
  );

  try {
    await waitForPort(BACKEND_HOST, BACKEND_PORT, STARTUP_TIMEOUT_MS);
  } catch (err) {
    serverProcess.kill("SIGKILL");
    throw err;
  }
  console.log(`[e2e globalSetup] Backend ready on http://${BACKEND_HOST}:${BACKEND_PORT}`);

  return async () => {
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
  };
}
