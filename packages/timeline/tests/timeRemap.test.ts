/**
 * Time remap (T29, D13): a clip's source position as a curve.
 *
 * The ramp cases are analytic — the source time at a quarter, half and three
 * quarters of the clip is a number the test computes from the keyframes, not a
 * number read off the implementation — so an interpolation that drifts, eases
 * the wrong end of a segment, or falls back to the rate goes red.
 */
import { describe, expect, it } from "vitest";

import { makeClip } from "../src/defaults.js";
import { ease } from "../src/animation/easing.js";
import {
  assertNotTimeRemapped,
  clipRemapSourceMs,
  evaluateTimeRemapMs,
  hasTimeRemap
} from "../src/timeRemap.js";
import { clipSourceTimeSec } from "../src/render/sceneModel.js";
import { splitClip } from "../src/splitClip.js";
import { trimClip } from "../src/trimClip.js";
import type { TimelineClip } from "../src/types.js";

/** A 1000ms clip starting at 1000ms on the timeline. */
const remapped = (
  keyframes: { t: number; sourceMs: number; easing?: string }[],
  overrides: Partial<TimelineClip> = {}
): TimelineClip =>
  makeClip({
    startMs: 1000,
    durationMs: 1000,
    mediaType: "video",
    timeRemap: { keyframes },
    ...overrides
  });

describe("clipSourceTimeSec with a time remap", () => {
  it("walks a two-keyframe 0→2× ramp to the analytic source time", () => {
    // Source 0ms at the cut, 2000ms at the end of a 1000ms clip: the clip
    // consumes two source seconds per timeline second, linearly.
    const clip = remapped([
      { t: 0, sourceMs: 0 },
      { t: 1, sourceMs: 2000 }
    ]);
    for (const t of [0.25, 0.5, 0.75]) {
      expect(clipSourceTimeSec(clip, 1000 + 1000 * t)).toBeCloseTo(2 * t, 6);
    }
    expect(clipSourceTimeSec(clip, 1000)).toBeCloseTo(0, 6);
    expect(clipSourceTimeSec(clip, 2000)).toBeCloseTo(2, 6);
  });

  it("ignores the rate and the in-point a remap replaces", () => {
    const clip = remapped(
      [
        { t: 0, sourceMs: 0 },
        { t: 1, sourceMs: 2000 }
      ],
      { speedMultiplier: 4, inPointMs: 5000 }
    );
    expect(clipSourceTimeSec(clip, 1500)).toBeCloseTo(1, 6);
  });

  it("eases a segment with the grammar animations use", () => {
    const clip = remapped([
      { t: 0, sourceMs: 0 },
      { t: 1, sourceMs: 2000, easing: "easeInOut" }
    ]);
    for (const t of [0.25, 0.5, 0.75]) {
      expect(clipSourceTimeSec(clip, 1000 + 1000 * t)).toBeCloseTo(
        2 * ease("easeInOut", t),
        6
      );
    }
  });

  it("runs the source backwards when sourceMs descends", () => {
    const clip = remapped([
      { t: 0, sourceMs: 2000 },
      { t: 1, sourceMs: 0 }
    ]);
    const samples = [0, 0.25, 0.5, 0.75, 1].map((t) =>
      clipSourceTimeSec(clip, 1000 + 1000 * t)
    );
    expect(samples).toEqual([2, 1.5, 1, 0.5, 0]);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeLessThan(samples[i - 1]!);
    }
  });

  it("holds a piecewise curve segment by segment", () => {
    // Play 0→1000ms over the first half, freeze, then jump on the last
    // keyframe: three segments, each with its own slope.
    const clip = remapped([
      { t: 0, sourceMs: 0 },
      { t: 0.5, sourceMs: 1000 },
      { t: 0.75, sourceMs: 1000 },
      { t: 1, sourceMs: 4000 }
    ]);
    expect(clipSourceTimeSec(clip, 1250)).toBeCloseTo(0.5, 6);
    expect(clipSourceTimeSec(clip, 1500)).toBeCloseTo(1, 6);
    expect(clipSourceTimeSec(clip, 1625)).toBeCloseTo(1, 6);
    expect(clipSourceTimeSec(clip, 1875)).toBeCloseTo(2.5, 6);
  });

  it("holds one keyframe flat — a freeze frame, not an error", () => {
    const clip = remapped([{ t: 0.5, sourceMs: 750 }]);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expect(clipSourceTimeSec(clip, 1000 + 1000 * t)).toBeCloseTo(0.75, 6);
    }
  });

  it("clamps outside the clip instead of extrapolating off the media", () => {
    const clip = remapped([
      { t: 0, sourceMs: 500 },
      { t: 1, sourceMs: 1500 }
    ]);
    expect(clipSourceTimeSec(clip, 0)).toBeCloseTo(0.5, 6);
    expect(clipSourceTimeSec(clip, 9000)).toBeCloseTo(1.5, 6);
  });

  it("falls back to the clip's rate when the remap carries no keyframes", () => {
    const clip = remapped([], { speedMultiplier: 2, inPointMs: 500 });
    expect(hasTimeRemap(clip)).toBe(false);
    expect(clipRemapSourceMs(clip, 1500)).toBeNull();
    // 500ms into the clip at 2× plus a 500ms in-point.
    expect(clipSourceTimeSec(clip, 1500)).toBeCloseTo(1.5, 6);
  });

  it("normalizes t over the clip's own window, whatever its duration", () => {
    const kfs = [
      { t: 0, sourceMs: 0 },
      { t: 1, sourceMs: 3000 }
    ];
    const short = remapped(kfs, { startMs: 0, durationMs: 500 });
    const long = remapped(kfs, { startMs: 0, durationMs: 4000 });
    expect(clipSourceTimeSec(short, 250)).toBeCloseTo(1.5, 6);
    expect(clipSourceTimeSec(long, 2000)).toBeCloseTo(1.5, 6);
  });

  it("does not divide by a zero-length window", () => {
    const clip = remapped(
      [
        { t: 0, sourceMs: 200 },
        { t: 1, sourceMs: 900 }
      ],
      { durationMs: 0 }
    );
    expect(clipSourceTimeSec(clip, 1000)).toBeCloseTo(0.2, 6);
  });
});

describe("evaluateTimeRemapMs", () => {
  it("returns null for an empty curve", () => {
    expect(evaluateTimeRemapMs({ keyframes: [] }, 0.5)).toBeNull();
  });
});

describe("split and trim refuse a remapped clip (D13)", () => {
  const clip = remapped([
    { t: 0, sourceMs: 0 },
    { t: 1, sourceMs: 2000 }
  ]);

  it("splitClip refuses and names the bake", () => {
    expect(() => splitClip(clip, 1500)).toThrow(/bake_time_remap/);
    expect(() => splitClip(clip, 1500)).toThrow(/time remap/);
  });

  it("trimClip refuses both edges and names the bake", () => {
    expect(() => trimClip(clip, "start", -100)).toThrow(/bake_time_remap/);
    expect(() => trimClip(clip, "end", -100)).toThrow(/bake_time_remap/);
  });

  it("still edits a clip whose remap is empty", () => {
    const plain = remapped([], { inPointMs: 0 });
    expect(() => splitClip(plain, 1500)).not.toThrow();
    expect(() => trimClip(plain, "end", -100)).not.toThrow();
  });

  it("refuses a one-keyframe freeze too — the window still normalizes it", () => {
    const frozen = remapped([{ t: 0, sourceMs: 400 }]);
    expect(() => assertNotTimeRemapped(frozen, "splitClip")).toThrow(
      /bake_time_remap/
    );
  });
});
