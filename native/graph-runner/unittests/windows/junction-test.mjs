import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "node-editor-junction-"));
try {
  const granted = join(root, "granted");
  const outside = join(root, "outside");
  mkdirSync(granted);
  mkdirSync(outside);
  writeFileSync(join(outside, "sentinel"), "unchanged");
  symlinkSync(outside, join(granted, "junction"), "junction");
  // A junction that stays inside the root: only noSymlinks refuses it.
  mkdirSync(join(granted, "target"));
  writeFileSync(join(granted, "target", "file"), "inside");
  symlinkSync(join(granted, "target"), join(granted, "inner"), "junction");
  const result = spawnSync(process.argv[2], [granted], { encoding: "utf8" });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  assert.equal(result.status, 0);
} finally {
  rmSync(root, { recursive: true, force: true });
}
