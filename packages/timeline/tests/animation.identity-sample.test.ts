import { describe, expect, it } from "vitest";
import {
  createAnimationSample,
  isIdentitySample,
  type AnimationSample
} from "../src/animation/sample.js";

const REQUIRED_FIELDS = Object.keys(createAnimationSample()) as Array<
  keyof AnimationSample
>;

describe("isIdentitySample", () => {
  it("accepts a fresh sample", () => {
    expect(isIdentitySample(createAnimationSample())).toBe(true);
  });

  it("treats negative zero as zero", () => {
    expect(isIdentitySample({ ...createAnimationSample(), offsetX: -0 })).toBe(
      true
    );
  });

  it.each(REQUIRED_FIELDS)("rejects any change to %s", (field) => {
    const base = createAnimationSample();
    const identity = base[field] as number;
    for (const value of [identity + 1, identity - 1, identity + 1e-9, NaN]) {
      expect(isIdentitySample({ ...base, [field]: value })).toBe(false);
    }
  });

  it("rejects an active mask", () => {
    const sample = {
      ...createAnimationSample(),
      mask: { direction: "left" as const, progress: 0.5, softness: 0 }
    };
    expect(isIdentitySample(sample)).toBe(false);
  });

  it("rejects a sample that recorded a replace channel, even at value 0", () => {
    const sample = {
      ...createAnimationSample(),
      positionX: 0,
      replacedBy: { positionX: "a" }
    };
    expect(isIdentitySample(sample)).toBe(false);
  });
});
