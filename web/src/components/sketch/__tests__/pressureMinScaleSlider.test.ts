import {
  pressureMinScaleFromSliderUnit,
  pressureMinScaleToSliderUnit,
  DEFAULT_PRESSURE_MIN_SCALE
} from "../types";

describe("pressureMinScale slider mapping", () => {
  it("round-trips near default", () => {
    const u = pressureMinScaleToSliderUnit(DEFAULT_PRESSURE_MIN_SCALE);
    const back = pressureMinScaleFromSliderUnit(u);
    expect(back).toBeCloseTo(DEFAULT_PRESSURE_MIN_SCALE, 5);
  });

  it("is monotonic increasing in stored scale", () => {
    const samples: number[] = [];
    for (let s = 0; s <= 100; s++) {
      samples.push(pressureMinScaleFromSliderUnit(s / 100));
    }
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1] - 1e-9);
    }
  });

  it("maps slider endpoints to UI min/max", () => {
    expect(pressureMinScaleFromSliderUnit(0)).toBeCloseTo(0.02, 8);
    expect(pressureMinScaleFromSliderUnit(1)).toBeCloseTo(0.55, 8);
  });
});
