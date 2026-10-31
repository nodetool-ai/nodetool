#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const commands = [
  ["scripts/check-native-game-player.mjs"],
  ["native/game/scripts/check-delivery.mjs", "native/game/build-player"]
];
for (const args of commands) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });
  if (result.error || result.status !== 0) {
    process.stderr.write(`Native game delivery check failed: node ${args.join(" ")}\n`);
    if (result.error) { process.stderr.write(`${result.error.message}\n`); }
    process.exit(result.status ?? 1);
  }
}
