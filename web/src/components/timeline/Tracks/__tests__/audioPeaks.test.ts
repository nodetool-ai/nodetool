import { describe, expect, it } from "@jest/globals";

import { samplePeaksWindow } from "../audioPeaks";

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
