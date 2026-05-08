import { describe, expect, it } from "@jest/globals";

import { computePeaks, samplePeaksWindow } from "../audioPeaks";

describe("computePeaks", () => {
  it("returns peakCount samples", () => {
    const channel = new Float32Array(1000);
    const peaks = computePeaks(channel, 50);
    expect(peaks.length).toBe(50);
  });

  it("returns the abs-max per bucket", () => {
    const channel = new Float32Array([0.1, -0.5, 0.3, 0.2, -0.9, 0.4]);
    const peaks = computePeaks(channel, 2);
    // bucket 0: samples 0..2 → abs-max = 0.5
    // bucket 1: samples 3..5 → abs-max = 0.9
    expect(peaks[0]).toBeCloseTo(0.5);
    expect(peaks[1]).toBeCloseTo(0.9);
  });

  it("is silent for an all-zero channel", () => {
    const channel = new Float32Array(100);
    const peaks = computePeaks(channel, 10);
    expect(Array.from(peaks).every((v) => v === 0)).toBe(true);
  });

  it("handles peakCount > sample count by repeating buckets", () => {
    const channel = new Float32Array([1, -0.5]);
    const peaks = computePeaks(channel, 8);
    expect(peaks.length).toBe(8);
    // Every bucket covers at least one sample, so all peaks > 0.
    expect(Array.from(peaks).every((v) => v > 0)).toBe(true);
  });

  it("returns an empty array when peakCount is 0", () => {
    expect(computePeaks(new Float32Array([1]), 0).length).toBe(0);
  });

  it("returns an empty array for an empty channel", () => {
    expect(computePeaks(new Float32Array(), 10).length).toBe(0);
  });
});

describe("samplePeaksWindow", () => {
  const fullPeaks = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]);
  const sourceDurationMs = 1000;

  it("returns a window matching the requested peakCount", () => {
    const window = samplePeaksWindow(fullPeaks, sourceDurationMs, 0, 1000, 5);
    expect(window.length).toBe(5);
  });

  it("samples the second half of the source for inPoint=500ms", () => {
    const window = samplePeaksWindow(fullPeaks, sourceDurationMs, 500, 1000, 5);
    // Indices ~5..9 → values 0.6..1.0
    expect(window[0]).toBeCloseTo(0.6);
    expect(window[window.length - 1]).toBeCloseTo(1.0);
  });

  it("clamps to the source bounds", () => {
    const window = samplePeaksWindow(fullPeaks, sourceDurationMs, -200, 2000, 4);
    expect(window.length).toBe(4);
    // Bucket-max: bucket 0 covers indices 0..1 → max(0.1, 0.2) = 0.2;
    // last bucket covers 7..9 → max(0.8, 0.9, 1.0) = 1.0.
    expect(window[0]).toBeCloseTo(0.2);
    expect(window[window.length - 1]).toBeCloseTo(1.0);
  });

  it("returns zeros if the source duration is zero", () => {
    const window = samplePeaksWindow(fullPeaks, 0, 0, 1000, 5);
    expect(Array.from(window).every((v) => v === 0)).toBe(true);
  });
});
