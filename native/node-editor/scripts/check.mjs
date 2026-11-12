import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readBuildCache, windowsPluginDirectories, windowsRuntimeDirectories } from "./build-config.mjs";

const editorSource = fileURLToPath(new URL("..", import.meta.url));

export function qtPrefix() {
  if (process.env.CMAKE_PREFIX_PATH) {
    return process.env.CMAKE_PREFIX_PATH;
  }
  const qtRoot = join(homedir(), "qt");
  return existsSync(qtRoot)
    ? readdirSync(qtRoot).filter((version) => version.startsWith("6.12."))
      .sort().reverse().flatMap((version) =>
        ["gcc_64", "macos", "msvc2022_64"].map((kit) => join(qtRoot, version, kit)))
      .find(existsSync)
    : undefined;
}

// The source override lets the regression suite exercise real CMake/CTest failures.
export function check({ source = editorSource, build = process.env.NODETOOL_NODE_EDITOR_BUILD_DIR || join(source, process.platform === "win32" ? "build-windows" : "build") } = {}) {
  const cache = readBuildCache(build);
  const cmake = cache.CMAKE_COMMAND || "cmake";
  const ctest = cache.CMAKE_CTEST_COMMAND || "ctest";
  const configuration = process.env.CMAKE_BUILD_TYPE || "Release";
  function run(command, args, env = {}) {
    const result = spawnSync(command, args, {
      stdio: "inherit",
      env: { ...process.env, ...env }
    });
    if (result.error) {
      throw new Error(`Cannot execute ${command}: ${result.error.message}`, { cause: result.error });
    }
    if (result.status !== 0) {
      throw new Error(`${command} ${args.join(" ")} failed (${result.signal || result.status}).`);
    }
  }
  console.log("Native node editor prerequisites: CMake >= 3.28, C++20 compiler, Qt >= 6.12 including Multimedia, and the graph runner's native dependencies. QtNodes needs Git and network access on first configure, or a populated FetchContent cache.");
  run(cmake, ["--version"]);
  run(ctest, ["--version"]);
  const prefix = qtPrefix();
  console.log(`Qt prefix: ${prefix || "CMake default search paths (set CMAKE_PREFIX_PATH if Qt is not found)"}`);
  run(cmake, ["-S", source, "-B", build,
    ...(cache.CMAKE_GENERATOR ? [] : ["-G", process.platform === "win32" ? "Visual Studio 17 2022" : "Ninja"]),
    `-DCMAKE_BUILD_TYPE=${configuration}`, "-DBUILD_TESTING=ON", ...(prefix ? [`-DCMAKE_PREFIX_PATH=${prefix}`] : [])]);
  run(cmake, ["--build", build, "--config", configuration, "--parallel", "2"]);
  const runtimeCache = readBuildCache(build);
  run(ctest, ["--test-dir", build, "-C", configuration, "--output-on-failure", "--no-tests=error", "--timeout", "120"], {
    ...(process.platform === "win32" ? {
      PATH: [...windowsRuntimeDirectories(runtimeCache), process.env.PATH ?? ""].join(";"),
      QT_PLUGIN_PATH: [...windowsPluginDirectories(runtimeCache), process.env.QT_PLUGIN_PATH].filter(Boolean).join(";")
    } : {}),
    QT_QPA_PLATFORM: "offscreen",
    QSG_RHI_BACKEND: "software",
    QT_QUICK_BACKEND: "software"
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) {
      throw new Error("Usage: node native/node-editor/scripts/check.mjs (configure paths through CMAKE_PREFIX_PATH and NODETOOL_NODE_EDITOR_BUILD_DIR)");
    }
    check();
  } catch (error) {
    console.error(`Native node editor check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
