// Builds and starts the native node editor with the graph runner guest bundle.
//
//   node native/node-editor/scripts/run.mjs [--rebuild-guest] [--no-server] [-- editor arguments]
//
// The build directory is the one check.mjs uses, so the two share artifacts.
// Arguments after `--` go to nodetool-node-editor, for example
// `-- --offline --open workflow.json`.
//
// An interactive start connects to http://localhost:7777. When nothing answers
// there, the script starts the development server (scripts/dev-server.mjs)
// and stops it when the editor quits. --no-server, --offline, --server and the
// headless editor options skip this.
import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { qtPrefix } from "./check.mjs";
import { editorBinary, isMainModule, readBuildCache, windowsPluginDirectories, windowsRuntimeDirectories } from "./build-config.mjs";

const editorSource = fileURLToPath(new URL("..", import.meta.url));
const root = resolve(editorSource, "../..");
const windows = process.platform === "win32";
const build = process.env.NODETOOL_NODE_EDITOR_BUILD_DIR || join(editorSource, windows ? "build-windows" : "build");
const configuration = process.env.CMAKE_BUILD_TYPE || "Release";
const guest = join(root, "native/graph-runner/build/guest.js");
const serverUrl = "http://127.0.0.1:7777";
const serverStartTimeoutMs = 120_000;
const usage = "Usage: run.mjs [--rebuild-guest] [--no-server] [-- editor arguments]";
// Editor options that connect elsewhere or run without a server (src/main.cpp).
const serverlessEditorOptions = ["--offline", "--server", "--screenshot", "--dump", "--save", "--replay"];

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", cwd: root });
  if (result.error) {
    throw new Error(`Cannot execute ${command}: ${result.error.message}`, { cause: result.error });
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (${result.signal || result.status}).`);
  }
}

// Homebrew installs ICU keg-only, outside CMake's search paths.
function homebrewIcu() {
  if (process.platform !== "darwin") {
    return undefined;
  }
  const result = spawnSync("brew", ["--prefix", "icu4c"], { encoding: "utf8" });
  const prefix = result.status === 0 ? result.stdout.trim() : "";
  return prefix && existsSync(prefix) ? prefix : undefined;
}

function parseArgs(argv) {
  const separator = argv.indexOf("--");
  const own = separator === -1 ? argv : argv.slice(0, separator);
  const editorArgs = separator === -1 ? [] : argv.slice(separator + 1);
  const unknown = own.filter((arg) => arg !== "--rebuild-guest" && arg !== "--no-server");
  if (unknown.length > 0) {
    throw new Error(`Unknown option ${unknown[0]}. ${usage}`);
  }
  const serverless = own.includes("--no-server") ||
    editorArgs.some((arg) => serverlessEditorOptions.includes(arg.split("=")[0]));
  return { rebuildGuest: own.includes("--rebuild-guest"), startServer: !serverless, editorArgs };
}

// The user's database in the NodeTool data folder, as getNodetoolDataDir in
// packages/config/src/paths.ts finds it. The editor's local runs read assets
// and workspaces from the same folder. A checkout's .env can name another
// database (.env.example sets ./nodetool.db), so the server gets this one
// unless the shell sets DB_PATH or DATABASE_URL.
function databaseEnv() {
  if (process.env.DB_PATH?.trim() || process.env.DATABASE_URL?.trim()) {
    return {};
  }
  const dataDir = process.platform === "win32"
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
async function startServer() {
  if (await serverReady()) {
    console.log(`Using the server at ${serverUrl}`);
    return undefined;
  }
  const log = join(build, "server.log");
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

function signalGroup(server, signal) {
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

function runEditor(binary, args, server) {
  return new Promise((done, fail) => {
    const editor = spawn(binary, args, { stdio: "inherit" });
    // Ctrl-C reaches the editor, which quits, and the caller then stops the server.
    process.on("SIGINT", () => {});
    for (const signal of ["SIGTERM", "SIGHUP"]) {
      process.on(signal, () => {
        editor.kill(signal);
        if (server) {
          signalGroup(server, "SIGTERM");
        }
      });
    }
    editor.once("error", (error) => fail(new Error(`Cannot execute ${binary}: ${error.message}`, { cause: error })));
    editor.once("exit", (code) => done(code ?? 1));
  });
}

async function main() {
  const { rebuildGuest, startServer: wantServer, editorArgs } = parseArgs(process.argv.slice(2));
  const cache = readBuildCache(build);
  const cmake = cache.CMAKE_COMMAND || "cmake";
  if (rebuildGuest || !existsSync(guest)) {
    console.log("Building the graph runner guest bundle");
    run(process.execPath, ["native/graph-runner/guest/build.mjs"]);
  }
  // The install script is written only after successful CMake generation, for every generator.
  if (!existsSync(join(build, "cmake_install.cmake"))) {
    // ICU_ROOT is not enough: the SDK's partial unicode/ headers would still win the include search.
    const prefixes = [qtPrefix(), homebrewIcu()].filter(Boolean);
    run(cmake, ["-S", editorSource, "-B", build,
      ...(cache.CMAKE_GENERATOR ? [] : ["-G", windows ? "Visual Studio 17 2022" : "Ninja", ...(windows ? ["-A", "x64"] : [])]),
      `-DCMAKE_BUILD_TYPE=${configuration}`, "-DBUILD_TESTING=ON",
      ...(prefixes.length > 0 ? [`-DCMAKE_PREFIX_PATH=${prefixes.join(";")}`] : [])]);
  }
  run(cmake, ["--build", build, "--config", configuration, "--target", "nodetool-node-editor"]);
  const binary = editorBinary(build, configuration);
  if (!binary) {
    throw new Error(`No nodetool-node-editor binary in ${build}`);
  }
  if (windows) {
    const runtimeCache = readBuildCache(build);
    process.env.PATH = [...windowsRuntimeDirectories(runtimeCache), process.env.PATH ?? ""].join(";");
    process.env.QT_PLUGIN_PATH = [...windowsPluginDirectories(runtimeCache), process.env.QT_PLUGIN_PATH].filter(Boolean).join(";");
  }
  const server = wantServer ? await startServer() : undefined;
  try {
    process.exitCode = await runEditor(binary, ["--guest-bundle", guest, ...editorArgs], server);
  } finally {
    await stopServer(server);
  }
}

if (isMainModule(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(`Native node editor run failed: ${error.message}`);
    process.exitCode = 1;
  }
}
