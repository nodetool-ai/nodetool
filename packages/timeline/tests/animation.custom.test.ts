import { describe, expect, it, vi } from "vitest";
import {
  buildCustomAnimationInputs,
  curvesFromSamples,
  curvesFromScriptOutput,
  normalizeCustomCurves,
  resolveCustomMask,
  CUSTOM_ANIMATION_PRESET_ID,
  MAX_CUSTOM_CURVES,
  MAX_CUSTOM_KEYFRAMES
} from "../src/animation/custom.js";
import { compileClipAnimations } from "../src/animation/compile.js";
import { sampleAnimations } from "../src/animation/sample.js";
import type { ClipAnimation } from "../src/animation/types.js";

const CANVAS = { width: 1920, height: 1080 };

function customAnim(overrides: Partial<ClipAnimation> = {}): ClipAnimation {
  return {
    id: "c1",
    role: "in",
    preset: CUSTOM_ANIMATION_PRESET_ID,
    durationMs: 500,
    custom: {
      curves: [
        { property: "opacity", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] }
      ]
    },
    ...overrides
  };
}

/** Every rejection path below must produce an error, never a silent pass. */
function expectRejected(result: { ok: boolean }, match: RegExp): void {
  expect(result.ok).toBe(false);
  expect((result as { error: string }).error).toMatch(match);
}

describe("normalizeCustomCurves", () => {
  it("accepts a well-formed curve unchanged", () => {
    const result = normalizeCustomCurves([
      { property: "offsetY", keyframes: [{ t: 0, value: -100 }, { t: 1, value: 0 }] }
    ]);
    expect(result).toEqual({
      ok: true,
      curves: [
        { property: "offsetY", keyframes: [{ t: 0, value: -100 }, { t: 1, value: 0 }] }
      ]
    });
  });

  it("sorts keyframes and pins the endpoints by holding the end values", () => {
    const result = normalizeCustomCurves([
      {
        property: "scale",
        keyframes: [
          { t: 0.8, value: 1 },
          { t: 0.2, value: 2 }
        ]
      }
    ]);
    expect(result.ok).toBe(true);
    expect(result.ok && result.curves[0].keyframes).toEqual([
      { t: 0, value: 2 },
      { t: 0.2, value: 2 },
      { t: 0.8, value: 1 },
      { t: 1, value: 1 }
    ]);
  });

  it("clamps out-of-range t into 0..1", () => {
    const result = normalizeCustomCurves([
      {
        property: "opacity",
        keyframes: [
          { t: -3, value: 0 },
          { t: 7, value: 1 }
        ]
      }
    ]);
    expect(result.ok && result.curves[0].keyframes).toEqual([
      { t: 0, value: 0 },
      { t: 1, value: 1 }
    ]);
  });

  it("rejects a property this build does not animate", () => {
    expectRejected(
      normalizeCustomCurves([
        { property: "skewX", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] }
      ]),
      /skewX/
    );
  });

  it("rejects non-finite keyframe values", () => {
    expectRejected(
      normalizeCustomCurves([
        { property: "opacity", keyframes: [{ t: 0, value: Number.NaN }, { t: 1, value: 1 }] }
      ]),
      /finite/
    );
  });

  it("rejects two curves driving one property", () => {
    expectRejected(
      normalizeCustomCurves([
        { property: "opacity", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] },
        { property: "opacity", keyframes: [{ t: 0, value: 1 }, { t: 1, value: 0 }] }
      ]),
      /one curve per property/
    );
  });

  it("rejects a runaway keyframe count rather than baking it into the document", () => {
    const keyframes = Array.from({ length: MAX_CUSTOM_KEYFRAMES + 1 }, (_, i) => ({
      t: i / MAX_CUSTOM_KEYFRAMES,
      value: i
    }));
    expectRejected(
      normalizeCustomCurves([{ property: "offsetX", keyframes }]),
      /the limit is/
    );
  });

  it("rejects more curves than an animation may carry", () => {
    const curves = Array.from({ length: MAX_CUSTOM_CURVES + 1 }, () => ({
      property: "opacity",
      keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }]
    }));
    expectRejected(normalizeCustomCurves(curves), /the limit is/);
  });

  it("rejects an empty or non-array payload", () => {
    expectRejected(normalizeCustomCurves([]), /empty/);
    expectRejected(normalizeCustomCurves(undefined), /must be an array/);
    expectRejected(normalizeCustomCurves({ property: "opacity" }), /must be an array/);
  });
});

