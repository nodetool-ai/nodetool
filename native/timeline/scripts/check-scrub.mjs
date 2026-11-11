#!/usr/bin/env node
// Scrub check (PLAN M1d): runs the scripted scrub offscreen
// (`--scrub-script`, no window) and checks the exit criteria:
//   1. paused seeks to exact frames, cold cache: p95 latency under --max-p95-ms,
//      and no seek that never became exact;
//   2. every scrub (60 seeks per second for 10 s) settles on the exact frame
//      of its last request, read back from the burnt-in barcode of its still;
//   3. every seek back to a cached frame is a cache hit and exact on the first
//      frame after it, and the cache never holds more than its 256 MB budget.
// The verdict also fails when the run did not deliver the scripted workload
// (every run, its rate and its duration; every cache trial), when a required
// measurement is missing or not finite, and when the run does not finish
// within --timeout-s (the child is killed).
//
// Usage: node native/timeline/scripts/check-scrub.mjs <fixture.json> --max-p95-ms N
//            [--decode sw|hw|auto] [--script scrub.json] [--timeout-s N] [--json]
// The fixture must have one full-frame numbered clip at 0 with in-point 0.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CACHE_BUDGET_BYTES = 256 * 1024 * 1024;
// The delivered request rate may fall this far below the scripted rate.
export const MIN_RATE_FRACTION = 0.9;

function parseArgs(argv) {
  const args = {
    fixture: null,
    maxP95: null,
    decode: "sw",
    script: path.join(root, "scrub", "m1d.json"),
    timeoutS: 300,
    json: false
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--max-p95-ms") args.maxP95 = Number(argv[++i]);
    else if (argv[i] === "--decode") args.decode = argv[++i];
    else if (argv[i] === "--script") args.script = path.resolve(argv[++i]);
    else if (argv[i] === "--timeout-s") args.timeoutS = Number(argv[++i]);
    else if (argv[i] === "--json") args.json = true;
    else args.fixture = path.resolve(argv[i]);
  }
  if (!args.fixture || !Number.isFinite(args.maxP95) || !(args.timeoutS > 0)) {
    console.error(
      "usage: check-scrub.mjs <fixture.json> --max-p95-ms N [--decode sw|hw|auto] [--script f] [--timeout-s N] [--json]"
    );
    process.exit(2);
  }
  return args;
}

