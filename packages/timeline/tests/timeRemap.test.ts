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
  hasTimeRemap,
  timeRemapAudioSegments
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

describe("timeRemapAudioSegments", () => {
  it("gives an un-remapped clip one segment at the clip's own rate", () => {
    const clip = makeClip({
      startMs: 1000,
      durationMs: 1000,
      mediaType: "audio",
      speedMultiplier: 2,
      inPointMs: 500
    });
    expect(timeRemapAudioSegments(clip)).toEqual([
      {
        timelineStartMs: 1000,
        timelineEndMs: 2000,
        sourceStartMs: 500,
        sourceEndMs: 2500,
        rate: 2,
        reverse: false
      }
    ]);
  });

  it("reads a baked speed as 1:1, the rate the picture uses", () => {
    const clip = makeClip({
      startMs: 0,
      durationMs: 1000,
      mediaType: "audio",
      speedMultiplier: 4,
      speedBaked: true
    });
    const [seg] = timeRemapAudioSegments(clip);
    expect(seg!.rate).toBe(1);
    expect(seg!.sourceEndMs).toBe(1000);
  });

  it("turns a linear 0→2× ramp into one segment of rate 2", () => {
    const clip = remapped([
      { t: 0, sourceMs: 0 },
      { t: 1, sourceMs: 2000 }
    ]);
    const segs = timeRemapAudioSegments(clip);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toEqual({
      timelineStartMs: 1000,
      timelineEndMs: 2000,
      sourceStartMs: 0,
      sourceEndMs: 2000,
      rate: 2,
      reverse: false
    });
  });

  it("ignores the rate and in-point a remap replaces", () => {
    const clip = remapped(
      [
        { t: 0, sourceMs: 0 },
        { t: 1, sourceMs: 1000 }
      ],
      { speedMultiplier: 4, inPointMs: 5000 }
    );
    const [seg] = timeRemapAudioSegments(clip);
    expect(seg!.rate).toBe(1);
    expect(seg!.sourceStartMs).toBe(0);
  });

  it("cuts an eased pair into pieces that follow the curve", () => {
    const clip = remapped([
      { t: 0, sourceMs: 0 },
      { t: 1, sourceMs: 2000, easing: "easeInOut" }
    ]);
    const segs = timeRemapAudioSegments(clip, 4);
    expect(segs).toHaveLength(4);
    // Each piece's rate is the curve's own average slope across it — computed
    // from `ease`, not read off the implementation.
    segs.forEach((seg, i) => {
      const t0 = i / 4;
      const t1 = (i + 1) / 4;
      const expected =
        (2000 * (ease("easeInOut", t1) - ease("easeInOut", t0))) / (1000 / 4);
      expect(seg.rate).toBeCloseTo(expected, 6);
      expect(seg.reverse).toBe(false);
    });
    // An easeInOut starts slow and peaks in the middle.
    expect(segs[0]!.rate).toBeLessThan(segs[1]!.rate);
    expect(segs[3]!.rate).toBeLessThan(segs[1]!.rate);
  });

  it("leaves a linear pair whole however many samples are asked for", () => {
    const clip = remapped([
      { t: 0, sourceMs: 0 },
      { t: 1, sourceMs: 500, easing: "linear" }
    ]);
    expect(timeRemapAudioSegments(clip, 16)).toHaveLength(1);
  });

  it("marks a descending curve reverse", () => {
    const clip = remapped([
      { t: 0, sourceMs: 2000 },
      { t: 1, sourceMs: 0 }
    ]);
    const [seg] = timeRemapAudioSegments(clip);
    expect(seg!.rate).toBe(-2);
    expect(seg!.reverse).toBe(true);
  });

  it("covers the whole window, holding past the outer keyframes", () => {
    const clip = remapped([
      { t: 0.25, sourceMs: 400 },
      { t: 0.75, sourceMs: 900 }
    ]);
    const segs = timeRemapAudioSegments(clip);
    expect(segs.map((s) => [s.timelineStartMs, s.timelineEndMs])).toEqual([
      [1000, 1250],
      [1250, 1750],
      [1750, 2000]
    ]);
    expect(segs[0]!.reverse).toBe(true);
    expect(segs[0]!.rate).toBe(0);
    expect(segs[1]!.rate).toBe(1);
    expect(segs[2]!.reverse).toBe(true);
    expect(segs[2]!.sourceStartMs).toBe(900);
  });

  it("reads a one-keyframe freeze as a silent hold over the clip", () => {
    const clip = remapped([{ t: 0, sourceMs: 400 }]);
    const segs = timeRemapAudioSegments(clip);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({
      timelineStartMs: 1000,
      timelineEndMs: 2000,
      sourceStartMs: 400,
      sourceEndMs: 400,
      rate: 0,
      reverse: true
    });
  });

  it("segments run in order and meet end to end", () => {
    const clip = remapped([
      { t: 0.1, sourceMs: 0 },
      { t: 0.5, sourceMs: 800, easing: "easeOut" },
      { t: 0.9, sourceMs: 400 }
    ]);
    const segs = timeRemapAudioSegments(clip, 3);
    expect(segs[0]!.timelineStartMs).toBe(1000);
    expect(segs[segs.length - 1]!.timelineEndMs).toBe(2000);
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i]!.timelineStartMs).toBeCloseTo(segs[i - 1]!.timelineEndMs, 6);
      expect(segs[i]!.sourceStartMs).toBeCloseTo(segs[i - 1]!.sourceEndMs, 6);
    }
    expect(segs.some((s) => s.reverse)).toBe(true);
  });
});