describe("curvesFromSamples", () => {
  it("splits a per-time bag into one curve per property", () => {
    const result = curvesFromSamples([
      { t: 0, opacity: 0, offsetY: 40 },
      { t: 0.5, opacity: 1, offsetY: 20 },
      { t: 1, opacity: 1, offsetY: 0 }
    ]);
    expect(result.ok).toBe(true);
    expect(result.ok && result.curves.map((c) => c.property).sort()).toEqual([
      "offsetY",
      "opacity"
    ]);
    expect(result.ok && result.curves.find((c) => c.property === "offsetY")!.keyframes).toEqual([
      { t: 0, value: 40 },
      { t: 0.5, value: 20 },
      { t: 1, value: 0 }
    ]);
  });

  it("reproduces a sampled function to the sampler's interpolation", () => {
    const f = (t: number) => Math.sin(t * Math.PI);
    const samples = Array.from({ length: 61 }, (_, i) => ({
      t: i / 60,
      offsetY: f(i / 60)
    }));
    const result = curvesFromSamples(samples);
    expect(result.ok).toBe(true);
    const compiled = compileClipAnimations(
      [customAnim({ durationMs: 1000, custom: { curves: result.ok ? result.curves : [] } })],
      1000,
      CANVAS
    );
    // Midpoint of the window: sin(pi/2) = 1, hit exactly by a sample.
    expect(sampleAnimations(compiled, 500).offsetY).toBeCloseTo(1, 6);
    // Between samples the linear interpolation stays within the sampling error.
    expect(sampleAnimations(compiled, 125).offsetY).toBeCloseTo(f(0.125), 3);
  });

  it("rejects a property set on only some samples", () => {
    expectRejected(
      curvesFromSamples([
        { t: 0, opacity: 0 },
        { t: 1, opacity: 1, scale: 2 }
      ]),
      /set it on every sample or on none/
    );
  });

  it("rejects an unknown property and a non-numeric value", () => {
    expectRejected(curvesFromSamples([{ t: 0, wobble: 1 }, { t: 1, wobble: 2 }]), /wobble/);
    expectRejected(
      curvesFromSamples([{ t: 0, opacity: "x" }, { t: 1, opacity: 1 }]),
      /not a finite number/
    );
  });

  it("rejects fewer than two points", () => {
    expectRejected(curvesFromSamples([{ t: 0, opacity: 1 }]), /at least two points/);
  });
});

describe("curvesFromScriptOutput", () => {
  it("reads either output shape", () => {
    expect(
      curvesFromScriptOutput({
        curves: [{ property: "opacity", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] }]
      }).ok
    ).toBe(true);
    expect(
      curvesFromScriptOutput({ samples: [{ t: 0, opacity: 0 }, { t: 1, opacity: 1 }] }).ok
    ).toBe(true);
  });

  it("rejects a body that returned both, neither, or nothing", () => {
    expectRejected(curvesFromScriptOutput({ curves: [], samples: [] }), /return one/);
    expectRejected(curvesFromScriptOutput({ other: 1 }), /neither/);
    expectRejected(curvesFromScriptOutput(undefined), /returned no object/);
  });
});

describe("resolveCustomMask", () => {
  const wipeCurves = [
    { property: "wipeProgress" as const, keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] }
  ];

  it("refuses a wipeProgress curve with no mask rather than inventing one", () => {
    expectRejected(resolveCustomMask(wipeCurves, undefined), /needs a mask/);
  });

  it("accepts a well-formed mask", () => {
    expect(resolveCustomMask(wipeCurves, { direction: "up", softness: 0.25 })).toEqual({
      ok: true,
      mask: { direction: "up", softness: 0.25 }
    });
  });

  it("rejects a bad direction or out-of-range softness", () => {
    expectRejected(resolveCustomMask(wipeCurves, { direction: "sideways", softness: 0 }), /direction/);
    expectRejected(resolveCustomMask(wipeCurves, { direction: "left", softness: 2 }), /softness/);
  });

  it("leaves a non-wipe animation unmasked", () => {
    const curves = [
      { property: "opacity" as const, keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] }
    ];
    expect(resolveCustomMask(curves, undefined)).toEqual({ ok: true });
  });
});

describe("buildCustomAnimationInputs", () => {
  it("hands the body the clip's canvas so it can resolve normalized distances", () => {
    expect(
      buildCustomAnimationInputs({
        role: "out",
        durationMs: 400,
        clipDurationMs: 3000,
        canvas: CANVAS,
        params: { amplitude: 0.2 }
      })
    ).toEqual({
      role: "out",
      durationMs: 400,
      clipDurationMs: 3000,
      canvasWidth: 1920,
      canvasHeight: 1080,
      params: { amplitude: 0.2 },
      staggerCount: 0,
      sampleCount: 60
    });
  });
});

