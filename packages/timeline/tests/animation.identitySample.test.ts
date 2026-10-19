import { describe, expect, it } from "vitest";
import {
  createAnimationSample,
  isIdentitySample,
  sampleAnimations
} from "../src/animation/sample.js";

const COMPOSING_FIELDS = Object.keys(createAnimationSample()) as Array<
  keyof ReturnType<typeof createAnimationSample>
>;

describe("isIdentitySample", () => {
  it("is true for a fresh sample and for an empty animation set", () => {
    expect(isIdentitySample(createAnimationSample())).toBe(true);
    expect(isIdentitySample(sampleAnimations([], 100))).toBe(true);
  });

  it.each(COMPOSING_FIELDS.flatMap((field) => [
    [field, 1e-9],
    [field, -1e-4],
    [field, 1],
    [field, NaN]
  ] as const))("is false when %s is off identity by %s", (field, delta) => {
    const sample = createAnimationSample();
    sample[field] += delta;
    expect(isIdentitySample(sample)).toBe(false);
  });

  it("is false when a mask or a replace record is present, even if empty", () => {
    expect(
      isIdentitySample({ ...createAnimationSample(), mask: {} as never })
    ).toBe(false);
    expect(
      isIdentitySample({ ...createAnimationSample(), replacedBy: {} })
    ).toBe(false);
  });

  it("treats explicitly undefined optional fields as absent", () => {
    expect(
      isIdentitySample({
        ...createAnimationSample(),
        mask: undefined,
        replacedBy: undefined
      })
    ).toBe(true);
  });
});
