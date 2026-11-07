import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";

for (const malformed of [false, true]) {
  test(`native runner check rejects ${malformed ? "invalid JavaScript" : "an empty module audit"}`, () => {
    const root = mkdtempSync(join(tmpdir(), "graph-runner-check-"));
    try {
      mkdirSync(join(root, "scripts"));
      for (const directory of ["guest", "tools", "parity", "unittests"]) {
        mkdirSync(join(root, "native/graph-runner", directory), { recursive: true });
      }
      const script = join(root, "scripts/check-native-graph-runner.mjs");
      copyFileSync(new URL("../check-native-graph-runner.mjs", import.meta.url), script);
      if (malformed) {
        writeFileSync(join(root, "native/graph-runner/guest/bad.mjs"), "export const = ;\n");
      }
      const result = spawnSync(process.execPath, [script], { encoding: "utf8", timeout: 10000 });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1);
      assert.match(result.stderr, malformed ? /SyntaxError/ : /No graph-runner JavaScript modules inspected/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
