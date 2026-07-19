import { describe, expect, it } from "vitest";
import { compileClipAnimations } from "../src/animation/compile.js";
import { sampleAnimations } from "../src/animation/sample.js";
import type { ClipAnimation } from "../src/animation/types.js";

const CANVAS = { width: 1920, height: 1080 };

function wipe(overrides: Partial<ClipAnimation> = {}): ClipAnimation {
  return {
    id: "w1",
    role: "in",
    preset: "wipe",
    durationMs: 500,
    ...overrides
  };
}

describe("wipe compile", () => {
  it("places an 'in' window at [delay, delay+duration] with a 0→1 progress curve", () => {
    const [c] = compileClipAnimations([wipe({ delayMs: 200 })], 3000, CANVAS);
    expect(c.windowStartMs).toBe(200);
    expect(c.windowEndMs).toBe(700);
    expect(c.holdBefore).toBe(true);
    expect(c.holdAfter).toBe(false);
    const kfs = c.curves.find((cu) => cu.property === "wipeProgress")?.keyframes ?? [];
    expect(kfs[0].value).toBe(0);
    expect(kfs[kfs.length - 1].value).toBe(1);
  });

  it("reverses to a 1→0 progress curve for the 'out' role", () => {
    const [c] = compileClipAnimations([wipe({ role: "out" })], 3000, CANVAS);
    expect(c.windowEndMs).toBe(3000);
    expect(c.windowStartMs).toBe(2500);
    expect(c.holdAfter).toBe(true);
    const kfs = c.curves.find((cu) => cu.property === "wipeProgress")?.keyframes ?? [];
    expect(kfs[0].value).toBe(1);
    expect(kfs[kfs.length - 1].value).toBe(0);
  });

  it("carries direction and softness defaults on the compiled mask", () => {
    const [c] = compileClipAnimations([wipe()], 3000, CANVAS);
    expect(c.mask).toEqual({ direction: "left", softness: 0.05 });
  });

  it("carries explicit direction and softness params", () => {
    const [c] = compileClipAnimations(
      [wipe({ params: { direction: "down", softness: 0.2 } })],
      3000,
      CANVAS
    );
    expect(c.mask).toEqual({ direction: "down", softness: 0.2 });
  });

  it("clamps softness to [0, 0.5] and falls back to 'left' for bad directions", () => {
    const [c] = compileClipAnimations(
      [wipe({ params: { direction: "diagonal", softness: 9 } })],
      3000,
      CANVAS
    );
    expect(c.mask).toEqual({ direction: "left", softness: 0.5 });
  });

  it("does not attach a mask to non-wipe presets", () => {
    const [c] = compileClipAnimations(
      [wipe({ preset: "fade" })],
      3000,
      CANVAS
    );
    expect(c.mask).toBeUndefined();
  });

  it("is deterministic — same inputs give deeply equal output", () => {
    const input = [wipe(), wipe({ id: "w2", role: "out" })];
    expect(compileClipAnimations(input, 3000, CANVAS)).toEqual(
      compileClipAnimations(input, 3000, CANVAS)
    );
  });
});

describe("wipe sample", () => {
  it("holds progress 0 (fully hidden) during an 'in' delay", () => {
    const c = compileClipAnimations([wipe({ delayMs: 300 })], 3000, CANVAS);
    const s = sampleAnimations(c, 100);
    expect(s.mask).toEqual({ direction: "left", progress: 0, softness: 0.05 });
  });

  it("reports mid-window progress with linear easing", () => {
    const c = compileClipAnimations(
      [wipe({ easing: "linear" })],
      3000,
      CANVAS
    );
    const s = sampleAnimations(c, 250);
    expect(s.mask?.progress).toBeCloseTo(0.5, 6);
    // The mask never touches the transform/opacity fold.
    expect(s.opacity).toBe(1);
    expect(s.scale).toBe(1);
  });

  it("is unmasked after an 'in' window — no lingering mask cost", () => {
    const c = compileClipAnimations([wipe()], 3000, CANVAS);
    expect(sampleAnimations(c, 500).mask).toBeUndefined(); // progress 1 at end
    expect(sampleAnimations(c, 1000).mask).toBeUndefined(); // past the window
  });

  it("is unmasked before an 'out' window and hidden after it", () => {
    const c = compileClipAnimations([wipe({ role: "out" })], 3000, CANVAS);
    expect(sampleAnimations(c, 1000).mask).toBeUndefined();
    const after = sampleAnimations(c, 3000);
    expect(after.mask?.progress).toBe(0); // holds t=1 of the reversed curve
  });

  it("keeps the smaller progress when an in and an out wipe overlap", () => {
    // Clip of 600ms with two 500ms wipes: windows [0,500] and [100,600].
    const c = compileClipAnimations(
      [
        wipe({ easing: "linear" }),
        wipe({
          id: "w2",
          role: "out",
          easing: "linear",
          params: { direction: "right" }
        })
      ],
      600,
      CANVAS
    );
    // At 400ms: in-progress 0.8, out-progress 1 - 300/500 = 0.4 → out wins.
    const s = sampleAnimations(c, 400);
    expect(s.mask?.progress).toBeCloseTo(0.4, 6);
    expect(s.mask?.direction).toBe("right");
    // At 150ms: in-progress 0.3, out-progress 0.9 → in wins.
    const early = sampleAnimations(c, 150);
    expect(early.mask?.progress).toBeCloseTo(0.3, 6);
    expect(early.mask?.direction).toBe("left");
  });

  it("resets the mask on a reused scratch object", () => {
    const c = compileClipAnimations([wipe({ easing: "linear" })], 3000, CANVAS);
    const scratch = sampleAnimations(c, 250);
    expect(scratch.mask).toBeDefined();
    const after = sampleAnimations(c, 1000, scratch);
    expect(after.mask).toBeUndefined();
  });
});
