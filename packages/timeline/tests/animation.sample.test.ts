import { describe, expect, it } from "vitest";
import { compileClipAnimations } from "../src/animation/compile.js";
import {
  IDENTITY_SAMPLE,
  hasActiveAnimationWindow,
  sampleAnimations
} from "../src/animation/sample.js";
import { ANIMATION_PRESETS } from "../src/animation/presets.js";
import {
  ANIMATED_PROPERTIES,
  ANIMATED_PROPERTY_FOLD,
  type AnimatedProperty,
  type ClipAnimation
} from "../src/animation/types.js";

const CANVAS = { width: 1000, height: 1000 };

function compile(animations: ClipAnimation[], clipMs: number) {
  return compileClipAnimations(animations, clipMs, CANVAS);
}

/**
 * A custom animation holding one flat curve per channel, so a fold case reads
 * the value it declared rather than a preset's shape.
 */
function driver(
  id: string,
  values: Partial<Record<AnimatedProperty, number>>,
  over: Partial<ClipAnimation> = {}
): ClipAnimation {
  return {
    id,
    role: "in",
    preset: "custom",
    durationMs: 1000,
    easing: "linear",
    custom: {
      curves: Object.entries(values).map(([property, value]) => ({
        property,
        keyframes: [
          { t: 0, value: value as number },
          { t: 1, value: value as number }
        ]
      })),
      mask: { direction: "left", softness: 0 }
    },
    ...over
  };
}

describe("sampleAnimations", () => {
  it("is identity with no animations", () => {
    expect(sampleAnimations([], 100)).toEqual({ ...IDENTITY_SAMPLE });
  });

  it("holds opacity 0 during an 'in' delay, animates in the window", () => {
    const c = compile(
      [{ id: "a", role: "in", preset: "fade", durationMs: 500, delayMs: 300 }],
      3000
    );
    expect(sampleAnimations(c, 0).opacity).toBe(0); // held before window
    expect(sampleAnimations(c, 150).opacity).toBe(0); // still in delay
    const mid = sampleAnimations(c, 550).opacity; // 250ms into a 500ms window
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(sampleAnimations(c, 900).opacity).toBeCloseTo(1, 6); // after window: identity ×1
  });

  it("identity outside an emphasis window", () => {
    const c = compile(
      [{ id: "a", role: "emphasis", preset: "pulse", durationMs: 600, delayMs: 1000 }],
      3000
    );
    expect(sampleAnimations(c, 500).scale).toBe(1);
    expect(sampleAnimations(c, 1300).scale).toBeGreaterThan(1); // peak region
    expect(sampleAnimations(c, 2000).scale).toBe(1);
  });

  it("folds concurrent in + loop", () => {
    const c = compile(
      [
        { id: "a", role: "in", preset: "fade", durationMs: 500 },
        { id: "b", role: "loop", preset: "breathe", durationMs: 1000 }
      ],
      3000
    );
    const s = sampleAnimations(c, 250);
    expect(s.opacity).toBeGreaterThan(0);
    expect(s.opacity).toBeLessThan(1); // fade still running
    expect(s.scale).not.toBe(1); // breathe active
  });

  it("loop wraps continuously (value at t and t+period match)", () => {
    const c = compile(
      [{ id: "a", role: "loop", preset: "float", durationMs: 1000 }],
      5000
    );
    const s1 = sampleAnimations(c, 250);
    const s2 = sampleAnimations(c, 1250);
    expect(s2.offsetY).toBeCloseTo(s1.offsetY, 6);
  });

  it("clamps folded opacity to [0,1] under overshoot easing", () => {
    // Two pop-ins overlapping can push opacity above 1 before clamping.
    const c = compile(
      [
        { id: "a", role: "in", preset: "pop", durationMs: 500 },
        { id: "b", role: "in", preset: "fade", durationMs: 500 }
      ],
      3000
    );
    for (let ms = 0; ms <= 600; ms += 25) {
      const o = sampleAnimations(c, ms).opacity;
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThanOrEqual(1);
    }
  });

  it("writes into a provided scratch object", () => {
    const c = compile([{ id: "a", role: "in", preset: "fade", durationMs: 500 }], 3000);
    const scratch = { offsetX: 9, offsetY: 9, scale: 9, rotation: 9, opacity: 9 };
    const out = sampleAnimations(c, 250, scratch);
    expect(out).toBe(scratch);
    expect(out.offsetX).toBe(0); // reset before writing
  });
});

