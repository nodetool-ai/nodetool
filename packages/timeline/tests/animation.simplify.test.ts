import { describe, expect, it } from "vitest";
import {
  envelopeToKeyframes,
  simplifyKeyframes,
  type EnvelopeFrame,
  type KeyframePoint
} from "../src/animation/simplify.js";

/** Evenly spaced points at `stepMs`, `value(index)` per sample. */
function series(count: number, stepMs: number, value: (index: number) => number): KeyframePoint[] {
  return Array.from({ length: count }, (_unused, index) => ({
    timeMs: index * stepMs,
    value: value(index)
  }));
}

describe("simplifyKeyframes", () => {
  it("reduces silence to its two endpoints", () => {
    const flat = series(500, 10, () => 0);
    const result = simplifyKeyframes(flat, { tolerance: 0.01 });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(flat[0]);
    expect(result[1]).toEqual(flat[flat.length - 1]);
  });

  it("keeps a single transient's exact time and value", () => {
    const burstIndex = 40;
    const points = series(100, 5, (index) => (index === burstIndex ? 1 : 0));
    const result = simplifyKeyframes(points, { tolerance: 0.05 });
    const burst = points[burstIndex];
    const kept = result.find(
      (point) => point.timeMs === burst.timeMs && point.value === burst.value
    );
    expect(kept).toBeDefined();
  });

  it("drops a sustained tone's plateau to a handful of points", () => {
    // Ramp up over 20 samples, hold at 1 for 900, ramp down over 20.
    const points = series(1000, 5, (index) => {
      if (index < 20) return index / 20;
      if (index < 980) return 1;
      return Math.max(0, 1 - (index - 980) / 20);
    });
    const result = simplifyKeyframes(points, { tolerance: 0.02 });
    expect(result.length).toBeLessThan(20);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("never returns more points at a larger tolerance", () => {
    const points = series(300, 10, (index) =>
      Math.sin(index / 7) * 0.5 + Math.sin(index / 2.3) * 0.2
    );
    const tight = simplifyKeyframes(points, { tolerance: 0.01 });
    const loose = simplifyKeyframes(points, { tolerance: 0.2 });
    expect(loose.length).toBeLessThanOrEqual(tight.length);
  });

  it("respects maxPoints even when mandatory peaks would exceed it", () => {
    // Five sharp, well-separated spikes — all individually well above the
    // tolerance used, so every one is a mandatory vertex on its own.
    const points = series(500, 2, (index) => {
      const spikeCenters = [50, 150, 250, 350, 450];
      return spikeCenters.some((center) => Math.abs(index - center) < 2)
        ? 1
        : 0;
    });
    const result = simplifyKeyframes(points, { tolerance: 0.01, maxPoints: 4 });
    expect(result.length).toBeLessThanOrEqual(4);
  });

  it("keeps the highest-prominence peaks when forced to drop some", () => {
    const points = series(200, 5, (index) => {
      if (index === 30) return 0.3; // low spike
      if (index === 100) return 1.0; // tallest spike
      if (index === 160) return 0.6; // medium spike
      return 0;
    });
    // A budget that fits one spike's shape (before/apex/after) plus the two
    // series endpoints, but not two — forcing a choice between them.
    const result = simplifyKeyframes(points, { tolerance: 0.01, maxPoints: 5 });
    expect(result.length).toBeLessThanOrEqual(5);
    const tallest = result.find((point) => point.timeMs === 100 * 5);
    expect(tallest?.value).toBe(1.0);
    expect(result.some((point) => point.value === 0.3)).toBe(false);
    expect(result.some((point) => point.value === 0.6)).toBe(false);
  });

  it("completes on a 100k-point series", () => {
    const big = series(100_000, 1, (index) => {
      const base = Math.sin(index / 97) * 0.4 + Math.sin(index / 11) * 0.1;
      // A few sharp transients scattered through an otherwise smooth signal.
      return index % 9973 === 0 ? base + 0.8 : base;
    });
    const start = Date.now();
    const result = simplifyKeyframes(big, { tolerance: 0.03, maxPoints: 2000 });
    expect(Date.now() - start).toBeLessThan(10_000);
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(2000);
  });

  it("is a no-op on two points or fewer", () => {
    const two: KeyframePoint[] = [
      { timeMs: 0, value: 0 },
      { timeMs: 100, value: 1 }
    ];
    expect(simplifyKeyframes(two, { tolerance: 1 })).toEqual(two);
    expect(simplifyKeyframes([two[0]], { tolerance: 1 })).toEqual([two[0]]);
    expect(simplifyKeyframes([], { tolerance: 1 })).toEqual([]);
  });
});

describe("envelopeToKeyframes", () => {
  const inputRange: [number, number] = [0, 1];
  const outputRange: [number, number] = [0, 100];

  function stepEnvelope(
    highFromMs: number,
    lowFromMs: number,
    totalMs: number,
    stepMs: number
  ): EnvelopeFrame[] {
    const frames: EnvelopeFrame[] = [];
    for (let timeMs = 0; timeMs <= totalMs; timeMs += stepMs) {
      const rms = timeMs >= highFromMs && timeMs < lowFromMs ? 1 : 0;
      frames.push({ timeMs, rms });
    }
    return frames;
  }

  it("returns nothing for an empty envelope", () => {
    expect(envelopeToKeyframes([], { attackMs: 10, releaseMs: 10, inputRange, outputRange, tolerance: 1 })).toEqual([]);
  });

  it("maps a flat envelope into the output range and simplifies to two points", () => {
    const frames = series(200, 5, () => 0.5).map((point) => ({
      timeMs: point.timeMs,
      rms: point.value
    }));
    const result = envelopeToKeyframes(frames, {
      attackMs: 1,
      releaseMs: 1,
      inputRange,
      outputRange,
      tolerance: 1
    });
    expect(result).toHaveLength(2);
    for (const point of result) {
      expect(point.value).toBeCloseTo(50, 0);
    }
  });

  it("rises within roughly attackMs and decays within roughly releaseMs on a step", () => {
    const attackMs = 50;
    const releaseMs = 200;
    const frames = stepEnvelope(200, 600, 1000, 1);
    const result = envelopeToKeyframes(frames, {
      attackMs,
      releaseMs,
      inputRange,
      outputRange,
      // A tight tolerance keeps nearly every sample, so the exponential
      // rise/decay is still there to inspect after simplification.
      tolerance: 0.01,
      preservePeaks: true
    });

    // One time constant after the step's start: a single-pole follower
    // reaches 1 - 1/e (~63%) of the way to its target.
    const afterAttack = result.find(
      (point) => point.timeMs >= 200 + attackMs && point.timeMs < 600
    );
    expect(afterAttack).toBeDefined();
    expect(afterAttack!.value).toBeGreaterThan(50);

    const wellIntoHold = result
      .filter((point) => point.timeMs >= 200 + attackMs * 4 && point.timeMs < 600)
      .sort((a, b) => b.timeMs - a.timeMs)[0];
    expect(wellIntoHold).toBeDefined();
    expect(wellIntoHold!.value).toBeGreaterThan(90);

    const afterRelease = result.find(
      (point) => point.timeMs >= 600 + releaseMs && point.timeMs <= 1000
    );
    expect(afterRelease).toBeDefined();
    expect(afterRelease!.value).toBeLessThan(50);
  });

  it("clamps values outside inputRange instead of extrapolating", () => {
    const frames: EnvelopeFrame[] = [
      { timeMs: 0, rms: -5 },
      { timeMs: 10, rms: 0.5 },
      { timeMs: 20, rms: 50 }
    ];
    const result = envelopeToKeyframes(frames, {
      attackMs: 0,
      releaseMs: 0,
      inputRange,
      outputRange,
      tolerance: 0
    });
    const values = result.map((point) => point.value);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThanOrEqual(100);
  });

  it("respects maxPoints on a dense envelope", () => {
    const frames = series(5000, 2, (index) => Math.abs(Math.sin(index / 30))).map(
      (point) => ({ timeMs: point.timeMs, rms: point.value })
    );
    const result = envelopeToKeyframes(frames, {
      attackMs: 5,
      releaseMs: 20,
      inputRange,
      outputRange,
      tolerance: 0.5,
      maxPoints: 50
    });
    expect(result.length).toBeLessThanOrEqual(50);
  });
});
