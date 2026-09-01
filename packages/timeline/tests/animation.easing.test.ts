import { describe, expect, it } from "vitest";
import { ease, parseEasing } from "../src/animation/easing.js";
import type { EasingId } from "../src/animation/types.js";

const ALL: EasingId[] = [
  "linear",
  "easeIn",
  "easeOut",
  "easeInOut",
  "easeOutBack",
  "easeOutElastic",
  "easeOutBounce"
];

describe("ease", () => {
  it("maps endpoints exactly for every easing", () => {
    for (const id of ALL) {
      expect(ease(id, 0)).toBeCloseTo(0, 6);
      expect(ease(id, 1)).toBeCloseTo(1, 6);
    }
  });

  it("easeOut is monotonic increasing", () => {
    let prev = -Infinity;
    for (let i = 0; i <= 20; i++) {
      const v = ease("easeOut", i / 20);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("easeOutBack overshoots past 1", () => {
    let maxV = 0;
    for (let i = 0; i <= 100; i++) maxV = Math.max(maxV, ease("easeOutBack", i / 100));
    expect(maxV).toBeGreaterThan(1);
  });

  it("linear is the identity", () => {
    expect(ease("linear", 0.37)).toBeCloseTo(0.37, 6);
  });
});

describe("parseEasing — named ids", () => {
  it("resolves every named id", () => {
    for (const id of ALL) {
      expect(parseEasing(id)).toBeTypeOf("function");
    }
  });

  it("returns the same function object for a repeated string", () => {
    expect(parseEasing("cubic-bezier(0.42,0,0.58,1)")).toBe(
      parseEasing("cubic-bezier(0.42,0,0.58,1)")
    );
  });

  it("returns null for strings outside the grammar", () => {
    for (const bad of [
      "cubic-bezier(1,2)",
      "spring()",
      "wobble",
      "cubic-bezier(a,b,c,d)",
      "spring(180,12)",
      "spring(180,12,1,4)",
      "cubic-bezier(0,0,1,1",
      "",
      "spring(0,12,1)",
      "spring(180,0,1)"
    ]) {
      expect(parseEasing(bad), bad).toBeNull();
    }
  });

  it("eases linearly through `ease` when the string does not parse", () => {
    for (const bad of ["cubic-bezier(1,2)", "spring()", "wobble", "cubic-bezier(a,b,c,d)"]) {
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        expect(ease(bad, t), `${bad} @ ${t}`).toBeCloseTo(t, 12);
      }
    }
  });
});

describe("parseEasing — cubic-bezier", () => {
  it("cubic-bezier(0,0,1,1) is linear at ten points", () => {
    const fn = parseEasing("cubic-bezier(0,0,1,1)");
    expect(fn).not.toBeNull();
    for (let i = 1; i <= 10; i++) {
      const t = i / 11;
      // The solver's contract is 1e-4 on x, so that is what y inherits here:
      // for this curve dy/dx is exactly 1.
      expect(Math.abs(fn!(t) - t), `t=${t}`).toBeLessThan(1e-4);
    }
  });

  it("inverts x back to the parametric y it was drawn from", () => {
    // The independent anchor: evaluate the bezier polynomial directly at ten
    // parameter values, then ask the easing for the same x. Solving x is the
    // only part `cubicBezier` does numerically, so this is what can be wrong.
    const [x1, y1, x2, y2] = [0.42, 0, 0.58, 1];
    const at = (a: number, b: number, u: number): number =>
      3 * (1 - u) * (1 - u) * u * a + 3 * (1 - u) * u * u * b + u * u * u;
    const fn = parseEasing(`cubic-bezier(${x1},${y1},${x2},${y2})`);
    expect(fn).not.toBeNull();
    for (let i = 1; i <= 10; i++) {
      const u = i / 11;
      expect(Math.abs(fn!(at(x1, x2, u)) - at(y1, y2, u)), `u=${u}`).toBeLessThan(
        1e-3
      );
    }
  });

  it("cubic-bezier(0.42,0,0.58,1) is symmetric about (0.5, 0.5) like easeInOut", () => {
    // It is NOT numerically equal to `easeInOut`, which is a piecewise power
    // curve: they diverge by up to 0.084 near t = 0.65. What they share is the
    // shape — slow ends, fast middle, odd symmetry about the midpoint.
    const fn = parseEasing("cubic-bezier(0.42,0,0.58,1)");
    expect(fn).not.toBeNull();
    expect(fn!(0.5)).toBeCloseTo(0.5, 3);
    for (let i = 1; i <= 10; i++) {
      const t = i / 22;
      expect(fn!(t) + fn!(1 - t), `t=${t}`).toBeCloseTo(1, 3);
    }
  });

  it("tolerates whitespace in the argument list", () => {
    const spaced = parseEasing("cubic-bezier( 0.42 , 0 , 0.58 , 1 )");
    expect(spaced).not.toBeNull();
    expect(spaced!(0.4)).toBeCloseTo(ease("cubic-bezier(0.42,0,0.58,1)", 0.4), 12);
  });

  it("pins the endpoints and lets y overshoot", () => {
    const fn = parseEasing("cubic-bezier(0.34,1.56,0.64,1)");
    expect(fn).not.toBeNull();
    expect(fn!(0)).toBe(0);
    expect(fn!(1)).toBe(1);
    let peak = 0;
    for (let i = 0; i <= 100; i++) peak = Math.max(peak, fn!(i / 100));
    expect(peak).toBeGreaterThan(1);
  });

  it("clamps control x outside [0,1] instead of returning null", () => {
    const fn = parseEasing("cubic-bezier(-2,0,3,1)");
    expect(fn).not.toBeNull();
    expect(fn!(0.5)).toBeGreaterThanOrEqual(0);
    expect(fn!(0.5)).toBeLessThanOrEqual(1);
  });
});

describe("parseEasing — spring", () => {
  const SPRINGS = ["spring(180,12,1)", "spring(100,20,1)", "spring(100,60,1)", "spring(1,4,2)"];

  it("starts at 0 and lands within 1e-3 of 1", () => {
    for (const id of SPRINGS) {
      const fn = parseEasing(id);
      expect(fn, id).not.toBeNull();
      expect(fn!(0), id).toBe(0);
      expect(Math.abs(fn!(1) - 1), id).toBeLessThanOrEqual(1e-3);
    }
  });

  it("a critically damped spring never overshoots 1", () => {
    // damping = 2·√(stiffness·mass) is ζ = 1 exactly.
    const fn = parseEasing("spring(100,20,1)");
    expect(fn).not.toBeNull();
    let prev = -Infinity;
    for (let i = 0; i <= 200; i++) {
      const v = fn!(i / 200);
      expect(v).toBeLessThanOrEqual(1);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("an overdamped spring never overshoots 1 either", () => {
    const fn = parseEasing("spring(100,60,1)");
    expect(fn).not.toBeNull();
    for (let i = 0; i <= 200; i++) {
      expect(fn!(i / 200)).toBeLessThanOrEqual(1);
    }
  });

  it("an underdamped spring overshoots on the way", () => {
    const fn = parseEasing("spring(180,12,1)");
    expect(fn).not.toBeNull();
    let peak = 0;
    for (let i = 0; i <= 200; i++) peak = Math.max(peak, fn!(i / 200));
    expect(peak).toBeGreaterThan(1);
  });

  it("tolerates whitespace in the argument list", () => {
    const spaced = parseEasing("spring( 180 , 12 , 1 )");
    expect(spaced).not.toBeNull();
    expect(spaced!(0.3)).toBeCloseTo(ease("spring(180,12,1)", 0.3), 12);
  });
});
