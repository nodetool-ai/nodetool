#!/usr/bin/env node
// Group surface check (DESIGN.md D35, the M1e surface review F1 and F2):
//   1. each group fixture matches the export (`compare-golden.mjs`, PSNR at
//      least 40 dB) and renders the expected number of surfaces at its frame
//      (the scrub runner's `frames` report);
//   2. an injected surface allocation failure (NT_TEST_FAIL_SURFACES=1) is not
//      a finished frame: the frame is not exact and reports the failure, and
//      a still run exits 1 (not a crash, a signal or a timeout) with the
//      reason.
//
// Usage: node native/timeline/scripts/check-group-surfaces.mjs [--bin PATH] [--decode sw|hw|auto] [--json]
// --bin is the nodetool-timeline binary under test (default: the newest
// build*/nodetool-timeline); every run, the golden comparison included, uses
// it. A binary older than its sources is refused.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { newestBinary, staleSources } from "./plan-compare.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = { bin: null, decode: "auto", json: false };
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--bin") args.bin = path.resolve(process.argv[++i]);
  else if (process.argv[i] === "--decode") args.decode = process.argv[++i];
  else if (process.argv[i] === "--json") args.json = true;
  else {
    console.error(`check-group-surfaces: unknown argument ${process.argv[i]}`);
    process.exit(2);
  }
}
const bin = args.bin ?? newestBinary(root);
if (!bin || !fs.existsSync(bin)) {
  console.error(`check-group-surfaces: no binary at ${bin ?? "build*/nodetool-timeline"} (pass --bin)`);
  process.exit(2);
}
const stale = staleSources(root, bin);
if (stale.length > 0) {
  console.error(`check-group-surfaces: ${bin} is older than ${stale.length} source file(s), newest ${stale[0]}; rebuild it or pass --bin`);
  process.exit(2);
}

// Fixture, frame, and the surfaces that frame must draw.
const cases = [
  { fixture: "video-group-opacity.json", frame: 15, surfaces: 1 },
  { fixture: "video-group-stacking.json", frame: 15, surfaces: 1 },
  { fixture: "video-group-cut-push.json", frame: 15, surfaces: 1 },
  { fixture: "video-group-nested.json", frame: 15, surfaces: 2 },
  { fixture: "video-group-tie.json", frame: 15, surfaces: 1 },
  { fixture: "video-group-tie-below.json", frame: 15, surfaces: 1 },
  { fixture: "video-group-empty.json", frame: 15, surfaces: 0 }
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "group-surfaces-"));
const run = (cmd, argv, env = {}) =>
  spawnSync(cmd, argv, { encoding: "utf8", timeout: 300000, killSignal: "SIGKILL", env: { ...process.env, ...env } });

// The scrub runner's frame report for one frame.
function frameReport(fixture, frame, env = {}) {
  const script = path.join(tmp, "frames.json");
  fs.writeFileSync(script, JSON.stringify({ frames: [frame] }));
  const r = run(bin, [fixture, "--decode", args.decode, "--scrub-script", script, "--scrub-out", tmp, "--json"], env);
  try {
    return JSON.parse(r.stdout.trim().split("\n").pop()).frames?.[0] ?? null;
  } catch {
    return null;
  }
}

const results = [];
for (const c of cases) {
  const fixture = path.join(root, "fixtures", c.fixture);
  const failures = [];
  const golden = run(process.execPath, [
    path.join(root, "scripts", "compare-golden.mjs"), fixture, "--bin", bin, "--frames", String(c.frame), "--min-psnr", "40", "--decode", args.decode, "--json"
  ]);
  let psnr = null;
  try {
    const g = JSON.parse(golden.stdout.trim().split("\n").pop());
    psnr = g.results?.[0]?.psnr ?? null;
    if (g.verdict !== "pass") failures.push(`golden: PSNR ${psnr} under 40 dB`);
  } catch {
    failures.push(`golden: no verdict (exit ${golden.status}): ${String(golden.stderr).trim().split("\n").pop()}`);
  }
  const f = frameReport(fixture, c.frame);
  if (!f) failures.push("no frame report");
  else {
    if (!f.exact) failures.push("the frame never became exact");
    if (f.surfaces !== c.surfaces) failures.push(`${f.surfaces} surfaces drawn, expected ${c.surfaces}`);
    if (f.resourceFailures !== 0) failures.push(`${f.resourceFailures} resource failures`);
  }
  results.push({ case: c.fixture, frame: c.frame, psnr, surfaces: f?.surfaces ?? null, pass: failures.length === 0, failures });
}

// The injected failure: a surface that cannot be allocated.
{
  const fixture = path.join(root, "fixtures", "video-group-opacity.json");
  const failures = [];
  const f = frameReport(fixture, 15, { NT_TEST_FAIL_SURFACES: "1" });
  if (!f) failures.push("no frame report");
  else {
    if (f.exact) failures.push("the frame counts as exact with its group missing");
    if (!(f.resourceFailures > 0)) failures.push("the frame reports no resource failure");
  }
  const stills = run(bin, [fixture, "--decode", args.decode, "--stills", path.join(tmp, "stills"), "--still-frames", "15"], {
    NT_TEST_FAIL_SURFACES: "1"
  });
  // Exit 1 exactly: a hang (killed at the timeout), a signal or a crash is
  // not the reported failure (review F6).
  if (stills.error) failures.push(`the still run did not finish: ${stills.error.message}`);
  else if (stills.signal) failures.push(`the still run ended by ${stills.signal}`);
  else if (stills.status !== 1) failures.push(`the still run exited ${stills.status}, expected 1`);
  else if (!/surface/i.test(stills.stderr)) failures.push(`the still run gave no reason: ${String(stills.stderr).trim().split("\n").pop()}`);
  results.push({ case: "injected surface failure", pass: failures.length === 0, failures });
}
fs.rmSync(tmp, { recursive: true, force: true });

const verdict = results.every((r) => r.pass) ? "pass" : "fail";
if (args.json) console.log(JSON.stringify({ bin, decode: args.decode, verdict, results }));
else {
  console.log(`binary: ${bin}`);
  for (const r of results) {
    console.log(`${r.pass ? "ok  " : "FAIL"} ${r.case}${r.psnr != null ? ` (PSNR ${r.psnr}, surfaces ${r.surfaces})` : ""}`);
    for (const f of r.failures) console.log(`       ${f}`);
  }
  console.log(verdict === "pass" ? "PASS" : "FAIL");
}
process.exit(verdict === "pass" ? 0 : 1);
