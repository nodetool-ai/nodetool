import { describe, expect, it } from "vitest";
import {
  compileClipAnimations,
  countStaggerUnits,
  staggerUnitDelayMs,
  type CompiledStagger
} from "../src/animation/compile.js";
import {
  hasStaggeredAnimation,
  sampleAnimations,
  sampleStaggeredAnimations
} from "../src/animation/sample.js";
import type { ClipAnimation } from "../src/animation/types.js";

const CANVAS = { width: 1920, height: 1080 };

function anim(overrides: Partial<ClipAnimation> = {}): ClipAnimation {
  return {
    id: "s1",
    role: "in",
    preset: "fade",
    durationMs: 400,
    easing: "linear",
    stagger: { unit: "word", offsetMs: 100 },
    ...overrides
  };
}

describe("countStaggerUnits", () => {
  it("counts whitespace-separated words across lines", () => {
    expect(countStaggerUnits("hello brave new world")).toBe(4);
    expect(countStaggerUnits("hello\nbrave  new\tworld")).toBe(4);
    expect(countStaggerUnits("  one  ")).toBe(1);
    expect(countStaggerUnits("")).toBe(0);
  });
});

describe("stagger compile", () => {
  it("stretches the in-window to durationMs + (count-1)*offsetMs", () => {
    const [c] = compileClipAnimations([anim()], 5000, CANVAS, {
      staggerCount: 4
    });
    expect(c.windowStartMs).toBe(0);
    expect(c.windowEndMs).toBe(400 + 3 * 100);
    expect(c.stagger).toEqual({
      unit: "word",
      count: 4,
      offsetMs: 100,
      from: "start",
      unitDurationMs: 400,
      maxDelayMs: 300,
      compressed: false
    } satisfies CompiledStagger);
  });

  it("anchors the out-span so the last unit ends at clip end minus delay", () => {
    const [c] = compileClipAnimations(
      [anim({ role: "out", delayMs: 200 })],
      5000,
      CANVAS,
      { staggerCount: 4 }
    );
    expect(c.windowEndMs).toBe(4800);
    expect(c.windowStartMs).toBe(4800 - 400 - 300);
  });

  it("shrinks the offset (not the unit duration) on short clips", () => {
    // 4 words, 400ms each, 100ms offset needs 700ms — clip only has 550.
    const [c] = compileClipAnimations([anim()], 550, CANVAS, {
      staggerCount: 4
    });
    expect(c.stagger?.unitDurationMs).toBe(400);
    expect(c.stagger?.offsetMs).toBeCloseTo(50, 6);
    expect(c.windowEndMs).toBeCloseTo(550, 6);
  });

  it("degenerates to a plain block animation when no offset fits", () => {
    const [c] = compileClipAnimations([anim()], 300, CANVAS, {
      staggerCount: 4
    });
    expect(c.stagger).toBeUndefined();
    expect(c.windowEndMs).toBe(300);
  });

  it("compiles un-staggered without staggerCount, with one word, or with an unknown unit", () => {
    for (const opts of [
      {},
      { staggerCount: 1 },
      undefined
    ] as const) {
      const [c] = compileClipAnimations([anim()], 5000, CANVAS, opts);
      expect(c.stagger).toBeUndefined();
      expect(c.windowEndMs).toBe(400);
    }
    const [c] = compileClipAnimations(
      [anim({ stagger: { unit: "character", offsetMs: 100 } })],
      5000,
      CANVAS,
      { staggerCount: 4 }
    );
    expect(c.stagger).toBeUndefined();
  });

  it("keeps loop staggers as a pure phase shift (no span stretch)", () => {
    const [c] = compileClipAnimations(
      [anim({ role: "loop", preset: "float", durationMs: 2000 })],
      6000,
      CANVAS,
      { staggerCount: 3 }
    );
    expect(c.loop).toBe(true);
    expect(c.windowEndMs).toBe(6000);
    expect(c.stagger?.offsetMs).toBe(100);
    expect(c.stagger?.unitDurationMs).toBe(2000);
  });

  it("is deterministic", () => {
    const input = [anim()];
    expect(
      compileClipAnimations(input, 5000, CANVAS, { staggerCount: 4 })
    ).toEqual(compileClipAnimations(input, 5000, CANVAS, { staggerCount: 4 }));
  });
});

describe("staggerUnitDelayMs", () => {
  const stagger: CompiledStagger = {
    count: 4,
    offsetMs: 100,
    from: "start",
    unitDurationMs: 400,
    maxDelayMs: 300
  };

  it("orders from start", () => {
    expect([0, 1, 2, 3].map((i) => staggerUnitDelayMs(stagger, i))).toEqual([
      0, 100, 200, 300
    ]);
  });

  it("orders from end", () => {
    const s = { ...stagger, from: "end" as const };
    expect([0, 1, 2, 3].map((i) => staggerUnitDelayMs(s, i))).toEqual([
      300, 200, 100, 0
    ]);
  });

  it("orders from center, rippling outward", () => {
    const s = { ...stagger, from: "center" as const, maxDelayMs: 150 };
    expect([0, 1, 2, 3].map((i) => staggerUnitDelayMs(s, i))).toEqual([
      150, 50, 50, 150
    ]);
  });
});

