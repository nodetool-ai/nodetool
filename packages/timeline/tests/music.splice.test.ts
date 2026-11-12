/**
 * The repaint splice (MUSIC-MODE.md section 11, GN-2; MM5 exit 1): every
 * sample outside the span is the parent's, the span holds two 960-frame
 * equal-power crossfades, and their gains square-sum to 1.
 */
import { describe, expect, it } from "vitest";
import {
  SPLICE_CROSSFADE_FRAMES,
  equalPowerGains,
  spliceRegion
} from "../src/music/process.js";

/** Interleaved stereo noise, a different stream per channel. */
function noise(frames: number, seed: number): Float32Array {
  let state = seed;
  const out = new Float32Array(frames * 2);
  for (let index = 0; index < out.length; index += 1) {
    state = (state * 16807) % 2147483647;
    out[index] = state / 2147483647 - 0.5;
  }
  return out;
}

function constant(frames: number, value: number): Float32Array {
  return new Float32Array(frames * 2).fill(value);
}

describe("spliceRegion (MM5 exit 1)", () => {
  const parentFrames = 8 * 96000;
  const start = 2 * 96000;
  const end = 4 * 96000;

  it("copies every sample outside the span from the parent", () => {
    const parent = noise(parentFrames, 3);
    const region = noise(end - start, 5);
    const { samples, crossfadeFrames } = spliceRegion(parent, region, start, end);
    expect(samples.length).toBe(parent.length);
    expect(crossfadeFrames).toBe(SPLICE_CROSSFADE_FRAMES);
    for (let index = 0; index < start * 2; index += 1) {
      if (!Object.is(samples[index], parent[index])) {
        throw new Error(`sample ${index} before the span differs`);
      }
    }
    for (let index = end * 2; index < parent.length; index += 1) {
      if (!Object.is(samples[index], parent[index])) {
        throw new Error(`sample ${index} after the span differs`);
      }
    }
    // Between the crossfades the span is the generated region, unchanged.
    for (let frame = SPLICE_CROSSFADE_FRAMES; frame < end - start - SPLICE_CROSSFADE_FRAMES; frame += 1) {
      expect(samples[(start + frame) * 2]).toBe(region[frame * 2]);
    }
  });

  it("crossfades over the first and last 960 frames with gains whose squares sum to 1", () => {
    // A parent of ones and a region of zeros reads the parent's gain out of
    // the result, and the reverse reads the region's.
    const parentGain = spliceRegion(constant(parentFrames, 1), constant(end - start, 0), start, end).samples;
    const regionGain = spliceRegion(constant(parentFrames, 0), constant(end - start, 1), start, end).samples;
    const headParent: number[] = [];
    const tailParent: number[] = [];
    for (let frame = start; frame < end; frame += 1) {
      const p = parentGain[frame * 2]!;
      const r = regionGain[frame * 2]!;
      expect(parentGain[frame * 2 + 1]).toBe(p);
      if (frame < start + SPLICE_CROSSFADE_FRAMES) {
        headParent.push(p);
        expect(Math.abs(p * p + r * r - 1)).toBeLessThan(1e-6);
      } else if (frame >= end - SPLICE_CROSSFADE_FRAMES) {
        tailParent.push(p);
        expect(Math.abs(p * p + r * r - 1)).toBeLessThan(1e-6);
      } else {
        expect(p).toBe(0);
        expect(r).toBe(1);
      }
    }
    expect(headParent).toHaveLength(960);
    expect(tailParent).toHaveLength(960);
    // The parent falls through the head and rises through the tail.
    expect(headParent[0]).toBeGreaterThan(0.999);
    expect(headParent[959]).toBeLessThan(0.002);
    expect(tailParent[0]).toBeLessThan(0.002);
    expect(tailParent[959]).toBeGreaterThan(0.999);
    for (let index = 1; index < 960; index += 1) {
      expect(headParent[index]).toBeLessThan(headParent[index - 1]!);
      expect(tailParent[index]).toBeGreaterThan(tailParent[index - 1]!);
    }
    // The two ends mirror each other.
    for (let index = 0; index < 960; index += 1) {
      expect(tailParent[index]).toBeCloseTo(headParent[959 - index]!, 6);
    }
  });

  it("halves the crossfades on a span shorter than two of them", () => {
    const { crossfadeFrames } = spliceRegion(noise(4000, 1), noise(1000, 2), 1000, 2000);
    expect(crossfadeFrames).toBe(500);
  });

  it("refuses a region whose length differs from the span, or a span outside the parent", () => {
    expect(() => spliceRegion(noise(4000, 1), noise(999, 2), 1000, 2000)).toThrow(/999 frames/);
    expect(() => spliceRegion(noise(4000, 1), noise(1000, 2), 3500, 4500)).toThrow(/does not lie inside/);
  });
});

describe("equalPowerGains", () => {
  it("square-sums to 1 at every frame", () => {
    for (let index = 0; index < 960; index += 1) {
      const { fadeIn, fadeOut } = equalPowerGains(index, 960);
      expect(fadeIn * fadeIn + fadeOut * fadeOut).toBeCloseTo(1, 12);
    }
  });
});
