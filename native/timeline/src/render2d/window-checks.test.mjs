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
  assert.match(run.stdout, /build\/nodetool-timeline build\/window-checks\/serein\.json --bench --realtime 10 --size 1920x1080 --decode hw --on-top/);
  assert.match(run.stdout, /wait.*load1 <= 10.*15 s.*20 minutes/);
  assert.ok(run.stdout.includes('\\"playSeconds\\":10'), "native metadata records playSeconds:10");
  assert.match(run.stdout, /node src\/render2d\/serein-m0-report\.mjs build\/window-checks/);
});

for (const settles of [false, true]) {
  test(`section 8 ${settles ? "waits for acceptable load" : "refuses a persistently overloaded bench"}`, (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "serein-load-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const source = fs.readFileSync(new URL("../../scripts/window-checks.sh", import.meta.url), "utf8");
    const body = source.slice(source.indexOf("serein_m0() {"), source.indexOf("\nif [[ $dry_run == 1 ]]; then\n    serein_m0"));
    const script = `set -uo pipefail
out="$1"
bin=bench
dry_run=0
load1() { if [[ -f "$out/settled" ]]; then echo 10; else echo 11; fi; }
sleep() { echo "$1" >> "$out/sleeps"; ${settles ? 'touch "$out/settled"' : ':'}; }
node() { echo "$*" >> "$out/node-calls"; }
bench() { echo ran > "$out/bench-called"; }
${body}
serein_m0
`;
    const run = spawnSync("/bin/bash", ["-c", script, "test", root], { encoding: "utf8", timeout: 3000 });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(fs.existsSync(path.join(root, "bench-called")), settles);
    assert.equal(fs.readFileSync(path.join(root, "m0-serein-native.exit"), "utf8").trim(), settles ? "0" : "not run");
    const sleeps = fs.readFileSync(path.join(root, "sleeps"), "utf8").trim().split("\n");
    assert.equal(sleeps.length, settles ? 1 : 80);
    assert.ok(sleeps.every(s => s === "15"));
    if (!settles) assert.match(fs.readFileSync(path.join(root, "m0-serein-native.log"), "utf8"), /load.*10.*20 minutes/);
    const meta = JSON.parse(fs.readFileSync(path.join(root, "m0-serein-native.meta.json"), "utf8"));
    assert.equal(meta.playSeconds, 10);
    assert.equal(meta.loadBefore, settles ? 10 : 11);
  });
}