describe("loop start==end invariant", () => {
  const loopPresets = ANIMATION_PRESETS.filter(
    (p) => p.roles.includes("loop") && !p.fullClip
  );

  it("every repeating loop preset returns to its start value", () => {
    for (const preset of loopPresets) {
      const c = compile(
        [{ id: "x", role: "loop", preset: preset.id, durationMs: 1000 }],
        4000
      );
      for (const anim of c) {
        for (const curve of anim.curves) {
          // Angles are modular — 0 and 2π radians, 0° and 360° of hue, are
          // the same picture — so those channels are exempt.
          if (curve.property === "rotation" || curve.property === "hue") {
            continue;
          }
          const first = curve.keyframes[0].value;
          const last = curve.keyframes[curve.keyframes.length - 1].value;
          expect(last).toBeCloseTo(first, 6);
        }
      }
    }
  });
});

/**
 * The fold is declared per channel in `ANIMATED_PROPERTY_FOLD`, so these cases
 * are one per fold kind rather than one per channel: two animations drive the
 * same channel and the table decides what the pair means.
 */
describe("fold by ANIMATED_PROPERTY_FOLD", () => {
  it("adds two animations driving an `add` channel", () => {
    const c = compile([driver("a", { offsetX: 10 }), driver("b", { offsetX: 5 })], 3000);
    expect(sampleAnimations(c, 500).offsetX).toBeCloseTo(15, 6);
  });

  it("multiplies two animations driving a `multiply` channel", () => {
    const c = compile([driver("a", { scaleX: 0.5 }), driver("b", { scaleX: 0.5 })], 3000);
    expect(sampleAnimations(c, 500).scaleX).toBeCloseTo(0.25, 6);
  });

  it("keeps the smaller progress when two `min` wipes overlap", () => {
    const c = compile(
      [driver("a", { wipeProgress: 0.8 }), driver("b", { wipeProgress: 0.3 })],
      3000
    );
    expect(sampleAnimations(c, 500).mask?.progress).toBeCloseTo(0.3, 6);
  });

  it("takes the last enabled animation in document order on a `replace` channel", () => {
    const c = compile(
      [
        driver("first", { positionX: 100 }),
        driver("second", { positionX: 250 })
      ],
      3000
    );
    const s = sampleAnimations(c, 500);
    expect(s.positionX).toBe(250);
    expect(s.replacedBy?.positionX).toBe("second");
  });

  it("ignores a disabled animation when resolving the replace winner", () => {
    const c = compile(
      [
        driver("first", { positionX: 100 }),
        driver("second", { positionX: 250 }, { enabled: false })
      ],
      3000
    );
    const s = sampleAnimations(c, 500);
    expect(s.positionX).toBe(100);
    expect(s.replacedBy?.positionX).toBe("first");
  });

  it("leaves a replace channel absent when nothing drives it", () => {
    const c = compile([driver("a", { offsetX: 10 })], 3000);
    const s = sampleAnimations(c, 500);
    expect(s.positionX).toBeUndefined();
    expect(s.anchorY).toBeUndefined();
    expect(s.trimStart).toBeUndefined();
    expect(s.replacedBy).toBeUndefined();
  });

  it("clamps the driven trim range and leaves the undriven end absent", () => {
    const c = compile([driver("a", { trimStart: 1.4 })], 3000);
    const s = sampleAnimations(c, 500);
    expect(s.trimStart).toBe(1);
    expect(s.trimEnd).toBeUndefined();
  });

  it("wraps hue instead of clamping it", () => {
    const c = compile([driver("a", { hue: 400 })], 3000);
    expect(sampleAnimations(c, 500).hue).toBeCloseTo(40, 6);
  });

  it("carries every declared channel into the sample", () => {
    // A channel added to ANIMATED_PROPERTIES with no home in the sample would
    // be dropped silently; this drives each one and reads it back.
    for (const property of ANIMATED_PROPERTIES) {
      const fold = ANIMATED_PROPERTY_FOLD[property];
      const value = fold === "multiply" ? 0.5 : fold === "min" ? 0.4 : 0.25;
      const c = compile([driver("a", { [property]: value })], 3000);
      const s = sampleAnimations(c, 500);
      if (property === "wipeProgress") {
        expect(s.mask?.progress).toBeCloseTo(value, 6);
        continue;
      }
      expect(s[property], `channel ${property}`).toBeCloseTo(value, 6);
    }
  });
});

describe("hasActiveAnimationWindow", () => {
  it("is true inside the window and false outside (non-hold)", () => {
    const c = compile(
      [{ id: "a", role: "emphasis", preset: "pulse", durationMs: 600, delayMs: 500 }],
      3000
    );
    expect(hasActiveAnimationWindow(c, 100)).toBe(false);
    expect(hasActiveAnimationWindow(c, 700)).toBe(true);
    expect(hasActiveAnimationWindow(c, 2000)).toBe(false);
  });

  it("is true throughout a loop", () => {
    const c = compile([{ id: "a", role: "loop", preset: "rotate", durationMs: 1000 }], 3000);
    expect(hasActiveAnimationWindow(c, 0)).toBe(true);
    expect(hasActiveAnimationWindow(c, 2999)).toBe(true);
  });
});
