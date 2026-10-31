#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const environment = { ...process.env, NODETOOL_NATIVE_GAME_WORKER: resolve(root, "native/game/build", process.platform === "win32" ? "game-worker.exe" : "game-worker") };
// Graphical capability checks run with the Qt delivery check rather than the portable tool check.
delete environment.NODETOOL_NATIVE_GAME_PLAYER;
delete environment.NODETOOL_NATIVE_GAME_RUNTIME_DIR;
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const commands = [
  [process.execPath, ["scripts/check-native-game.mjs"]],
  [npm, ["run", "test", "--workspace=packages/game-runtime", "--", "native-cpp.test.ts", "native-editor-client.test.ts"]],
  [npm, ["run", "test", "--workspace=packages/cli-game", "--", "game-native-cpp.test.ts"]],
  [npm, ["run", "test", "--workspace=packages/agents", "--", "capabilities-native-cpp-game.test.ts"]]
];
for (const [command, args] of commands) {
  const result = spawnSync(command, args, { cwd: root, env: environment, stdio: "inherit", shell: process.platform === "win32" && command === npm });
  if (result.error || result.status !== 0) {
    process.stderr.write(`Native game service check failed: ${command} ${args.join(" ")}\n`);
    if (result.error) { process.stderr.write(`${result.error.message}\n`); }
    process.exit(result.status ?? 1);
  }
}
