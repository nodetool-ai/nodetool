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
  const plan = planPeaksCheck(report, { clips: raw.clips.slice(0, 2) });
  assert.deepEqual(plan.compare, [{ assetId: "a-ok", path: "/cache/a-ok.wav" }]);
  assert.equal(plan.failures.length, 1);
  assert.match(plan.failures[0], /a-failed/);
  assert.match(plan.failures[0], /HTTP 500/);
});

test("a video asset with no audio file fails the check", () => {
  const report = { assets: [{ assetId: "v-noaudio", clips: ["c4"], picture: { path: "/cache/v.mp4" } }] };
  const plan = planPeaksCheck(report, { clips: [raw.clips[3]] });
  assert.deepEqual(plan.compare, []);
  assert.equal(plan.failures.length, 1);
  assert.match(plan.failures[0], /v-noaudio/);
});

test("an asset that needs no audio is not required", () => {
  const report = { assets: [{ assetId: "i-failed", clips: ["c3"], error: "HTTP 404" }] };
  assert.deepEqual(planPeaksCheck(report, { clips: [raw.clips[2]] }), { compare: [], failures: [] });
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
  assert.equal(planPeaksCheck({}, null).failures.length, 1);
});

// rv2 F3: reconcile required clips, including loader omissions.
const okAsset = { assetId: "a-ok", clips: ["c1"], audio: { path: "/cache/a-ok.wav" } };
for (const mediaType of ["audio", "video", "image"]) {
  test(`rv2 F3: ${mediaType} clip only in missingAssets`, () => {
    const report = {
      assets: [okAsset],
      missingAssets: [{ clipId: "missing", assetId: "lost", reason: "download refused" }]
    };
    const document = { clips: [clip("c1", "audio", "a-ok"), clip("missing", mediaType, "lost")] };
    const plan = planPeaksCheck(report, document);
    assert.deepEqual(plan.compare, [{ assetId: "a-ok", path: "/cache/a-ok.wav" }]);
    assert.equal(plan.failures.length, mediaType === "image" ? 0 : 1);
    if (mediaType !== "image") {
      assert.match(plan.failures[0], /missing/);
      assert.match(plan.failures[0], /download refused/);
    }
  });
}
test("rv2 F3: missingAssets fail without the raw document", () => {
  const plan = planPeaksCheck({ assets: [okAsset], missingAssets: [{ clipId: "lost", reason: "no reference" }] }, null);
  assert.equal(plan.failures.length, 1);
  assert.match(plan.failures[0], /lost.*no reference/);
});
test("rv2 F3: required audio clip absent from the loader report fails", () => {
  const plan = planPeaksCheck({ assets: [okAsset] }, { clips: [clip("c1", "audio", "a-ok"), clip("absent", "audio", "lost")] });
  assert.equal(plan.failures.length, 1);
  assert.match(plan.failures[0], /absent.*not in the loader report/);
});
test("rv2 F3: a clip listed in both failed assets and missingAssets fails once", () => {
  const plan = planPeaksCheck({
    assets: [okAsset, { assetId: "lost", clips: ["missing"], error: "no download" }],
    missingAssets: [{ clipId: "missing", assetId: "lost", reason: "no reference" }]
  }, { clips: [clip("c1", "audio", "a-ok"), clip("missing", "audio", "lost")] });
  assert.equal(plan.failures.length, 1);
  assert.match(plan.failures[0], /missing.*no reference/);
});

test("rv2 F3: duplicate missing and failed clips fail once without a document", () => {
  const plan = planPeaksCheck({
    assets: [okAsset, { assetId: "lost", clips: ["missing"], error: "no download" }],
    missingAssets: [
      { clipId: "missing", reason: "no reference" },
      { clipId: "missing", reason: "no reference" }
    ]
  }, null);
  assert.equal(plan.failures.length, 1);
  assert.match(plan.failures[0], /missing.*no reference/);
});
