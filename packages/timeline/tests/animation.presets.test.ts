import { describe, expect, it } from "vitest";
import {
  ANIMATION_PRESETS,
  getAnimationPreset,
  resolvePresetParams,
  sampleCountFor,
  type Canvas
} from "../src/animation/presets.js";
import { MAX_CUSTOM_KEYFRAMES } from "../src/animation/custom.js";
import type { PropertyCurve } from "../src/animation/compile.js";

const CANVAS: Canvas = { width: 1920, height: 1080 };

function curveFor(
  presetId: string,
  overrides: Record<string, number | string | boolean>,
  canvas: Canvas,
  durationMs: number
): PropertyCurve[] {
  const preset = getAnimationPreset(presetId);
  if (!preset) throw new Error(`no such preset: ${presetId}`);
  const params = resolvePresetParams(preset, overrides);
  return preset.curves(params, canvas, "emphasis", durationMs);
}

function findCurve(
  curves: PropertyCurve[],
  property: string
): PropertyCurve | undefined {
  return curves.find((c) => c.property === property);
}

describe("sampleCountFor", () => {
  it("clamps to the minimum for a near-zero cycle count", () => {
    expect(sampleCountFor(1, 0.001, { min: 9, max: 999 })).toBe(9);
  });

  it("clamps to the maximum for a huge cycle count", () => {
    expect(sampleCountFor(60000, 30, { min: 9, max: 240 })).toBe(240);
  });

  it("grows with duration and frequency", () => {
    const short = sampleCountFor(500, 4, { min: 2, max: 4096 });
    const long = sampleCountFor(5000, 4, { min: 2, max: 4096 });
    expect(long).toBeGreaterThan(short);
    const lowFreq = sampleCountFor(1000, 2, { min: 2, max: 4096 });
    const highFreq = sampleCountFor(1000, 20, { min: 2, max: 4096 });
    expect(highFreq).toBeGreaterThan(lowFreq);
  });

  it("returns 0 cycles worth (the min) for a non-positive duration or frequency", () => {
    expect(sampleCountFor(0, 8, { min: 9, max: 4096 })).toBe(9);
    expect(sampleCountFor(600, 0, { min: 9, max: 4096 })).toBe(9);
  });
});

