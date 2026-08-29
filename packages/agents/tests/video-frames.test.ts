/**
 * The video analysis math, on pixel buffers built by hand so every expectation
 * is derivable without running the code: a solid mid-grey frame has zero
 * contrast, two frames of different solid colours are a full histogram
 * distance apart, and a checkerboard's mean luma is the average of its two
 * squares.
 */
import { describe, expect, it } from "vitest";
import {
  ANALYSIS_HEIGHT,
  ANALYSIS_WIDTH,
  detectCuts,
  dominantColors,
  downscaleLuma,
  frameStats,
  frameTransitions,
  histogramDistance,
  luma,
  lumaHistogram,
  motionScore,
  runsOf,
  shotsFromCuts,
  type AnalyzedFrame
} from "../src/analysis/video-frames.js";

/** A solid RGBA frame. */
function solid(
  width: number,
  height: number,
  red: number,
  green: number,
  blue: number
): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    rgba[index * 4] = red;
    rgba[index * 4 + 1] = green;
    rgba[index * 4 + 2] = blue;
    rgba[index * 4 + 3] = 255;
  }
  return rgba;
}

/** A frame analysed the way `analyzeVideo` analyses one. */
function analyzed(time: number, rgba: Uint8Array, size: number): AnalyzedFrame {
  const small = downscaleLuma(rgba, size, size, 8, 8);
  return {
    time,
    stats: frameStats(rgba, size, size),
    luma: small,
    histogram: lumaHistogram(small)
  };
}

describe("luma", () => {
  it("weights the channels the way Rec. 709 does", () => {
    expect(luma(255, 255, 255)).toBeCloseTo(1, 6);
    expect(luma(0, 0, 0)).toBe(0);
    expect(luma(0, 255, 0)).toBeCloseTo(0.7152, 4);
    expect(luma(0, 0, 255)).toBeCloseTo(0.0722, 4);
  });
});

describe("frameStats", () => {
  it("reports a solid mid-grey as flat", () => {
    const stats = frameStats(solid(8, 8, 128, 128, 128), 8, 8);
    expect(stats.brightness).toBeCloseTo(128 / 255, 4);
    expect(stats.contrast).toBeCloseTo(0, 6);
    expect(stats.saturation).toBeCloseTo(0, 6);
    expect(stats.meanRgb).toEqual([128, 128, 128]);
    expect(stats.clippedHighlights).toBe(0);
    expect(stats.crushedShadows).toBe(0);
  });

  it("reports saturated red as fully saturated", () => {
    expect(frameStats(solid(4, 4, 255, 0, 0), 4, 4).saturation).toBeCloseTo(
      1,
      6
    );
  });

  it("counts blown highlights and crushed shadows", () => {
    const half = new Uint8Array(4 * 1 * 4);
    half.set([255, 255, 255, 255], 0);
    half.set([255, 255, 255, 255], 4);
    half.set([0, 0, 0, 255], 8);
    half.set([0, 0, 0, 255], 12);
    const stats = frameStats(half, 4, 1);
    expect(stats.clippedHighlights).toBe(0.5);
    expect(stats.crushedShadows).toBe(0.5);
    expect(stats.contrast).toBeCloseTo(0.5, 6);
  });

  it("reports zeros for an empty frame", () => {
    expect(frameStats(new Uint8Array(0), 0, 0).brightness).toBe(0);
  });
});

describe("downscaleLuma", () => {
  it("box-filters a checkerboard to its mean", () => {
    const rgba = new Uint8Array(4 * 4 * 4);
    for (let index = 0; index < 16; index += 1) {
      const value = (index % 2 === 0 ? 255 : 0);
      rgba[index * 4] = value;
      rgba[index * 4 + 1] = value;
      rgba[index * 4 + 2] = value;
      rgba[index * 4 + 3] = 255;
    }
    const small = downscaleLuma(rgba, 4, 4, 1, 1);
    expect(small).toHaveLength(1);
    expect(small[0]).toBeCloseTo(0.5, 4);
  });

  it("defaults to the analysis resolution", () => {
    const small = downscaleLuma(solid(120, 90, 255, 255, 255), 120, 90);
    expect(small).toHaveLength(ANALYSIS_WIDTH * ANALYSIS_HEIGHT);
    expect(small[0]).toBeCloseTo(1, 4);
  });

  it("returns an empty frame for zero dimensions", () => {
    expect(Array.from(downscaleLuma(new Uint8Array(0), 0, 0, 2, 2))).toEqual([
      0, 0, 0, 0
    ]);
  });
});

