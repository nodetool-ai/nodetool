import { computeGridStep } from "../pixiUtils";

describe("computeGridStep", () => {
  it("returns base size when spacing meets minimum", () => {
    expect(computeGridStep(20, 4, 64)).toBe(20);
  });

  it("scales step up until minimum spacing is met", () => {
    expect(computeGridStep(10, 1, 64)).toBe(80);
  });

  it("handles invalid base size", () => {
    expect(computeGridStep(0, 1, 64)).toBe(64);
  });
});
