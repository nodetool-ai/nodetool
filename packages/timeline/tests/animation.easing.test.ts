import { describe, expect, it } from "vitest";
import { ease } from "../src/animation/easing.js";
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
