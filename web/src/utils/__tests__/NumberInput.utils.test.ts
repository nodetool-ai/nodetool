import {
  calculateStep,
  calculateDecimalPlaces,
  calculateSpeedFactor,
  getEffectiveSliderWidth,
  applyValueConstraints
} from "../../components/inputs/NumberInput.utils";

describe("NumberInput.utils", () => {
  describe("calculateStep", () => {
    it("returns 0.1 for unbounded float input", () => {
      expect(calculateStep(undefined, undefined, "float")).toBe(0.1);
    });

    it("returns 1 for unbounded int input", () => {
      expect(calculateStep(undefined, undefined, "int")).toBe(1);
    });

    it("calculates appropriate step for small float range", () => {
      expect(calculateStep(0, 1, "float")).toBe(0.01);
      expect(calculateStep(0, 50, "float")).toBe(0.1);
      expect(calculateStep(0, 100, "float")).toBe(0.5);
    });

    it("calculates appropriate step for large float range", () => {
      expect(calculateStep(0, 1000, "float")).toBe(6);
    });

    it("calculates appropriate step for int input", () => {
      expect(calculateStep(0, 20, "int")).toBe(0.1);
      expect(calculateStep(0, 1000, "int")).toBe(1);
      expect(calculateStep(0, 5000, "int")).toBe(16);
      expect(calculateStep(0, 10000, "int")).toBe(32);
    });

    it("handles min without max", () => {
      expect(calculateStep(0, undefined, "float")).toBe(0.1);
    });

    it("handles max without min", () => {
      expect(calculateStep(undefined, 100, "float")).toBe(0.1);
    });
  });

  describe("calculateDecimalPlaces", () => {
    it("returns 0 for step of 1", () => {
      expect(calculateDecimalPlaces(1)).toBe(0);
    });

    it("returns 1 for step of 0.1", () => {
      expect(calculateDecimalPlaces(0.1)).toBe(1);
    });

    it("returns 2 for step of 0.01", () => {
      expect(calculateDecimalPlaces(0.01)).toBe(2);
    });

    it("returns 3 for step of 0.001", () => {
      expect(calculateDecimalPlaces(0.001)).toBe(3);
    });
  });

  describe("calculateSpeedFactor", () => {
    it("returns 1 at zero distance (no slowdown)", () => {
      expect(calculateSpeedFactor(0, false)).toBe(1);
    });

    it("returns minimum speed factor at maximum ramp distance", () => {
      expect(calculateSpeedFactor(100, false)).toBeLessThan(1);
    });

    it("applies extra slowdown when shift key is pressed", () => {
      const distance = 50;
      const speedWithShift = calculateSpeedFactor(distance, true);
      const speedWithoutShift = calculateSpeedFactor(distance, false);
      expect(speedWithShift).toBeLessThan(speedWithoutShift);
    });
  });

  describe("getEffectiveSliderWidth", () => {
    it("returns actual width when zoom is disabled", () => {
      expect(getEffectiveSliderWidth(false, 1, 100)).toBe(100);
    });

    it("returns actual width when zoom is 1", () => {
      expect(getEffectiveSliderWidth(true, 1, 100)).toBe(100);
    });

    it("applies zoom multiplier when enabled", () => {
      expect(getEffectiveSliderWidth(true, 2, 100)).toBe(200);
    });

    it("returns actual width for zero zoom", () => {
      expect(getEffectiveSliderWidth(true, 0, 100)).toBe(100);
    });
  });

  describe("applyValueConstraints", () => {
    it("returns input for unconstrained value", () => {
      expect(applyValueConstraints(50, undefined, undefined, "float", 2)).toBe(50);
    });

    it("clamps value to min bound", () => {
      expect(applyValueConstraints(5, 10, 100, "int", 0)).toBe(10);
    });

    it("clamps value to max bound", () => {
      expect(applyValueConstraints(150, 10, 100, "int", 0)).toBe(100);
    });

    it("clamps value to both min and max bounds", () => {
      expect(applyValueConstraints(50, 10, 20, "int", 0)).toBe(20);
    });

    it("rounds integer input", () => {
      expect(applyValueConstraints(50.7, undefined, undefined, "int", 0)).toBe(51);
    });

    it("rounds float input to specified decimal places", () => {
      expect(applyValueConstraints(50.123, undefined, undefined, "float", 2)).toBe(50.12);
    });

    it("snaps to step when baseStep is provided", () => {
      expect(applyValueConstraints(51, 0, 100, "int", 0, 10)).toBe(50);
    });

    it("handles invalid bounds (min > max) by swapping", () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      const result = applyValueConstraints(50, 100, 50, "int", 0);
      expect(result).toBe(50);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("handles negative min values", () => {
      expect(applyValueConstraints(-50, -100, 100, "int", 0)).toBe(-50);
    });

    it("clamps negative value below min", () => {
      expect(applyValueConstraints(-150, -100, 100, "int", 0)).toBe(-100);
    });
  });
});
