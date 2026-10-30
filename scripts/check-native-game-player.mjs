#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const build = "native/game/build-player";
const prefix = process.env.NODETOOL_GAME_QT_PREFIX;
const testArgs = ["--test-dir", build, "--output-on-failure", "--no-tests=error", "-L", "player"];
const testCommand = process.platform === "linux"
  ? ["xvfb-run", ["-a", "-s", "-screen 0 1920x1080x24", "ctest", ...testArgs]]
  : ["ctest", testArgs];
const testEnvironment = process.platform === "linux"
  ? { ...process.env, QT_QPA_PLATFORM: "xcb", QSG_RHI_BACKEND: process.env.QSG_RHI_BACKEND ?? "vulkan" }
  : process.env;
const commands = [
  [process.execPath, ["--import", "tsx", "packages/protocol/scripts/generate-native-game-schema.ts", "--check"]],
  ["cmake", ["-S", "native/game", "-B", build, "-DCMAKE_BUILD_TYPE=Debug", "-DGAME_BUILD_PLAYER=ON", "-DGAME_BUILD_EDITOR=OFF", ...(prefix ? [`-DCMAKE_PREFIX_PATH=${prefix}`] : [])]],
  ["cmake", ["--build", build, "--parallel", "2"]],
  testCommand
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env: command === testCommand[0] ? testEnvironment : process.env });
  if (result.error || result.status !== 0) {
    process.stderr.write(`Native game player check failed: ${command} ${args.join(" ")}\n`);
    if (result.error) { process.stderr.write(`${result.error.message}\n`); }
    if (command === "cmake" && args.includes("-S")) {
      process.stderr.write("Configuration requires the pinned Qt Quick/ShaderTools development modules. Set NODETOOL_GAME_QT_PREFIX or CMAKE_PREFIX_PATH to the Qt installation.\n");
    } else if (command === testCommand[0]) {
      process.stderr.write("Check the failing test output. GUI tests require a supported graphics device and Xvfb on Linux.\n");
    }
    process.exit(result.status ?? 1);
  }
}
