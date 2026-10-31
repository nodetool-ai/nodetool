#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const build = "native/game/build";
const commands = [
  [process.execPath, ["--import", "tsx", "packages/protocol/scripts/generate-native-game-schema.ts", "--check"]],
  ["cmake", ["-S", "native/game", "-B", build, "-DCMAKE_BUILD_TYPE=Debug", "-DGAME_BUILD_PLAYER=OFF", "-DGAME_BUILD_EDITOR=OFF"]],
  ["cmake", ["--build", build, "--parallel", "2"]],
  ["ctest", ["--test-dir", build, "--output-on-failure", "--no-tests=error"]]
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) {
    process.stderr.write(`Native game check could not run ${command}: ${result.error.message}\n`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.stderr.write(`Native game check failed: ${command} ${args.join(" ")}\n`);
    process.exit(result.status ?? 1);
  }
}
