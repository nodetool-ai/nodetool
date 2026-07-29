import { describe, expect, it } from "vitest";
import { compileClipAnimations } from "../src/animation/compile.js";
import { sampleAnimations } from "../src/animation/sample.js";
import type { ClipAnimation } from "../src/animation/types.js";

const CANVAS = { width: 1920, height: 1080 };

function anim(overrides: Partial<ClipAnimation> = {}): ClipAnimation {
  return {
    id: "e1",
    role: "in",
    preset: "blur",
    durationMs: 500,
    ...overrides
  };
}

describe("effect preset compile", () => {
  it("blur-in compiles a heavy→0 blur curve and a 0→1 opacity fade", () => {
    const [c] = compileClipAnimations([anim({ params: { amount: 20 } })], 3000, CANVAS);
    const blur = c.curves.find((cu) => cu.property === "blur")?.keyframes ?? [];
    expect(blur[0].value).toBe(20);
    expect(blur[blur.length - 1].value).toBe(0);
    const op = c.curves.find((cu) => cu.property === "opacity")?.keyframes ?? [];
    expect(op[0].value).toBe(0);
    expect(op[op.length - 1].value).toBe(1);
  });

  it("blur reverses to 0→heavy for the out role (defocus)", () => {
    const [c] = compileClipAnimations([anim({ role: "out" })], 3000, CANVAS);
    const blur = c.curves.find((cu) => cu.property === "blur")?.keyframes ?? [];
    expect(blur[0].value).toBe(0);
    expect(blur[blur.length - 1].value).toBe(12); // default amount
    expect(c.holdAfter).toBe(true);
  });

  it("flash compiles a 0→intensity→0 brightness curve", () => {
    const [c] = compileClipAnimations(
      [anim({ preset: "flash", role: "emphasis", params: { intensity: 0.5 } })],
      3000,
      CANVAS
    );
    const b = c.curves.find((cu) => cu.property === "brightness")?.keyframes ?? [];
    expect(b.map((k) => k.value)).toEqual([0, 0.5, 0]);
  });

  it("colorFade compiles a 0→1 saturation curve (grayscale → color)", () => {
    const [c] = compileClipAnimations([anim({ preset: "colorFade" })], 3000, CANVAS);
    const sat = c.curves.find((cu) => cu.property === "saturation")?.keyframes ?? [];
    expect(sat[0].value).toBe(0);
    expect(sat[sat.length - 1].value).toBe(1);
  });

  it("is deterministic — same inputs give deeply equal output", () => {
    const input = [anim(), anim({ id: "e2", preset: "flash", role: "emphasis" })];
    expect(compileClipAnimations(input, 3000, CANVAS)).toEqual(
      compileClipAnimations(input, 3000, CANVAS)
    );
  });
});

describe("effect sample folds", () => {
  it("blur/opacity are identity outside the window (no lingering effect cost)", () => {
    const c = compileClipAnimations([anim({ easing: "linear" })], 3000, CANVAS);
    const s = sampleAnimations(c, 1000);
    expect(s.blur).toBe(0);
    expect(s.brightness).toBe(0);
    expect(s.saturation).toBe(1);
  });

  it("reports mid-window blur with linear easing", () => {
    const c = compileClipAnimations(
      [anim({ easing: "linear", params: { amount: 12 } })],
      3000,
      CANVAS
    );
    const s = sampleAnimations(c, 250); // t=0.5 of [0,500]
    expect(s.blur).toBeCloseTo(6, 6);
    expect(s.opacity).toBeCloseTo(0.5, 6);
  });

  it("holds t=0 blur (fully soft) during an 'in' delay", () => {
    const c = compileClipAnimations(
      [anim({ delayMs: 300, params: { amount: 10 } })],
      3000,
      CANVAS
    );
    const s = sampleAnimations(c, 100);
    expect(s.blur).toBe(10);
    expect(s.opacity).toBe(0);
  });

  it("adds concurrent blur radii and multiplies concurrent saturation", () => {
    // A blur-in and a colorFade-in on the same clip, both linear.
    const c = compileClipAnimations(
      [
        anim({ id: "b", easing: "linear", params: { amount: 8 } }),
        anim({ id: "s", preset: "colorFade", easing: "linear" })
      ],
      3000,
      CANVAS
    );
    const s = sampleAnimations(c, 300); // both windows [0,500]: t=0.6
    expect(s.blur).toBeCloseTo(8 * 0.4, 6); // 8→0 at t=0.6 → 3.2
    expect(s.saturation).toBeCloseTo(0.6, 6); // 0→1 at t=0.6
  });

  it("adds concurrent brightness and clamps to [-1, 1]", () => {
    // Two flashes at their peak sum to 1.2 → clamped to 1.
    const c = compileClipAnimations(
      [
        { id: "f1", role: "emphasis", preset: "flash", durationMs: 400, easing: "linear", params: { intensity: 0.6 } },
        { id: "f2", role: "emphasis", preset: "flash", durationMs: 400, easing: "linear", params: { intensity: 0.6 } }
      ],
      3000,
      CANVAS
    );
    const s = sampleAnimations(c, 200); // t=0.5 → peak of each
    expect(s.brightness).toBe(1);
  });

  it("resets effect fields on a reused scratch object", () => {
    const c = compileClipAnimations([anim({ easing: "linear" })], 3000, CANVAS);
    const scratch = sampleAnimations(c, 250);
    expect(scratch.blur).toBeGreaterThan(0);
    const after = sampleAnimations(c, 1000, scratch);
    expect(after.blur).toBe(0);
    expect(after.brightness).toBe(0);
    expect(after.saturation).toBe(1);
  });
});
