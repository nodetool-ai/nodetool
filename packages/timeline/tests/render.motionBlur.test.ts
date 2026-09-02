/**
 * The shutter window every render surface samples inside (F11, T28, D10).
 *
 * The sample *times* are what the three surfaces have to agree on — a browser
 * export, a server render and the agent frame preview blur identically only
 * because they all call `motionBlurSampleTimes` — so the arithmetic is pinned
 * here against the closed form the design states, not against a recorded
 * output. The pixels those times produce are asserted where a real canvas
 * exists: `packages/agents/tests/timeline-motion-blur-frames.test.ts` for the
 * Canvas 2D path, `render.motionBlur.gpu.test.ts` for the GPU one.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHUTTER_ANGLE,
  MAX_MOTION_BLUR_SAMPLES,
  accumulateBlurSample,
  motionBlurSampleTimes,
  resolveMotionBlur,
  seedBlurAccumulation,
  type BlurAccumulationContext2D
} from "../src/render/motionBlur.js";

const GEOMETRY = { canvasWidth: 64, canvasHeight: 32 };

/** Records the composite state each draw happened under. */
class RecordingContext implements BlurAccumulationContext2D<string> {
  globalAlpha = 1;
  globalCompositeOperation = "source-over";
  readonly draws: { source: string; alpha: number; op: string }[] = [];
  cleared: { w: number; h: number }[] = [];

  setTransform(): void {}
  clearRect(_x: number, _y: number, w: number, h: number): void {
    this.cleared.push({ w, h });
  }
  drawImage(source: string): void {
    this.draws.push({
      source,
      alpha: this.globalAlpha,
      op: this.globalCompositeOperation
    });
  }
}

describe("resolveMotionBlur", () => {
  it("is blur off when nothing is asked for", () => {
    expect(resolveMotionBlur(undefined)).toEqual({
      samplesPerFrame: 1,
      shutterAngle: DEFAULT_SHUTTER_ANGLE,
      weight: 1
    });
    expect(resolveMotionBlur({}).samplesPerFrame).toBe(1);
  });

  it("clamps rather than refusing, since these arrive from user-set fields", () => {
    expect(resolveMotionBlur({ samplesPerFrame: 0 }).samplesPerFrame).toBe(1);
    expect(resolveMotionBlur({ samplesPerFrame: -4 }).samplesPerFrame).toBe(1);
    expect(resolveMotionBlur({ samplesPerFrame: 1000 }).samplesPerFrame).toBe(
      MAX_MOTION_BLUR_SAMPLES
    );
    expect(resolveMotionBlur({ samplesPerFrame: 4.7 }).samplesPerFrame).toBe(4);
    expect(resolveMotionBlur({ shutterAngle: -10 }).shutterAngle).toBe(0);
    expect(resolveMotionBlur({ shutterAngle: 900 }).shutterAngle).toBe(360);
    expect(resolveMotionBlur({ samplesPerFrame: Number.NaN }).samplesPerFrame)
      .toBe(1);
  });

  it("resolves an already-resolved value to itself", () => {
    const once = resolveMotionBlur({ samplesPerFrame: 99, shutterAngle: 400 });
    expect(resolveMotionBlur(once)).toEqual(once);
  });

  it("weights the samples so they sum to one", () => {
    const { samplesPerFrame, weight } = resolveMotionBlur({
      samplesPerFrame: 8
    });
    expect(samplesPerFrame * weight).toBeCloseTo(1, 12);
  });
});

describe("motionBlurSampleTimes", () => {
  it("leaves an unblurred frame on its own instant", () => {
    // Not the midpoint of the window: blur off must render what it rendered
    // before blur existed.
    expect(motionBlurSampleTimes(1000, 40, undefined)).toEqual([1000]);
    expect(motionBlurSampleTimes(1000, 40, { samplesPerFrame: 1 })).toEqual([
      1000
    ]);
  });

  it("places each sample at the midpoint of its slice of the shutter", () => {
    const frameMs = 40;
    const samples = 8;
    const shutterAngle = 180;
    const times = motionBlurSampleTimes(1000, frameMs, {
      samplesPerFrame: samples,
      shutterAngle
    });
    const windowMs = (shutterAngle / 360) * frameMs;
    expect(times).toHaveLength(samples);
    for (let i = 0; i < samples; i++) {
      expect(times[i]).toBeCloseTo(1000 + ((i + 0.5) / samples) * windowMs, 10);
    }
    // The whole window stays inside the frame, and no sample sits on its edge.
    expect(times[0]).toBeGreaterThan(1000);
    expect(times[samples - 1]).toBeLessThan(1000 + windowMs);
  });

  it("spans the whole frame at a 360-degree shutter", () => {
    const times = motionBlurSampleTimes(0, 40, {
      samplesPerFrame: 4,
      shutterAngle: 360
    });
    expect(times).toEqual([5, 15, 25, 35]);
  });

  it("collapses onto one instant at a zero-degree shutter", () => {
    const times = motionBlurSampleTimes(500, 40, {
      samplesPerFrame: 4,
      shutterAngle: 0
    });
    expect(times).toEqual([500, 500, 500, 500]);
  });

  it("is strictly ascending, which the forward-only decoders rely on", () => {
    const times = motionBlurSampleTimes(120, 33.3333, {
      samplesPerFrame: 16,
      shutterAngle: 270
    });
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThan(times[i - 1]);
    }
  });
});

describe("Canvas 2D accumulation", () => {
  it("clears the accumulator and leaves the context in the plain state", () => {
    const ctx = new RecordingContext();
    ctx.globalAlpha = 0.25;
    ctx.globalCompositeOperation = "multiply";
    seedBlurAccumulation(ctx, GEOMETRY);
    expect(ctx.cleared).toEqual([{ w: 64, h: 32 }]);
    expect(ctx.globalAlpha).toBe(1);
    expect(ctx.globalCompositeOperation).toBe("source-over");
  });

  it("adds each sample rather than fading it over the last", () => {
    const ctx = new RecordingContext();
    seedBlurAccumulation(ctx, GEOMETRY);
    for (const sample of ["a", "b", "c", "d"]) {
      accumulateBlurSample(ctx, sample, 0.25, GEOMETRY);
    }
    // `source-over` at 1/N is a lerp: the last sample would weigh 1/N and the
    // first (1/N)(1-1/N)^(N-1). `lighter` is the sum the average needs.
    expect(ctx.draws).toEqual([
      { source: "a", alpha: 0.25, op: "lighter" },
      { source: "b", alpha: 0.25, op: "lighter" },
      { source: "c", alpha: 0.25, op: "lighter" },
      { source: "d", alpha: 0.25, op: "lighter" }
    ]);
    // Left plain, so a later draw on this canvas is not silently additive.
    expect(ctx.globalAlpha).toBe(1);
    expect(ctx.globalCompositeOperation).toBe("source-over");
  });
});
