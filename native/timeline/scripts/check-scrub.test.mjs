// node --test native/timeline/scripts/check-scrub.test.mjs
// The scrub verdict fails on every way a run can miss its workload or its
// measurements (M1d review F4, F5, F6), and a run that does not finish is
// killed with a fail verdict (F7).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { CACHE_BUDGET_BYTES, evaluate } from "./check-scrub.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = {
  exactSeeks: { count: 4 },
  cacheSeeks: { count: 2 },
  scrubs: { runs: 2, rateHz: 60, seconds: 10 }
};

function goodReport() {
  return {
    exactSeeks: { latencyMs: { p50: 10, p95: 20, max: 30, count: 4 }, timeouts: 0 },
    cacheSeeks: { attempts: 2, count: 2, prepTimeouts: 0, sameFrame: 2, returnHits: 2 },
    scrubs: [0, 1].map((run) => ({
      run,
      requests: 600,
      requestsPerSecond: 60,
      durationMs: 10000,
      finalFrame: 42 + run,
      exact: true,
      still: `still-${42 + run}`
    })),
    cache: { residentBytes: 1, peakBytes: 100, pinnedElsewhereBytes: 0, budgetBytes: CACHE_BUDGET_BYTES }
  };
}

const opts = { maxP95: 100, mask: 0xff, readStill: (p) => Number(p.split("-")[1]) };
const failuresOf = (report) => evaluate(report, script, opts).failures;

test("a complete report passes", () => {
  assert.deepEqual(failuresOf(goodReport()), []);
});

test("F6: a missing or non-finite measurement fails", () => {
  const noP95 = goodReport();
  delete noP95.exactSeeks.latencyMs.p95;
  assert.match(failuresOf(noP95).join("\n"), /exactSeeks.latencyMs.p95/);
  const nanPeak = goodReport();
  nanPeak.cache.peakBytes = Number.NaN;
  assert.match(failuresOf(nanPeak).join("\n"), /cache.peakBytes/);
  const otherBudget = goodReport();
  otherBudget.cache.budgetBytes = 2 * CACHE_BUDGET_BYTES;
  otherBudget.cache.peakBytes = 1.5 * CACHE_BUDGET_BYTES;
  assert.match(failuresOf(otherBudget).join("\n"), /cache.budgetBytes/);
  const noTimeouts = goodReport();
  delete noTimeouts.exactSeeks.timeouts;
  assert.match(failuresOf(noTimeouts).join("\n"), /exactSeeks.timeouts/);
});

test("F4: a run that does not deliver the scripted scrub fails", () => {
  const slow = goodReport();
  slow.scrubs[0].requestsPerSecond = 0;
  assert.match(failuresOf(slow).join("\n"), /delivered 0 requests\/s/);
  const short = goodReport();
  short.scrubs[1].durationMs = 4000;
  assert.match(failuresOf(short).join("\n"), /ran 4000 ms/);
  const fewer = goodReport();
  fewer.scrubs.pop();
  assert.match(failuresOf(fewer).join("\n"), /1 scrubs ran, the script asks 2/);
  const seeks = goodReport();
  seeks.exactSeeks.latencyMs.count = 3;
  assert.match(failuresOf(seeks).join("\n"), /3 exact seeks ran/);
});

test("F5: every cache trial completes, hits and is exact", () => {
  const oneTrialNoHit = goodReport();
  oneTrialNoHit.cacheSeeks = { attempts: 2, count: 1, prepTimeouts: 1, sameFrame: 1, returnHits: 0 };
  const text = failuresOf(oneTrialNoHit).join("\n");
  assert.match(text, /1 cache trials timed out/);
  assert.match(text, /1 cache seeks back were not cache hits/);
  const fewer = goodReport();
  fewer.cacheSeeks.attempts = 1;
  fewer.cacheSeeks.count = 1;
  fewer.cacheSeeks.sameFrame = 1;
  fewer.cacheSeeks.returnHits = 1;
  assert.match(failuresOf(fewer).join("\n"), /1 cache trials ran, the script asks 2/);
});

test("a wrong final frame fails", () => {
  const wrong = goodReport();
  wrong.scrubs[0].still = "still-41";
  assert.match(failuresOf(wrong).join("\n"), /final frame 42, read 41/);
});

test("F7: a run that does not finish is killed and fails", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "check-scrub-"));
  const hang = path.join(dir, "hang.sh");
  fs.writeFileSync(hang, "#!/bin/sh\nexec sleep 60\n", { mode: 0o755 });
  const t0 = Date.now();
  const r = spawnSync(
    process.execPath,
    [path.join(here, "check-scrub.mjs"), path.join(here, "..", "fixtures", "video-scrub-intra.json"), "--max-p95-ms", "30", "--timeout-s", "1", "--json"],
    { encoding: "utf8", env: { ...process.env, NT_SCRUB_BINARY: hang } }
  );
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 1);
  assert.ok(Date.now() - t0 < 10000);
  const verdict = JSON.parse(r.stdout.trim());
  assert.equal(verdict.verdict, "fail");
  assert.match(verdict.failures[0], /did not finish within 1 s and was killed/);
});
