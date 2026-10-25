// node --test native/timeline/scripts/conformance/peaks-check.test.mjs
// Which assets peaks-check.mjs compares, and which fail before any
// comparison, from a loader report (src/server/ServerTimeline.cpp) and the
// raw timeline document it names.
import test from "node:test";
import assert from "node:assert/strict";

import { planPeaksCheck } from "../peaks-check.mjs";

const clip = (id, mediaType, currentAssetId) => ({ id, mediaType, currentAssetId });
const raw = {
  clips: [
    clip("c1", "audio", "a-ok"),
    clip("c2", "audio", "a-failed"),
    clip("c3", "image", "i-failed"),
    clip("c4", "video", "v-noaudio")
  ]
};

// rv2 F3: a failed audio download fails the check.
test("an audio asset whose download failed fails the check", () => {
  const report = {
    assets: [
      { assetId: "a-ok", clips: ["c1"], audio: { variant: "original", path: "/cache/a-ok.wav", cacheHit: true } },
      { assetId: "a-failed", clips: ["c2"], error: "HTTP 500" }
    ]
  };
  const plan = planPeaksCheck(report, raw);
  assert.deepEqual(plan.compare, [{ assetId: "a-ok", path: "/cache/a-ok.wav" }]);
  assert.equal(plan.failures.length, 1);
  assert.match(plan.failures[0], /a-failed/);
  assert.match(plan.failures[0], /HTTP 500/);
});

test("a video asset with no audio file fails the check", () => {
  const report = { assets: [{ assetId: "v-noaudio", clips: ["c4"], picture: { path: "/cache/v.mp4" } }] };
  const plan = planPeaksCheck(report, raw);
  assert.deepEqual(plan.compare, []);
  assert.equal(plan.failures.length, 1);
  assert.match(plan.failures[0], /v-noaudio/);
});

test("an asset that needs no audio is not required", () => {
  const report = { assets: [{ assetId: "i-failed", clips: ["c3"], error: "HTTP 404" }] };
  assert.deepEqual(planPeaksCheck(report, raw), { compare: [], failures: [] });
});

test("without the raw document every failed asset fails", () => {
  const report = {
    assets: [
      { assetId: "a-ok", clips: ["c1"], audio: { path: "/cache/a-ok.wav" } },
      { assetId: "i-failed", clips: ["c3"], error: "HTTP 404" }
    ]
  };
  const plan = planPeaksCheck(report, null);
  assert.deepEqual(plan.compare, [{ assetId: "a-ok", path: "/cache/a-ok.wav" }]);
  assert.equal(plan.failures.length, 1);
  assert.match(plan.failures[0], /i-failed/);
});

test("a report with no asset fails", () => {
  assert.equal(planPeaksCheck({}, raw).failures.length, 1);
});