describe("shake preset (seeded noise)", () => {
  it("starts and ends at rest on both axes", () => {
    const curves = curveFor("shake", {}, CANVAS, 600);
    const x = findCurve(curves, "offsetX")!;
    const y = findCurve(curves, "offsetY")!;
    expect(x.keyframes[0]!.value).toBe(0);
    expect(x.keyframes[x.keyframes.length - 1]!.value).toBe(0);
    expect(y.keyframes[0]!.value).toBe(0);
    expect(y.keyframes[y.keyframes.length - 1]!.value).toBe(0);
  });

  it("is deterministic for identical params", () => {
    const a = curveFor("shake", { seed: 7, frequency: 6 }, CANVAS, 600);
    const b = curveFor("shake", { seed: 7, frequency: 6 }, CANVAS, 600);
    expect(a).toEqual(b);
  });

  it("a different seed produces different motion", () => {
    const a = curveFor("shake", { seed: 1 }, CANVAS, 600);
    const b = curveFor("shake", { seed: 2 }, CANVAS, 600);
    expect(a).not.toEqual(b);
  });

  it("drives both offsetX and offsetY", () => {
    const curves = curveFor("shake", { seed: 3 }, CANVAS, 600);
    const x = findCurve(curves, "offsetX")!;
    const y = findCurve(curves, "offsetY")!;
    const anyNonzeroX = x.keyframes.some((k) => k.value !== 0);
    const anyNonzeroY = y.keyframes.some((k) => k.value !== 0);
    expect(anyNonzeroX).toBe(true);
    expect(anyNonzeroY).toBe(true);
    // Two independent PRNG streams, so the two axes should not move in lockstep.
    expect(x.keyframes.map((k) => k.value)).not.toEqual(
      y.keyframes.map((k) => k.value)
    );
  });

  it("stays inside the intensity envelope", () => {
    const intensity = 0.02;
    const curves = curveFor("shake", { intensity }, CANVAS, 600);
    const maxAmp = intensity * CANVAS.width;
    for (const curve of curves) {
      for (const kf of curve.keyframes) {
        expect(Math.abs(kf.value)).toBeLessThanOrEqual(maxAmp + 1e-6);
      }
    }
  });

  it("a fade-in keeps the early samples smaller than an unfaded run", () => {
    const windowMs = 2000;
    const withFade = curveFor(
      "shake",
      { seed: 5, fadeInMs: windowMs / 2, frequency: 4 },
      CANVAS,
      windowMs
    );
    const withoutFade = curveFor("shake", { seed: 5, frequency: 4 }, CANVAS, windowMs);
    const earlyFaded = findCurve(withFade, "offsetX")!.keyframes.find(
      (k) => k.t > 0 && k.t < 0.25
    );
    const earlyUnfaded = findCurve(withoutFade, "offsetX")!.keyframes.find(
      (k) => k.t === earlyFaded?.t
    );
    expect(earlyFaded).toBeTruthy();
    expect(earlyUnfaded).toBeTruthy();
    expect(Math.abs(earlyFaded!.value)).toBeLessThanOrEqual(
      Math.abs(earlyUnfaded!.value) + 1e-9
    );
  });

  it("respects the MAX_CUSTOM_KEYFRAMES cap even for a very long, high-frequency window", () => {
    const curves = curveFor(
      "shake",
      { frequency: 30 },
      CANVAS,
      10 * 60 * 1000 // 10 minutes
    );
    for (const curve of curves) {
      expect(curve.keyframes.length).toBeLessThanOrEqual(MAX_CUSTOM_KEYFRAMES);
    }
  });
});

describe("float preset (frequency + seeded drift)", () => {
  it("loops seamlessly with a pure sine (seed 0)", () => {
    const curves = curveFor("float", { seed: 0, frequency: 1 }, CANVAS, 3000);
    const y = findCurve(curves, "offsetY")!;
    const first = y.keyframes[0]!;
    const last = y.keyframes[y.keyframes.length - 1]!;
    expect(first.t).toBe(0);
    expect(last.t).toBe(1);
    expect(last.value).toBeCloseTo(first.value, 9);
  });

  it("still loops seamlessly with a fractional frequency", () => {
    const curves = curveFor("float", { seed: 0, frequency: 1.7 }, CANVAS, 3000);
    const y = findCurve(curves, "offsetY")!;
    expect(y.keyframes[0]!.value).toBeCloseTo(
      y.keyframes[y.keyframes.length - 1]!.value,
      9
    );
  });

  it("loops seamlessly with seeded drift blended in", () => {
    const curves = curveFor("float", { seed: 42, frequency: 2 }, CANVAS, 3000);
    const y = findCurve(curves, "offsetY")!;
    expect(y.keyframes[0]!.value).toBeCloseTo(
      y.keyframes[y.keyframes.length - 1]!.value,
      9
    );
  });

  it("a nonzero seed changes the motion from the pure sine", () => {
    const pure = curveFor("float", { seed: 0, frequency: 1 }, CANVAS, 3000);
    const drifting = curveFor("float", { seed: 9, frequency: 1 }, CANVAS, 3000);
    expect(pure).not.toEqual(drifting);
  });

  it("is deterministic for identical params", () => {
    const a = curveFor("float", { seed: 11, frequency: 3 }, CANVAS, 3000);
    const b = curveFor("float", { seed: 11, frequency: 3 }, CANVAS, 3000);
    expect(a).toEqual(b);
  });
});

