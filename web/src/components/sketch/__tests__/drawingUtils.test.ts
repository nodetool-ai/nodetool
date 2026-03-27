import { strokePressureMultiplier } from "../drawingUtils";

describe("strokePressureMultiplier", () => {
  it("maps 0 and 1 to minScale and 1", () => {
    expect(strokePressureMultiplier(0, 0.1, 1)).toBeCloseTo(0.1, 5);
    expect(strokePressureMultiplier(1, 0.1, 1)).toBeCloseTo(1, 5);
  });

  it("is linear when curve is 1", () => {
    expect(strokePressureMultiplier(0.5, 0.2, 1)).toBeCloseTo(0.6, 5);
  });

  it("applies power curve", () => {
    const linear = strokePressureMultiplier(0.5, 0, 1);
    const curved = strokePressureMultiplier(0.5, 0, 2);
    expect(curved).toBeLessThan(linear);
  });

  it("clamps pressure and minScale", () => {
    expect(strokePressureMultiplier(-1, 0.5, 1)).toBeCloseTo(0.5, 5);
    expect(strokePressureMultiplier(2, 0.5, 1)).toBeCloseTo(1, 5);
    expect(strokePressureMultiplier(0.5, 0.001, 1)).toBeGreaterThanOrEqual(0.02);
  });
});
