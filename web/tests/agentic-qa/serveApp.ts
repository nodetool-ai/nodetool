/**
 * Start a disposable NodeTool app for `agentic-qa` participants.
 *
 * The seeded in-memory backend the journey suite uses
 * (`packages/websocket/src/screenshot-server.ts`) in hermetic mode, plus a Vite
 * server proxied to it. Both run on their own ports so a participant never
 * touches a developer's live app on :7777/:3000. Nothing seeds the browser: no
 * onboarding dismissal, no selected model, no preference storage.
 *
 * `--state seeded-demo` (default) seeds example workflows, threads, assets, and
 * provider keys. `--state empty` seeds nothing, as a new account starts. Reset
 * either between sessions with `POST /api/test/reset` on the backend port.
 *
 * Usage (from web/):
 *   npx tsx tests/agentic-qa/serveApp.ts [--state empty|seeded-demo]
 *     [--backend-port 7790] [--web-port 3010]
 * Stop with Ctrl+C.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import * as net from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolve(CURRENT_DIR, "../..");
const REPO_ROOT = resolve(WEB_DIR, "..");
const HOST = "127.0.0.1";
// Same test-only key as tests/globalSetup.ts. Never use it in production.
const TEST_MASTER_KEY = "U0NSRUVOU0hPVF9URVNUX0tFWV9ET19OT1RfVVNFISE=";
const STARTUP_TIMEOUT_MS = 120_000;

async function isPortOpen(port: number): Promise<boolean> {
  return new Promise((done) => {
    const socket = net.createConnection({ host: HOST, port });
    socket.once("connect", () => {
      socket.end();
      done(true);
    });
    socket.once("error", () => done(false));
  });
}

async function waitForPort(port: number, child: ChildProcess, name: string): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${name} exited during startup (code ${child.exitCode}).`);
    }
    if (await isPortOpen(port)) {
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${name} did not open port ${port}.`);
}

const children: ChildProcess[] = [];

function stop(): void {
  for (const child of children) {
    child.kill("SIGTERM");
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "backend-port": { type: "string", default: "7790" },
      "web-port": { type: "string", default: "3010" },
      state: { type: "string", default: "seeded-demo" }
    }
  });
  const state = values.state ?? "seeded-demo";
  if (state !== "seeded-demo" && state !== "empty") {
    throw new Error(`Unknown --state ${state}. Use empty or seeded-demo.`);
  }
  const backendPort = Number(values["backend-port"]);
  const webPort = Number(values["web-port"]);
  for (const port of [backendPort, webPort]) {
    if (await isPortOpen(port)) {
      throw new Error(`Port ${port} is in use. Choose another port.`);
    }
  }

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  const backend = spawn(
    resolve(REPO_ROOT, "node_modules/.bin/tsx"),
    ["--conditions", "development", resolve(REPO_ROOT, "packages/websocket/src/screenshot-server.ts")],
    {
      env: {
        ...process.env,
        PORT: String(backendPort),
        HOST,
        SECRETS_MASTER_KEY: process.env.SECRETS_MASTER_KEY ?? TEST_MASTER_KEY,
        NODETOOL_FAKE_PROVIDERS: process.env.NODETOOL_FAKE_PROVIDERS ?? "1",
        NODETOOL_QA_STATE: state,
        METADATA_ROOTS: ""
      },
      stdio: ["ignore", "inherit", "inherit"]
    }
  );
  children.push(backend);
  await waitForPort(backendPort, backend, "Backend");

  // `vite/bin/vite.js` is not an exported subpath, so resolve the manifest.
  const viteManifest = createRequire(resolve(WEB_DIR, "package.json")).resolve("vite/package.json");
  const viteBin = resolve(dirname(viteManifest), "bin/vite.js");
  const web = spawn(
    process.execPath,
    [viteBin, "--port", String(webPort), "--strictPort", "--host", HOST],
    {
      cwd: WEB_DIR,
      env: { ...process.env, PROXY_API_TARGET: `http://${HOST}:${backendPort}` },
      stdio: ["ignore", "inherit", "inherit"]
    }
  );
  children.push(web);
  await waitForPort(webPort, web, "Vite");

  console.log(
    `[agentic-qa] App ready at http://${HOST}:${webPort}/ (backend ${HOST}:${backendPort}, ` +
      `fake providers ${process.env.NODETOOL_FAKE_PROVIDERS ?? "1"}, state ${state})`
  );
  await Promise.race(
    children.map((child) => new Promise((done) => child.once("exit", done)))
  );
  stop();
}

await main().catch((err: unknown) => {
  stop();
  console.error(err);
  process.exitCode = 1;
});
