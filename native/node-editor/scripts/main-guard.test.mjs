import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const scripts = fileURLToPath(new URL(".", import.meta.url));

// A checkout reached through a symlink gives process.argv[1] the link path
// while import.meta.url holds the real path. The launchers must still run.
for (const [script, failure] of [["run.mjs", "Native node editor run failed"], ["check.mjs", "Native node editor check failed"]]) {
  test(`${script} runs when started through a symlinked directory`, () => {
    const dir = mkdtempSync(join(tmpdir(), "node-editor-guard-"));
    try {
      const linked = join(dir, "scripts");
      symlinkSync(scripts, linked, process.platform === "win32" ? "junction" : "dir");
      // An unknown option fails before any build step, so the test needs no toolchain.
      const result = spawnSync(process.execPath, [join(linked, script), "--not-an-option"], { encoding: "utf8", timeout: 10000 });
      assert.equal(result.status, 1, `stdout: ${result.stdout}\nstderr: ${result.stderr}`);
      assert.match(result.stderr, new RegExp(failure));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
