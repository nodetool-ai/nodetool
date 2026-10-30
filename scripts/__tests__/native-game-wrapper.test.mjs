import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { expect, it } from "vitest";

it.runIf(process.platform === "linux").each(["player", "editor"])("isolates the %s GUI check even when a desktop display is inherited", (target) => {
  const directory = mkdtempSync(join(tmpdir(), "native-check-isolation-"));
  try {
    const log = join(directory, "xvfb-arguments");
    for (const [name, source] of [
      ["cmake", "#!/bin/sh\nexit 0\n"],
      ["ctest", "#!/bin/sh\nexit 91\n"],
      ["xvfb-run", "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$NATIVE_CHECK_LOG\"\n"]
    ]) {
      const path = join(directory, name);
      writeFileSync(path, source); chmodSync(path, 0o755);
    }
    const result = spawnSync(process.execPath, [resolve(`scripts/check-native-game-${target}.mjs`)], {
      cwd: resolve("."), encoding: "utf8",
      env: { ...process.env, PATH: `${directory}${delimiter}${process.env.PATH}`, DISPLAY: ":0", NATIVE_CHECK_LOG: log }
    });
    expect(result.status, result.stderr).toBe(0);
    const arguments_ = readFileSync(log, "utf8").trim().split("\n");
    expect(arguments_.slice(0, 4)).toEqual(["-a", "-s", "-screen 0 1920x1080x24", "ctest"]);
    expect(arguments_.slice(-2)).toEqual(["-L", target]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
