/**
 * `hold`: a step easing. The segment it eases shows the PREVIOUS keyframe's
 * value for its whole length and jumps at the ending keyframe's own time —
 * which is the keyframe that carries the easing, the same rule every other
 * segment follows.
 */
import { describe, expect, it } from "vitest";

import { EASING_IDS, ease, parseEasing } from "../src/animation/easing.js";
import { compileClipAnimations } from "../src/animation/compile.js";
import { sampleAnimations } from "../src/animation/sample.js";
import { evaluateTimeRemapMs } from "../src/timeRemap.js";
import type { ClipAnimation } from "../src/animation/types.js";

const CANVAS = { width: 1920, height: 1080 };

/** `offsetY` of a 1000ms emphasis animation at clip-local `localMs`. */
function offsetYAt(
  keyframes: ReadonlyArray<{ t: number; value: number; easing?: string }>,
  localMs: number
): number {
  const animation: ClipAnimation = {
    id: "anim-1",
    role: "emphasis",
    preset: "custom",
    durationMs: 1000,
    delayMs: 0,
    custom: { curves: [{ property: "offsetY", keyframes: [...keyframes] }] }
  };
  const compiled = compileClipAnimations([animation], 1000, CANVAS);
  return sampleAnimations(compiled, localMs).offsetY;
}

describe("hold easing", () => {
  it("is a named easing the grammar parses", () => {
    expect(EASING_IDS).toContain("hold");
    expect(parseEasing("hold")).not.toBeNull();
  });

  it("makes no progress until the segment's own end", () => {
    expect(ease("hold", 0)).toBe(0);
    expect(ease("hold", 0.999999)).toBe(0);
    expect(ease("hold", 1)).toBe(1);
  });

  it("changes value exactly at the keyframe time, not before", () => {
    const keyframes = [
      { t: 0, value: 0 },
      { t: 0.5, value: 100, easing: "hold" },
      { t: 1, value: 100 }
    ];
    expect(offsetYAt(keyframes, 0)).toBe(0);
    expect(offsetYAt(keyframes, 499)).toBe(0);
    expect(offsetYAt(keyframes, 499.999)).toBe(0);
    expect(offsetYAt(keyframes, 500)).toBe(100);
  });

  it("composes with a bezier keyframe after it", () => {
    const keyframes = [
      { t: 0, value: 0 },
      { t: 0.5, value: 100, easing: "hold" },
      { t: 1, value: 200, easing: "cubic-bezier(0.42,0,0.58,1)" }
    ];
    // The hold segment stays flat, then the bezier segment eases 100 → 200.
    expect(offsetYAt(keyframes, 400)).toBe(0);
    expect(offsetYAt(keyframes, 500)).toBe(100);
    expect(offsetYAt(keyframes, 750)).toBeCloseTo(150, 5); // bezier midpoint
    expect(offsetYAt(keyframes, 600)).toBeGreaterThan(100);
    expect(offsetYAt(keyframes, 600)).toBeLessThan(150);
    expect(offsetYAt(keyframes, 1000)).toBeCloseTo(200, 5);
  });

  it("freezes a time remap until its keyframe", () => {
    const remap = {
      keyframes: [
        { t: 0, sourceMs: 0 },
        { t: 1, sourceMs: 5000, easing: "hold" }
      ]
    };
    expect(evaluateTimeRemapMs(remap, 0.9)).toBe(0);
    expect(evaluateTimeRemapMs(remap, 1)).toBe(5000);
  });
});
