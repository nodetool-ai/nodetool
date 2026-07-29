import { describe, expect, it, vi } from "vitest";
import { compileClipAnimations } from "../src/animation/compile.js";
import type { ClipAnimation } from "../src/animation/types.js";

const CANVAS = { width: 1920, height: 1080 };

function anim(overrides: Partial<ClipAnimation>): ClipAnimation {
  return {
    id: "a1",
    role: "in",
    preset: "fade",
    durationMs: 500,
    ...overrides
  };
}

describe("compileClipAnimations", () => {
  it("returns [] for undefined / empty", () => {
    expect(compileClipAnimations(undefined, 3000, CANVAS)).toEqual([]);
    expect(compileClipAnimations([], 3000, CANVAS)).toEqual([]);
  });

  it("places an 'in' window at [delay, delay+duration] with holdBefore", () => {
    const [c] = compileClipAnimations([anim({ delayMs: 200, durationMs: 500 })], 3000, CANVAS);
    expect(c.windowStartMs).toBe(200);
    expect(c.windowEndMs).toBe(700);
    expect(c.holdBefore).toBe(true);
    expect(c.holdAfter).toBe(false);
    expect(c.loop).toBe(false);
  });

  it("measures an 'out' window from the clip end with holdAfter", () => {
    const [c] = compileClipAnimations(
      [anim({ role: "out", preset: "fade", delayMs: 0, durationMs: 500 })],
      3000,
      CANVAS
    );
    expect(c.windowEndMs).toBe(3000);
    expect(c.windowStartMs).toBe(2500);
    expect(c.holdAfter).toBe(true);
    expect(c.holdBefore).toBe(false);
  });

  it("clamps a window longer than the clip", () => {
    const [c] = compileClipAnimations([anim({ durationMs: 5000 })], 1000, CANVAS);
    expect(c.windowStartMs).toBe(0);
    expect(c.windowEndMs).toBe(1000);
  });

  it("drops a window that starts at or after clip end", () => {
    expect(compileClipAnimations([anim({ delayMs: 4000 })], 3000, CANVAS)).toEqual([]);
  });

  it("skips disabled animations", () => {
    expect(compileClipAnimations([anim({ enabled: false })], 3000, CANVAS)).toEqual([]);
  });

  it("skips unknown presets with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(compileClipAnimations([anim({ preset: "does-not-exist" })], 3000, CANVAS)).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("skips a role the preset does not allow", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // fade only allows in/out
    expect(compileClipAnimations([anim({ role: "loop", preset: "fade" })], 3000, CANVAS)).toEqual(
      []
    );
    warn.mockRestore();
  });

  it("compiles a loop over the whole clip with a period", () => {
    const [c] = compileClipAnimations(
      [anim({ role: "loop", preset: "float", durationMs: 1000 })],
      5000,
      CANVAS
    );
    expect(c.loop).toBe(true);
    expect(c.periodMs).toBe(1000);
    expect(c.windowStartMs).toBe(0);
    expect(c.windowEndMs).toBe(5000);
  });

  it("compiles kenBurns as a full-clip one-shot ignoring duration/delay", () => {
    const [c] = compileClipAnimations(
      [anim({ role: "loop", preset: "kenBurns", durationMs: 500, delayMs: 999 })],
      4000,
      CANVAS
    );
    expect(c.loop).toBe(false);
    expect(c.windowStartMs).toBe(0);
    expect(c.windowEndMs).toBe(4000);
    expect(c.holdAfter).toBe(true);
  });

  it("resolves slide distance to px against the canvas", () => {
    const [c] = compileClipAnimations(
      [anim({ preset: "slide", params: { direction: "left", distance: 0.5 } })],
      3000,
      CANVAS
    );
    const offsetX = c.curves.find((cu) => cu.property === "offsetX");
    expect(offsetX?.keyframes[0].value).toBeCloseTo(-960, 3); // -0.5 * 1920
  });

  it("reverses the curve for the 'out' role", () => {
    const [inC] = compileClipAnimations([anim({ role: "in", preset: "fade" })], 3000, CANVAS);
    const [outC] = compileClipAnimations([anim({ role: "out", preset: "fade" })], 3000, CANVAS);
    const inOp = inC.curves[0].keyframes;
    const outOp = outC.curves[0].keyframes;
    expect(inOp[0].value).toBe(0);
    expect(inOp[inOp.length - 1].value).toBe(1);
    expect(outOp[0].value).toBe(1);
    expect(outOp[outOp.length - 1].value).toBe(0);
  });

  it("is deterministic — same inputs give deeply equal output", () => {
    const input = [anim({ preset: "pop", role: "in" }), anim({ role: "loop", preset: "breathe" })];
    const a = compileClipAnimations(input, 3000, CANVAS);
    const b = compileClipAnimations(input, 3000, CANVAS);
    expect(a).toEqual(b);
  });

  it("applies the animation easing override to every segment", () => {
    const [c] = compileClipAnimations(
      [anim({ preset: "pop", role: "in", easing: "linear" })],
      3000,
      CANVAS
    );
    for (const curve of c.curves) {
      for (const kf of curve.keyframes) {
        expect(kf.easing).toBe("linear");
      }
    }
  });
});