describe("histogramDistance", () => {
  it("is 0 for identical frames and 1 for disjoint ones", () => {
    const black = lumaHistogram(downscaleLuma(solid(8, 8, 0, 0, 0), 8, 8, 4, 4));
    const white = lumaHistogram(
      downscaleLuma(solid(8, 8, 255, 255, 255), 8, 8, 4, 4)
    );
    expect(histogramDistance(black, black)).toBeCloseTo(0, 6);
    expect(histogramDistance(black, white)).toBeCloseTo(1, 6);
  });
});

describe("motionScore", () => {
  it("is the mean absolute difference", () => {
    expect(
      motionScore(Float32Array.from([0, 1]), Float32Array.from([1, 1]))
    ).toBeCloseTo(0.5, 6);
    expect(motionScore(new Float32Array(0), new Float32Array(0))).toBe(0);
  });
});

describe("dominantColors", () => {
  it("finds the two colours in a half-and-half frame with their shares", () => {
    const rgba = new Uint8Array(4 * 4);
    rgba.set([200, 20, 20, 255], 0);
    rgba.set([200, 20, 20, 255], 4);
    rgba.set([200, 20, 20, 255], 8);
    rgba.set([20, 20, 200, 255], 12);
    const palette = dominantColors(rgba, 4, 1, 5);
    expect(palette).toHaveLength(2);
    expect(palette[0].share).toBeCloseTo(0.75, 6);
    expect(palette[0].hex).toBe("#c81414");
    expect(palette[1].share).toBeCloseTo(0.25, 6);
    expect(palette[1].hex).toBe("#1414c8");
  });

  it("returns nothing for an empty frame", () => {
    expect(dominantColors(new Uint8Array(0), 0, 0)).toEqual([]);
  });
});

describe("detectCuts and shotsFromCuts", () => {
  const frames: AnalyzedFrame[] = [
    analyzed(0, solid(8, 8, 0, 0, 0), 8),
    analyzed(0.5, solid(8, 8, 0, 0, 0), 8),
    analyzed(1, solid(8, 8, 255, 255, 255), 8),
    analyzed(1.5, solid(8, 8, 255, 255, 255), 8)
  ];
  const transitions = frameTransitions(frames);

  it("finds the one frame where the histogram changes", () => {
    expect(transitions).toHaveLength(3);
    expect(transitions[0].histogramDistance).toBeCloseTo(0, 6);
    expect(transitions[1].histogramDistance).toBeCloseTo(1, 6);
    expect(detectCuts(transitions, 0.3)).toEqual([1]);
  });

  it("finds no cut in a sequence that never changes", () => {
    const steady = frameTransitions([frames[0], frames[1]]);
    expect(detectCuts(steady, 0.3)).toEqual([]);
  });

  it("splits the timeline into shots at the cut", () => {
    const shots = shotsFromCuts(frames, transitions, [1], 2);
    expect(shots).toHaveLength(2);
    expect(shots[0]).toMatchObject({ index: 0, start: 0, end: 1, duration: 1 });
    expect(shots[0].brightness).toBeCloseTo(0, 6);
    expect(shots[1].brightness).toBeCloseTo(1, 6);
  });

  it("suppresses a second cut inside the minimum shot length", () => {
    const rapid = [
      { time: 1, motion: 1, histogramDistance: 1 },
      { time: 1.1, motion: 1, histogramDistance: 1 }
    ];
    expect(detectCuts(rapid, 0.3, 0.4)).toEqual([1]);
  });
});

describe("runsOf", () => {
  const frames: AnalyzedFrame[] = [
    analyzed(0, solid(4, 4, 255, 255, 255), 4),
    analyzed(0.5, solid(4, 4, 0, 0, 0), 4),
    analyzed(1, solid(4, 4, 0, 0, 0), 4),
    analyzed(1.5, solid(4, 4, 255, 255, 255), 4)
  ];

  it("finds a run that meets the minimum length", () => {
    const black = runsOf(
      frames,
      (index) => frames[index].stats.brightness < 0.02,
      0.5,
      0.5
    );
    expect(black).toEqual([{ start: 0.5, end: 1.5, duration: 1 }]);
  });

  it("drops a run shorter than the minimum", () => {
    expect(
      runsOf(frames, (index) => frames[index].stats.brightness < 0.02, 0.5, 5)
    ).toEqual([]);
  });

  it("closes a run that reaches the end of the sequence", () => {
    const trailing = runsOf(
      frames,
      (index) => index >= 2,
      0.5,
      0.5
    );
    expect(trailing).toEqual([{ start: 1, end: 2, duration: 1 }]);
  });
});
