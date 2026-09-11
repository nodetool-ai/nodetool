import assert from "node:assert/strict";
import test from "node:test";
import { presentationToCastTime, validateTimeMap } from "../tutorialTiming";
import type { TimeMap } from "../types";

const map: TimeMap = [
  { presentationFromMs: 0, presentationToMs: 1000, castFromMs: 0, castToMs: 1000 },
  { presentationFromMs: 1000, presentationToMs: 2000, castFromMs: 1000, castToMs: 1000 },
  { presentationFromMs: 2000, presentationToMs: 3000, castFromMs: 1000, castToMs: 2000 },
];

test("maps identity, holds, later playback, and backward seeks purely", () => {
  assert.equal(presentationToCastTime(500), 500);
  assert.equal(presentationToCastTime(1500, map), 1000);
  assert.equal(presentationToCastTime(2500, map), 1500);
  assert.equal(presentationToCastTime(500, map), 500);
  assert.equal(presentationToCastTime(3500, map), 2500);
});

test("rejects overlapping, unordered, and backward cast intervals", () => {
  const invalid: TimeMap = [
    { presentationFromMs: 500, presentationToMs: 1000, castFromMs: 900, castToMs: 100 },
    { presentationFromMs: 900, presentationToMs: 800, castFromMs: 50, castToMs: 50 },
  ];
  assert.ok(validateTimeMap(invalid).length >= 3);
  assert.throws(() => presentationToCastTime(700, invalid), /timeMap/);
});