describe("staggered sampling", () => {
  const compiled = compileClipAnimations([anim()], 5000, CANVAS, {
    staggerCount: 4
  });

  it("delays each word by index*offset", () => {
    // Word 0 window [0,400], word 2 window [200,600]; linear fade.
    expect(sampleStaggeredAnimations(compiled, 200, 0).opacity).toBeCloseTo(
      0.5,
      6
    );
    expect(sampleStaggeredAnimations(compiled, 200, 2).opacity).toBe(0);
    expect(sampleStaggeredAnimations(compiled, 400, 2).opacity).toBeCloseTo(
      0.5,
      6
    );
  });

  it("holds words at t=0 before their window and identity after (in role)", () => {
    expect(sampleStaggeredAnimations(compiled, 0, 3).opacity).toBe(0);
    expect(sampleStaggeredAnimations(compiled, 4000, 0)).toEqual(
      sampleStaggeredAnimations([], 0, 0)
    );
  });

  it("holds the out state after a word's window (out role)", () => {
    const outCompiled = compileClipAnimations(
      [anim({ role: "out" })],
      5000,
      CANVAS,
      { staggerCount: 4 }
    );
    // First word finishes disappearing at windowStart+400 and stays gone.
    const start = outCompiled[0].windowStartMs;
    expect(
      sampleStaggeredAnimations(outCompiled, start + 500, 0).opacity
    ).toBe(0);
    expect(sampleStaggeredAnimations(outCompiled, 5000, 3).opacity).toBe(0);
  });

  it("is deterministic and identity for out-of-range times", () => {
    const a = sampleStaggeredAnimations(compiled, 250, 1);
    const b = sampleStaggeredAnimations(compiled, 250, 1);
    expect(a).toEqual(b);
  });

  it("block sampler skips staggered motion but keeps a mixed clip's block animations", () => {
    const mixed = compileClipAnimations(
      [
        anim(),
        anim({ id: "s2", preset: "slide", stagger: undefined, role: "in" })
      ],
      5000,
      CANVAS,
      { staggerCount: 4 }
    );
    const s = sampleAnimations(mixed, 200);
    // The staggered fade's opacity must not fold at block level...
    const slideOnly = sampleAnimations(
      compileClipAnimations(
        [anim({ id: "s2", preset: "slide", stagger: undefined })],
        5000,
        CANVAS
      ),
      200
    );
    expect(s.opacity).toBeCloseTo(slideOnly.opacity, 6);
    expect(s.offsetX).toBeCloseTo(slideOnly.offsetX, 6);
  });

  it("per-word sampler ignores un-staggered animations", () => {
    const mixed = compileClipAnimations(
      [anim(), anim({ id: "s2", preset: "slide", stagger: undefined })],
      5000,
      CANVAS,
      { staggerCount: 4 }
    );
    const s = sampleStaggeredAnimations(mixed, 200, 0);
    expect(s.offsetX).toBe(0); // slide applied at block level only
    expect(s.opacity).toBeCloseTo(0.5, 6);
  });

  it("hasStaggeredAnimation reflects compiled staggers", () => {
    expect(hasStaggeredAnimation(compiled)).toBe(true);
    expect(
      hasStaggeredAnimation(
        compileClipAnimations([anim({ stagger: undefined })], 5000, CANVAS)
      )
    ).toBe(false);
  });
});

describe("stagger units on the compiled animation", () => {
  it("reports compression only when the span had to be squeezed", () => {
    const [roomy] = compileClipAnimations([anim()], 5000, CANVAS, {
      staggerCount: 4
    });
    expect(roomy.stagger?.compressed).toBe(false);

    // 4 units × 400ms each, 100ms apart needs 700ms; the clip has 550.
    const [squeezed] = compileClipAnimations([anim()], 550, CANVAS, {
      staggerCount: 4
    });
    expect(squeezed.stagger?.compressed).toBe(true);
    expect(squeezed.stagger?.offsetMs).toBeLessThan(100);
  });

  it("carries the unit the count was taken in", () => {
    const [c] = compileClipAnimations(
      [anim({ stagger: { unit: "character", offsetMs: 100 } })],
      5000,
      CANVAS,
      { staggerCount: 5, staggerUnit: "character" }
    );
    expect(c.stagger?.unit).toBe("character");
    expect(c.stagger?.count).toBe(5);
  });

  it("compiles un-staggered when the animation's unit is not the clip's", () => {
    // A clip lays out in one unit, so a second animation asking for another
    // one animates the whole block instead of mis-indexing the first's units.
    const [perLine, perWord] = compileClipAnimations(
      [
        anim({ id: "a", stagger: { unit: "line", offsetMs: 100 } }),
        anim({ id: "b", stagger: { unit: "word", offsetMs: 100 } })
      ],
      5000,
      CANVAS,
      { staggerCount: 2, staggerUnit: "line" }
    );
    expect(perLine.stagger?.unit).toBe("line");
    expect(perWord.stagger).toBeUndefined();
  });

  it("gives a five-character word five windows 100ms apart", () => {
    const [c] = compileClipAnimations(
      [anim({ stagger: { unit: "character", offsetMs: 100 } })],
      5000,
      CANVAS,
      { staggerCount: 5, staggerUnit: "character" }
    );
    const stagger = c.stagger;
    if (!stagger) throw new Error("expected a compiled stagger");
    const starts = [0, 1, 2, 3, 4].map((i) => staggerUnitDelayMs(stagger, i));
    expect(starts).toEqual([0, 100, 200, 300, 400]);
    expect(c.windowStartMs).toBe(0);
    expect(c.windowEndMs).toBe(400 + 400);

    // Each character's own window opens at its delay and runs the authored
    // duration, so the last one is still mid-flight when the span ends.
    const opacityAt = (localMs: number, index: number) =>
      sampleStaggeredAnimations([c], localMs, index).opacity;
    expect(opacityAt(200, 0)).toBeCloseTo(0.5, 6);
    expect(opacityAt(200, 2)).toBe(0);
    expect(opacityAt(600, 4)).toBeCloseTo(0.5, 6);
  });
});
