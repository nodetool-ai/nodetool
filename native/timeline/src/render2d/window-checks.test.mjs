import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

test("window checks dry run prints section 8 and executes no checks or idle wait", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "serein-dry-run-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const dir of ["scripts", "build", "guards"]) fs.mkdirSync(path.join(root, dir));
  fs.copyFileSync(new URL("../../scripts/window-checks.sh", import.meta.url), path.join(root, "scripts/window-checks.sh"));
  // Run an isolated copy. Even a broken dry run cannot reach a real bench,
  // browser, server, audio device, or the developer's existing output.
  const guard = '#!/bin/sh\nprintf "%s\\n" "$0 $*" >> "$CALLS"\nexit 97\n';
  for (const command of ["node", "sysctl", "sleep", "rm", "mkdir", "cp", "ps"]) {
    fs.writeFileSync(path.join(root, "guards", command), guard, { mode: 0o755 });
  }
  fs.writeFileSync(path.join(root, "build/nodetool-timeline"), guard, { mode: 0o755 });
  const calls = path.join(root, "calls");
  const run = spawnSync("/bin/bash", [path.join(root, "scripts/window-checks.sh"), "--dry-run"], {
    encoding: "utf8", timeout: 3000, env: { ...process.env, PATH: `${root}/guards:${process.env.PATH}`, CALLS: calls }
  });
  assert.equal(run.error, undefined);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(fs.existsSync(calls), false, fs.existsSync(calls) ? fs.readFileSync(calls, "utf8") : "");
  assert.equal(fs.existsSync(path.join(root, "build/window-checks")), false);
  assert.match(run.stdout, /8\. M0 serein, native against the web/);
  assert.match(run.stdout, /node src\/render2d\/example-sequence\.mjs serein build\/window-checks\/serein\.json/);
  assert.match(run.stdout, /build\/nodetool-timeline build\/window-checks\/serein\.json --bench --realtime 15 --size 1920x1080 --decode hw --on-top/);
  assert.match(run.stdout, /node src\/render2d\/serein-m0-report\.mjs build\/window-checks/);
});
