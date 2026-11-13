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
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runApp, startServer, stopServer } from "../../../scripts/dev-server-session.mjs";
import { qtPrefix } from "./check.mjs";
import { editorBinary, isMainModule, readBuildCache, windowsPluginDirectories, windowsRuntimeDirectories } from "./build-config.mjs";

const editorSource = fileURLToPath(new URL("..", import.meta.url));
const root = resolve(editorSource, "../..");
const windows = process.platform === "win32";
const build = process.env.NODETOOL_NODE_EDITOR_BUILD_DIR || join(editorSource, windows ? "build-windows" : "build");
const configuration = process.env.CMAKE_BUILD_TYPE || "Release";
const guest = join(root, "native/graph-runner/build/guest.js");
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
  const server = wantServer ? await startServer(join(build, "server.log")) : undefined;
  try {
    process.exitCode = await runApp(binary, ["--guest-bundle", guest, ...editorArgs], server);
  } finally {
    await stopServer(server);
  }
}

export { stopServer };

if (isMainModule(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(`Native node editor run failed: ${error.message}`);
    process.exitCode = 1;
  }
}
