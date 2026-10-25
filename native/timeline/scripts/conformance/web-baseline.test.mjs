// node --test native/timeline/scripts/conformance/web-baseline.test.mjs
// The verdict and the frame-error rule of web-baseline.mjs, on mocked
// measurements (no server, no browser).
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fixtureFailures, frameCorrectness, frameIndexAt } from "../web-baseline.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const seed = { label: "video-4tracks", localFile: path.join(here, "..", "..", "fixtures", "video-4tracks.json") };
const web = {
  submittedFrames: 300,
  submitIntervalMs: { count: 299 },
  rafIntervalMs: { count: 299 },
  frameWorkMs: { count: 299 },
  frameError: { count: 299 },
  untimedPresentedFrames: 0,
  decoders: { webcodecs: { count: 4, reasons: [] } }
};
const goodNative = {
  sceneEvalMs: { p50: 0.2, p95: 0.4, frames: 300 },
  uiBench: {
    exit: 0,
    frames: 600,
    frameMs: { p50: 3 },
    renderMs: { p50: 1 },
    guiMs: { p50: 2 },
    compositedFrames: 600,
    drawnMediaFraction: 1
  }
};

// rv2 F2: a native run that failed is a failed fixture.
test("a complete native result passes", () => {
  assert.deepEqual(fixtureFailures("t", "webcodecs", seed, web, goodNative), []);
});

test("a failed native bench fails the fixture", () => {
  const failed = { ...goodNative, uiBench: { exit: 1, error: "no uiBench JSON" } };
  const out = fixtureFailures("t", "webcodecs", seed, web, failed);
  assert.equal(out.length, 1);
  assert.match(out[0], /uiBench/);
});

test("a native bench that exits non-zero with JSON fails the fixture", () => {
  const failed = { ...goodNative, uiBench: { ...goodNative.uiBench, exit: 1 } };
  assert.equal(fixtureFailures("t", "element", seed, web, failed).length, 1);
});

test("missing native results fail the fixture", () => {
  const out = fixtureFailures("t", "element", seed, web, { sceneEvalMs: null, uiBench: null });
  assert.equal(out.length, 2);
  assert.ok(out.some((f) => /sceneEvalMs/.test(f)));
  assert.ok(out.some((f) => /uiBench/.test(f)));
});

test("empty native metrics fail the fixture", () => {
  const empty = { ...goodNative, uiBench: { ...goodNative.uiBench, frameMs: null, compositedFrames: 0 } };
  assert.equal(fixtureFailures("t", "element", seed, web, empty).length, 1);
});

test("an example has no native uiBench to require", () => {
  const example = { label: "example:serein", localFile: path.join(here, "no-such-plan.json") };
  assert.deepEqual(fixtureFailures("t", "element", example, web, { sceneEvalMs: null, uiBench: null }), []);
});

// rv2 F4: the frame error counts in the source's own frames.
const frames = (fps, seconds) => Array.from({ length: Math.round(fps * seconds) }, (_, i) => i / fps);
const presented = (sourceId, target, shown) => ({
  submits: [{ at: 10 }],
  presented: [{ at: 5, source: sourceId, target, shown }]
});

test("frameIndexAt: the last frame at or before the time", () => {
  const t = [0, 0.05, 0.06, 0.2];
  assert.equal(frameIndexAt(t, 0), 0);
  assert.equal(frameIndexAt(t, 0.059), 1);
  assert.equal(frameIndexAt(t, 0.06), 2);
  assert.equal(frameIndexAt(t, 5), 3);
  assert.equal(frameIndexAt(t, -1), 0);
});

test("a 24 fps source on a 30 fps timeline showing its right frame has no error", () => {
  const timing = new Map([["a", frames(24, 2)]]);
  const r = frameCorrectness(presented("a:http://x/a.mp4", 0.07, 1 / 24), (id) => timing.get(id.split(":")[0]));
  assert.deepEqual(r, { errors: [0], held: 0, untimed: 0 });
});

test("a 60 fps source one frame behind is one frame behind", () => {
  const timing = new Map([["a", frames(60, 2)]]);
  const r = frameCorrectness(presented("a:u", 0.5, 29 / 60), (id) => timing.get(id.split(":")[0]));
  assert.deepEqual(r, { errors: [1], held: 1, untimed: 0 });
});

test("a variable-rate source counts its own frames", () => {
  const timing = [0, 0.05, 0.06, 0.2];
  assert.deepEqual(frameCorrectness(presented("a:u", 0.1, 0.06), () => timing), { errors: [0], held: 0, untimed: 0 });
  assert.deepEqual(frameCorrectness(presented("a:u", 0.1, 0.05), () => timing), { errors: [1], held: 1, untimed: 0 });
  assert.deepEqual(frameCorrectness(presented("a:u", 0.1, 0.2), () => timing), { errors: [1], held: 0, untimed: 0 });
});

test("a layer with no known source timing is counted, not guessed", () => {
  const r = frameCorrectness(presented("b:u", 0.1, 0.1), () => null);
  assert.deepEqual(r, { errors: [], held: 0, untimed: 1 });
  const failing = fixtureFailures("t", "webcodecs", seed, { ...web, untimedPresentedFrames: 3 }, goodNative);
  assert.equal(failing.length, 1);
  assert.match(failing[0], /untimed|timing/);
});