describe("compileClipAnimations with a custom preset", () => {
  it("compiles baked curves onto the same window a preset would get", () => {
    const [compiled] = compileClipAnimations(
      [customAnim({ delayMs: 200, durationMs: 500 })],
      3000,
      CANVAS
    );
    expect(compiled.windowStartMs).toBe(200);
    expect(compiled.windowEndMs).toBe(700);
    expect(compiled.holdBefore).toBe(true);
    expect(compiled.curves[0].property).toBe("opacity");
  });

  it("defaults custom segments to linear so a baked f(t) is not re-shaped", () => {
    const [compiled] = compileClipAnimations([customAnim()], 3000, CANVAS);
    expect(compiled.curves[0].keyframes.every((kf) => kf.easing === "linear")).toBe(true);
  });

  it("still honors an explicit easing on the animation", () => {
    const [compiled] = compileClipAnimations(
      [customAnim({ easing: "easeOutBack" })],
      3000,
      CANVAS
    );
    expect(compiled.curves[0].keyframes.every((kf) => kf.easing === "easeOutBack")).toBe(true);
  });

  it("does NOT time-reverse an 'out' custom animation — the body owns its role", () => {
    const [compiled] = compileClipAnimations(
      [customAnim({ role: "out", durationMs: 500 })],
      3000,
      CANVAS
    );
    expect(compiled.windowStartMs).toBe(2500);
    expect(compiled.windowEndMs).toBe(3000);
    // The authored curve was 0 → 1 and stays 0 → 1, unlike the `fade` preset.
    expect(compiled.curves[0].keyframes[0].value).toBe(0);
    expect(compiled.curves[0].keyframes.at(-1)!.value).toBe(1);
  });

  it("carries a resolved mask onto the compiled animation", () => {
    const [compiled] = compileClipAnimations(
      [
        customAnim({
          custom: {
            curves: [
              { property: "wipeProgress", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] }
            ],
            mask: { direction: "right", softness: 0.1 }
          }
        })
      ],
      3000,
      CANVAS
    );
    expect(compiled.mask).toEqual({ direction: "right", softness: 0.1 });
  });

  it("skips an animation whose baked curves are unusable, keeping the rest", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const compiled = compileClipAnimations(
      [
        customAnim({
          id: "bad",
          custom: { curves: [{ property: "nope", keyframes: [{ t: 0, value: 0 }] }] }
        }),
        customAnim({ id: "good" })
      ],
      3000,
      CANVAS
    );
    expect(compiled).toHaveLength(1);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("skips a custom animation carrying no payload at all", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      compileClipAnimations(
        [{ id: "c", role: "in", preset: CUSTOM_ANIMATION_PRESET_ID, durationMs: 500 }],
        3000,
        CANVAS
      )
    ).toEqual([]);
    warn.mockRestore();
  });

  it("loops and staggers a custom animation like any other", () => {
    const [compiled] = compileClipAnimations(
      [
        customAnim({
          role: "loop",
          durationMs: 800,
          stagger: { unit: "word", offsetMs: 100 }
        })
      ],
      3000,
      CANVAS,
      { staggerCount: 3 }
    );
    expect(compiled.loop).toBe(true);
    expect(compiled.periodMs).toBe(800);
    expect(compiled.stagger).toEqual({
      count: 3,
      offsetMs: 100,
      from: "start",
      unitDurationMs: 800,
      maxDelayMs: 200
    });
  });
});

describe("normalizeCustomCurves — easing strings", () => {
  const withEasing = (easing: string): unknown => [
    {
      property: "opacity",
      keyframes: [
        { t: 0, value: 0 },
        { t: 1, value: 1, easing }
      ]
    }
  ];

  it("accepts the parametric grammar without reporting anything", () => {
    for (const easing of ["easeOutBack", "cubic-bezier(0.42,0,0.58,1)", "spring(180,12,1)"]) {
      const result = normalizeCustomCurves(withEasing(easing));
      expect(result.ok, easing).toBe(true);
      if (!result.ok) return;
      expect(result.unknownEasings, easing).toBeUndefined();
      expect(result.curves[0].keyframes[1].easing).toBe(easing);
    }
  });

  it("reports an easing outside the grammar without dropping the curve", () => {
    const result = normalizeCustomCurves(withEasing("cubic-bezier(1,2)"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unknownEasings).toEqual(["cubic-bezier(1,2)"]);
    // The keyframe keeps the string it was written with: the sampler eases it
    // linearly rather than the document losing the animation (I2).
    expect(result.curves[0].keyframes[1].easing).toBe("cubic-bezier(1,2)");
  });

  it("de-duplicates a repeated bad easing across curves", () => {
    const result = normalizeCustomCurves([
      {
        property: "opacity",
        keyframes: [
          { t: 0, value: 0 },
          { t: 1, value: 1, easing: "wobble" }
        ]
      },
      {
        property: "scale",
        keyframes: [
          { t: 0, value: 0, easing: "wobble" },
          { t: 1, value: 1, easing: "boing" }
        ]
      }
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unknownEasings).toEqual(["wobble", "boing"]);
  });
});
