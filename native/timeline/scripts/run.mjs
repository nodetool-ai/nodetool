// Builds and starts NodeTool Timeline against the development server.
//
//   node native/timeline/scripts/run.mjs [--no-server] [-- app arguments]
//
// Arguments after `--` go to nodetool-timeline, for example
// `-- --server http://127.0.0.1:7777 --timeline <id>` or a timeline JSON file.
//
// The app connects to http://127.0.0.1:7777. When nothing answers there, the
// script starts the development server (scripts/dev-server.mjs) and stops it
// when the app quits. NODETOOL_SERVER_URL points the app at that server, so
// the app does not start a bundled one. --no-server and an app --server
// option skip this.
//
// The first run configures native/timeline/build (README.md, Build) with
// Ninja and the Qt 6.12 from CMAKE_PREFIX_PATH, ~/qt/6.12.* or Homebrew.
// NODETOOL_TIMELINE_BUILD_DIR selects another configured build directory.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runApp, serverUrl, startServer, stopServer } from "../../../scripts/dev-server-session.mjs";

const timelineSource = fileURLToPath(new URL("..", import.meta.url));
const root = resolve(timelineSource, "../..");
const windows = process.platform === "win32";
const build = process.env.NODETOOL_TIMELINE_BUILD_DIR || join(timelineSource, "build");
const configuration = process.env.CMAKE_BUILD_TYPE || "Release";
const usage = "Usage: run.mjs [--no-server] [-- app arguments]";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", cwd: root });
  if (result.error) {
    throw new Error(`Cannot execute ${command}: ${result.error.message}`, { cause: result.error });
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (${result.signal || result.status}).`);
  }
}

// The build rejects every Qt minor version other than 6.12 (CMakeLists.txt).
function qtPrefix() {
  if (process.env.CMAKE_PREFIX_PATH) {
    return process.env.CMAKE_PREFIX_PATH;
  }
  const qtRoot = join(homedir(), "qt");
  const installed = existsSync(qtRoot)
    ? readdirSync(qtRoot).filter((version) => version.startsWith("6.12.")).sort().reverse()
      .flatMap((version) => ["gcc_64", "macos", "msvc2022_64"].map((kit) => join(qtRoot, version, kit)))
      .find(existsSync)
    : undefined;
  if (installed || process.platform !== "darwin") {
    return installed;
  }
  const result = spawnSync("brew", ["--prefix", "qt"], { encoding: "utf8" });
  const prefix = result.status === 0 ? result.stdout.trim() : "";
  return prefix && existsSync(prefix) ? prefix : undefined;
}

function parseArgs(argv) {
  const separator = argv.indexOf("--");
  const own = separator === -1 ? argv : argv.slice(0, separator);
  const appArgs = separator === -1 ? [] : argv.slice(separator + 1);
  const unknown = own.filter((arg) => arg !== "--no-server");
  if (unknown.length > 0) {
    throw new Error(`Unknown option ${unknown[0]}. ${usage}`);
  }
  const serverless = own.includes("--no-server") || appArgs.some((arg) => arg.split("=")[0] === "--server");
  return { startServer: !serverless, appArgs };
}

function timelineBinary() {
  const candidates = windows
    ? [join(build, configuration, "nodetool-timeline.exe"), join(build, "nodetool-timeline.exe")]
    : [join(build, "nodetool-timeline"), join(build, "nodetool-timeline.app/Contents/MacOS/nodetool-timeline")];
  return candidates.find(existsSync);
}

async function main() {
  const { startServer: wantServer, appArgs } = parseArgs(process.argv.slice(2));
  // The install script is written only after successful CMake generation.
  if (!existsSync(join(build, "cmake_install.cmake"))) {
    const prefix = qtPrefix();
    run("cmake", ["-S", timelineSource, "-B", build, "-G", "Ninja", `-DCMAKE_BUILD_TYPE=${configuration}`,
      ...(prefix ? [`-DCMAKE_PREFIX_PATH=${prefix}`] : [])]);
  }
  run("cmake", ["--build", build, "--config", configuration, "--target", "nodetool-timeline"]);
  const binary = timelineBinary();
  if (!binary) {
    throw new Error(`No nodetool-timeline binary in ${build}`);
  }
  const server = wantServer ? await startServer(join(build, "server.log")) : undefined;
  const env = wantServer ? { ...process.env, NODETOOL_SERVER_URL: serverUrl } : process.env;
  try {
    process.exitCode = await runApp(binary, appArgs, server, { env });
  } finally {
    await stopServer(server);
  }
}

try {
  await main();
} catch (error) {
  console.error(`Native timeline run failed: ${error.message}`);
  process.exitCode = 1;
}
