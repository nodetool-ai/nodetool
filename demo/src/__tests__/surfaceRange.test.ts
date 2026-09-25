import assert from "node:assert/strict";
import test from "node:test";
import {
  surfaceCastTimeMs,
  surfaceRangeFrames
} from "../hero/surfaceRange";

test("a selected four-second surface range plays at normal speed", () => {
  const frames = surfaceRangeFrames(0, 4000);
  assert.equal(frames, 120);
  assert.equal(surfaceCastTimeMs(0, 30, frames, 0, 4000, true), 0);
  assert.equal(surfaceCastTimeMs(60, 30, frames, 0, 4000, true), 2000);
  assert.equal(surfaceCastTimeMs(119, 30, frames, 0, 4000, true), 119000 / 30);
});

test("a compressed cast reaches its end on the last output frame", () => {
  const frames = 80;
  assert.equal(surfaceCastTimeMs(0, 30, frames, 1500, 11400, false), 1500);
  assert.equal(surfaceCastTimeMs(79, 30, frames, 1500, 11400, false), 11400);
  assert.equal(surfaceCastTimeMs(39.5, 30, frames, 1500, 11400, false), 6450);
});

test("a cast can use the reference's 79-frame span across either shot length", () => {
  for (const outputFrames of [79, 80]) {
    assert.equal(surfaceCastTimeMs(0, 30, outputFrames, 1500, 11400, false, 79), 1500);
    assert.ok(Math.abs(surfaceCastTimeMs(40, 30, outputFrames, 1500, 11400, false, 79) - (1500 + 9900 * 40 / 79)) < 0.001);
    assert.equal(surfaceCastTimeMs(79, 30, outputFrames, 1500, 11400, false, 79), 11400);
  }
});
