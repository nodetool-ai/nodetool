import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const editorSource = fileURLToPath(new URL("..", import.meta.url));

function qtPrefix() {
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
export function check({ source = editorSource, build = process.env.NODETOOL_NODE_EDITOR_BUILD_DIR || join(source, "build") } = {}) {
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
  console.log("Native node editor prerequisites: CMake >= 3.24, Ninja, C++20 compiler, Qt >= 6.12 (Core, Gui, Widgets, QuickWidgets, Qml, Quick, QuickControls2, Svg, Network, WebSockets, Test). QtNodes needs Git and network access on first configure, or a populated FetchContent cache.");
  run("cmake", ["--version"]);
  run("ctest", ["--version"]);
  run("ninja", ["--version"]);
  const prefix = qtPrefix();
  console.log(`Qt prefix: ${prefix || "CMake default search paths (set CMAKE_PREFIX_PATH if Qt is not found)"}`);
  run("cmake", ["-S", source, "-B", build, "-G", "Ninja", "-DCMAKE_BUILD_TYPE=Release", "-DBUILD_TESTING=ON", ...(prefix ? [`-DCMAKE_PREFIX_PATH=${prefix}`] : [])]);
  run("cmake", ["--build", build, "--parallel", "2"]);
  run("ctest", ["--test-dir", build, "--output-on-failure", "--no-tests=error", "--timeout", "120"], {
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
