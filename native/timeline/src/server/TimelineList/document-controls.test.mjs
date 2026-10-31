import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("document controls preserve verbose child output without killing the child", () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "nt-controls-output-"));
  try {
    const preload = path.join(work, "verbose.cjs");
    fs.writeFileSync(preload, `if (process.env.NT_TIMELINE_DOCUMENT_CHECK) {
      require("node:fs").writeFileSync(2, Buffer.alloc(2 * 1024 * 1024, 120));
      process.exit(0);
    }`);
    const result = spawnSync(process.execPath,
      [fileURLToPath(new URL("document-controls.mjs", import.meta.url)), process.execPath], {
        encoding: "utf8", timeout: 30000, maxBuffer: 24 * 1024 * 1024,
        env: { ...process.env, TMPDIR: work, TMP: work, TEMP: work,
          NT_TIMELINE_DOCUMENT_CHECK: "", NODE_OPTIONS: `--require ${JSON.stringify(preload)}` }
      });
    assert.equal(result.status, 0, `${result.error?.message ?? ""}\n${result.stderr?.slice(-1000)}`);
    assert.match(result.stdout, /PASS controls-menu/);
    assert.match(result.stdout, /PASS keyboard/);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});