describe("followPath preset", () => {
  const preset = getAnimationPreset("followPath");

  it("is registered in the catalog with emphasis and loop roles", () => {
    expect(preset).toBeTruthy();
    expect(ANIMATION_PRESETS.some((p) => p.id === "followPath")).toBe(true);
    expect(preset!.roles).toContain("emphasis");
    expect(preset!.roles).toContain("loop");
  });

  it("drives no curve for empty/unusable path data", () => {
    const curves = curveFor("followPath", { d: "" }, CANVAS, 800);
    expect(curves).toEqual([]);
  });

  it("yields linearly spaced positions along a straight line", () => {
    const curves = curveFor(
      "followPath",
      { d: "M0,0.5 L1,0.5" },
      CANVAS,
      4000
    );
    const x = findCurve(curves, "positionX")!;
    const y = findCurve(curves, "positionY")!;
    expect(x.keyframes.length).toBeGreaterThanOrEqual(8);
    for (const kf of x.keyframes) {
      expect(kf.value).toBeCloseTo(kf.t * CANVAS.width, 3);
    }
    for (const kf of y.keyframes) {
      expect(kf.value).toBeCloseTo(0.5 * CANVAS.height, 3);
    }
    // Monotonically increasing along the line.
    for (let i = 1; i < x.keyframes.length; i++) {
      expect(x.keyframes[i]!.value).toBeGreaterThan(x.keyframes[i - 1]!.value);
    }
  });

  it("produces the four tangent angles of a closed rectangle when oriented", () => {
    const curves = curveFor(
      "followPath",
      { d: "M0,0 L1,0 L1,1 L0,1 Z", orient: true },
      CANVAS,
      4000 // plenty of samples to land on every edge
    );
    const rotation = findCurve(curves, "rotation")!;
    expect(rotation).toBeTruthy();
    const buckets = { right: 0, down: 0, left: 0, up: 0 };
    for (const kf of rotation.keyframes) {
      const a = kf.value;
      if (Math.abs(a) < 0.2) buckets.right++;
      else if (Math.abs(a - Math.PI / 2) < 0.2) buckets.down++;
      else if (Math.abs(Math.abs(a) - Math.PI) < 0.2) buckets.left++;
      else if (Math.abs(a + Math.PI / 2) < 0.2) buckets.up++;
    }
    expect(buckets.right).toBeGreaterThan(0);
    expect(buckets.down).toBeGreaterThan(0);
    expect(buckets.left).toBeGreaterThan(0);
    expect(buckets.up).toBeGreaterThan(0);
  });

  it("omits the rotation curve when orient is false", () => {
    const curves = curveFor(
      "followPath",
      { d: "M0,0 L1,0 L1,1 L0,1 Z", orient: false },
      CANVAS,
      800
    );
    expect(findCurve(curves, "rotation")).toBeUndefined();
  });

  it("is deterministic for identical params", () => {
    const params = { d: "M0,0 L1,0 L1,1 L0,1 Z", orient: true, startT: 0.1, endT: 0.9 };
    const a = curveFor("followPath", params, CANVAS, 1200);
    const b = curveFor("followPath", params, CANVAS, 1200);
    expect(a).toEqual(b);
  });

  it("respects the MAX_CUSTOM_KEYFRAMES cap for a very long window", () => {
    const curves = curveFor(
      "followPath",
      { d: "M0,0 L1,1" },
      CANVAS,
      10 * 60 * 1000
    );
    for (const curve of curves) {
      expect(curve.keyframes.length).toBeLessThanOrEqual(MAX_CUSTOM_KEYFRAMES);
    }
  });

  it("respects startT/endT sub-range", () => {
    const curves = curveFor(
      "followPath",
      { d: "M0,0 L1,0", startT: 0.25, endT: 0.75 },
      CANVAS,
      2000
    );
    const x = findCurve(curves, "positionX")!;
    expect(x.keyframes[0]!.value).toBeCloseTo(0.25 * CANVAS.width, 3);
    expect(x.keyframes[x.keyframes.length - 1]!.value).toBeCloseTo(
      0.75 * CANVAS.width,
      3
    );
  });
});
