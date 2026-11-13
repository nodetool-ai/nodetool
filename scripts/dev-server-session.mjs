// Starts the development server (scripts/dev-server.mjs) for a native app run
// and stops it when the app quits. Used by native/node-editor/scripts/run.mjs
// and native/timeline/scripts/run.mjs.
import { spawn, spawnSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const windows = process.platform === "win32";
export const serverUrl = "http://127.0.0.1:7777";
const serverStartTimeoutMs = 120_000;

// The user's database in the NodeTool data folder, as getNodetoolDataDir in
// packages/config/src/paths.ts finds it. The native apps' local runs read
// assets and workspaces from the same folder. A checkout's .env can name
// another database (.env.example sets ./nodetool.db), so the server gets this
// one unless the shell sets DB_PATH or DATABASE_URL.
function databaseEnv() {
  if (process.env.DB_PATH?.trim() || process.env.DATABASE_URL?.trim()) {
    return {};
  }
  const dataDir = windows
    ? join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "nodetool")
    : join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "nodetool");
  return { DB_PATH: join(dataDir, "nodetool.sqlite3") };
}

async function serverReady() {
  try {
    const response = await fetch(`${serverUrl}/ready`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

// Returns the started server process, or undefined when a server already answers.
export async function startServer(log) {
  if (await serverReady()) {
    console.log(`Using the server at ${serverUrl}`);
    return undefined;
  }
  const fd = openSync(log, "a");
  const database = databaseEnv();
  console.log(`Starting the development server on ${serverUrl}, log: ${log}`);
  if (database.DB_PATH) {
    console.log(`Database: ${database.DB_PATH}`);
  }
  // Its own process group: dev-server.mjs leaves its tsx watch child running
  // when it is stopped alone, so stopServer signals the whole group.
  const server = spawn(process.execPath, ["scripts/dev-server.mjs"], {
    cwd: root,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", fd, fd],
    env: { ...process.env, ...database, HOST: "127.0.0.1", PORT: "7777" }
  });
  closeSync(fd);
  let exited = false;
  server.on("exit", () => { exited = true; });
  const started = Date.now();
  while (Date.now() - started < serverStartTimeoutMs) {
    if (exited) {
      await stopServer(server);
      throw new Error(`The development server exited with code ${server.exitCode}, see ${log}`);
    }
    if (await serverReady()) {
      return server;
    }
    await new Promise((done) => setTimeout(done, 400));
  }
  await stopServer(server);
  throw new Error(`The development server did not answer ${serverUrl}/ready in ${serverStartTimeoutMs / 1000} s, see ${log}`);
}

export function signalGroup(server, signal) {
  if (windows) {
    if (server.exitCode !== null) {
      return false;
    }
    if (signal === 0) {
      return true;
    }
    const result = spawnSync("taskkill.exe", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    return result.status === 0;
  }
  try {
    process.kill(-server.pid, signal);
    return true;
  } catch {
    return false;
  }
}

export async function stopServer(server) {
  if (!server || !signalGroup(server, "SIGTERM")) {
    return;
  }
  if (windows) {
    return;
  }
  const started = Date.now();
  while (signalGroup(server, 0)) {
    if (Date.now() - started > 10_000) {
      signalGroup(server, "SIGKILL");
      return;
    }
    await new Promise((done) => setTimeout(done, 100));
  }
}

// Runs a native app in the foreground. Ctrl-C reaches the app, which quits,
// and the caller then stops the server. Resolves with the app's exit code.
export function runApp(binary, args, server, options = {}) {
  return new Promise((done, fail) => {
    const app = spawn(binary, args, { stdio: "inherit", ...options });
    process.on("SIGINT", () => {});
    for (const signal of ["SIGTERM", "SIGHUP"]) {
      process.on(signal, () => {
        app.kill(signal);
        if (server) {
          signalGroup(server, "SIGTERM");
        }
      });
    }
    app.once("error", (error) => fail(new Error(`Cannot execute ${binary}: ${error.message}`, { cause: error })));
    app.once("exit", (code) => done(code ?? 1));
  });
}