// The barcode in the top rows of a still; the cell width scales with the
// clip's size on the canvas.
function readBarcode(png, cell, canvasWidth) {
  const width = Math.min(Math.round(16 * cell), canvasWidth);
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", png, "-vf", `crop=${width}:${Math.round(cell / 2)}:0:0,format=gray`, "-f", "rawvideo", "-"]);
  const rows = Math.round(cell / 2);
  const y = Math.floor(rows / 2);
  let value = 0;
  for (let k = 0; k < 16; k++) {
    const x = Math.round(cell * k + cell / 2);
    if (x >= width) break;
    if (raw[y * width + x] > 128) value |= 1 << k;
  }
  return value;
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isCount = (v) => Number.isInteger(v) && v >= 0;

// The verdict for one scrub report. `script` is the scrub script the run
// used, `maxP95` the seek limit, and `readStill(path)` returns the barcode of
// a still (masked to the visible bits) or null. Returns the failures.
export function evaluate(report, script, { maxP95, readStill, mask }) {
  const failures = [];
  const need = (ok, what) => {
    if (!ok) failures.push(`missing or invalid measurement: ${what}`);
    return ok;
  };
  const all = (...checks) => checks.every(Boolean);

  // 1. Exact seeks.
  const seekSpec = script.exactSeeks;
  if (seekSpec) {
    const seeks = report.exactSeeks;
    const lat = seeks?.latencyMs;
    const ok = all(
      need(isCount(seeks?.timeouts), "exactSeeks.timeouts"),
      need(isCount(lat?.count) && lat.count > 0, "exactSeeks.latencyMs.count"),
      need(isNum(lat?.p50), "exactSeeks.latencyMs.p50"),
      need(isNum(lat?.p95), "exactSeeks.latencyMs.p95"),
      need(isNum(lat?.max), "exactSeeks.latencyMs.max")
    );
    if (ok) {
      const wanted = seekSpec.count ?? 30;
      if (lat.count + seeks.timeouts !== wanted) failures.push(`${lat.count + seeks.timeouts} exact seeks ran, the script asks ${wanted}`);
      if (seeks.timeouts > 0) failures.push(`${seeks.timeouts} seeks never became exact`);
      if (lat.p95 > maxP95) failures.push(`seek p95 ${lat.p95} ms over ${maxP95} ms`);
    }
  }

  // 2. Scrubs: every configured run, at the scripted rate and duration.
  const scrubSpec = script.scrubs;
  const finals = [];
  if (scrubSpec) {
    const runs = scrubSpec.runs ?? 5;
    const rateHz = scrubSpec.rateHz ?? 60;
    const seconds = scrubSpec.seconds ?? 10;
    const scrubs = Array.isArray(report.scrubs) ? report.scrubs : [];
    if (scrubs.length !== runs) failures.push(`${scrubs.length} scrubs ran, the script asks ${runs}`);
    for (const s of scrubs) {
      const ok = all(
        need(isCount(s.run), "scrubs[].run"),
        need(isNum(s.requestsPerSecond), `scrub ${s.run} requestsPerSecond`),
        need(isNum(s.durationMs), `scrub ${s.run} durationMs`),
        need(isCount(s.finalFrame), `scrub ${s.run} finalFrame`),
        need(typeof s.exact === "boolean", `scrub ${s.run} exact`)
      );
      if (!ok) continue;
      if (s.requestsPerSecond < MIN_RATE_FRACTION * rateHz) {
        failures.push(`scrub ${s.run}: delivered ${s.requestsPerSecond} requests/s, the script asks ${rateHz}`);
      }
      if (s.durationMs < seconds * 1000) failures.push(`scrub ${s.run}: ran ${s.durationMs} ms, the script asks ${seconds * 1000}`);
      const read = s.still ? readStill(s.still) : null;
      const expected = s.finalFrame & mask;
      const pass = s.exact && read === expected;
      if (!pass) failures.push(`scrub ${s.run}: exact ${s.exact}, final frame ${s.finalFrame}, read ${read}`);
      finals.push({ run: s.run, requestsPerSecond: s.requestsPerSecond, finalFrame: s.finalFrame, read, settleMs: s.settleMs, pass });
    }
  }

  // 3. Cache trials: every one completed, a hit, exact on its first frame.
  const cacheSpec = script.cacheSeeks;
  if (cacheSpec) {
    const c = report.cacheSeeks;
    const ok = all(
      need(isCount(c?.attempts), "cacheSeeks.attempts"),
      need(isCount(c?.count), "cacheSeeks.count"),
      need(isCount(c?.prepTimeouts), "cacheSeeks.prepTimeouts"),
      need(isCount(c?.sameFrame), "cacheSeeks.sameFrame"),
      need(isCount(c?.returnHits), "cacheSeeks.returnHits")
    );
    if (ok) {
      const wanted = cacheSpec.count ?? 20;
      if (c.attempts !== wanted) failures.push(`${c.attempts} cache trials ran, the script asks ${wanted}`);
      if (c.prepTimeouts > 0) failures.push(`${c.prepTimeouts} cache trials timed out before the return seek`);
      if (c.count !== c.attempts - c.prepTimeouts) failures.push(`cache trials: ${c.count} completed of ${c.attempts}`);
      if (c.returnHits !== c.count) failures.push(`${c.count - c.returnHits} cache seeks back were not cache hits`);
      if (c.sameFrame !== c.count) failures.push(`${c.count - c.sameFrame} cache seeks were not exact on the first frame`);
    }
  }

  // The cache budget, from the byte counts.
  const cache = report.cache;
  const ok = all(
    need(isNum(cache?.peakBytes), "cache.peakBytes"),
    need(isNum(cache?.residentBytes), "cache.residentBytes"),
    need(isNum(cache?.pinnedElsewhereBytes), "cache.pinnedElsewhereBytes"),
    need(cache?.budgetBytes === CACHE_BUDGET_BYTES, `cache.budgetBytes = ${CACHE_BUDGET_BYTES}`)
  );
  if (ok && cache.peakBytes > cache.budgetBytes) failures.push(`cache peak ${cache.peakBytes} over budget ${cache.budgetBytes}`);

  return { failures, finals };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const doc = JSON.parse(fs.readFileSync(args.fixture, "utf8"));
  const script = JSON.parse(fs.readFileSync(args.script, "utf8"));
  const clip = doc.clips[0];
  const cell = (80 * doc.width) / (clip.width ?? doc.width);
  const visibleBits = Math.min(16, Math.floor((clip.width ?? doc.width) / 80));
  const mask = (1 << visibleBits) - 1;
  const out = path.join(root, "build", "scrub", `${path.basename(args.fixture, ".json")}-${args.decode}`);
  fs.rmSync(out, { recursive: true, force: true });

  const fail = (message) => {
    if (args.json) console.log(JSON.stringify({ fixture: args.fixture, decode: args.decode, verdict: "fail", failures: [message] }));
    else console.error(`check-scrub: FAIL: ${message}`);
    process.exit(1);
  };
  // The run is bounded: a child that does not finish is killed (review F7).
  const child = spawnSync(
    process.env.NT_SCRUB_BINARY ?? path.join(root, "build", "nodetool-timeline"),
    [args.fixture, "--decode", args.decode, "--scrub-script", args.script, "--scrub-out", out, "--json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 24, timeout: args.timeoutS * 1000, killSignal: "SIGKILL" }
  );
  if (child.error?.code === "ETIMEDOUT" || child.signal === "SIGKILL") fail(`the scrub run did not finish within ${args.timeoutS} s and was killed`);
  if (child.error) fail(`the scrub run did not start: ${child.error.message}`);
  if (child.status !== 0) fail(`the scrub run exited ${child.status}: ${String(child.stderr ?? "").trim().split("\n").pop()}`);
  let report;
  try {
    report = JSON.parse(child.stdout.trim().split("\n").pop());
  } catch {
    fail("the scrub run printed no JSON report");
  }

  const { failures, finals } = evaluate(report, script, {
    maxP95: args.maxP95,
    mask,
    readStill: (png) => (fs.existsSync(png) ? readBarcode(png, cell, doc.width) & mask : null)
  });
  const verdict = failures.length === 0 ? "pass" : "fail";
  const seeks = report.exactSeeks;
  const summary = {
    fixture: path.relative(process.cwd(), args.fixture),
    decode: args.decode,
    verdict,
    seekLatencyMs: seeks?.latencyMs ?? null,
    maxP95Ms: args.maxP95,
    scrubs: finals,
    cacheSeeks: report.cacheSeeks,
    cache: report.cache,
    media: report.media,
    liveFrameRefs: report.liveFrameRefs,
    failures
  };
  if (args.json) console.log(JSON.stringify(summary));
  else {
    const mb = (b) => Math.round((b ?? 0) / 1048576);
    console.log(
      `${summary.fixture} (${args.decode}): seek p95 ${seeks?.latencyMs?.p95} ms (limit ${args.maxP95}), ` +
        `${finals.filter((f) => f.pass).length}/${finals.length} scrubs exact, ` +
        `cache ${report.cacheSeeks?.sameFrame}/${report.cacheSeeks?.attempts} same-frame, ` +
        `resident peak ${mb(report.cache?.peakBytes)} MB, pinned elsewhere peak ${mb(report.cache?.peakPinnedElsewhereBytes)} MB`
    );
    for (const m of report.media ?? []) {
      if (m.fallback) console.log(`  media ${m.clipId}: ${m.decoder}, fallback: ${m.fallback}`);
    }
    for (const f of failures) console.log(`  FAIL: ${f}`);
    console.log(verdict === "pass" ? "PASS" : "FAIL");
  }
  process.exit(verdict === "pass" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
