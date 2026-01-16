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

    it("returns 0.01 for float with range <= 1", () => {
      expect(calculateStep(0, 0.5, "float")).toBe(0.01);
    });

    it("returns 0.1 for float with range <= 50", () => {
      expect(calculateStep(0, 50, "float")).toBe(0.1);
    });

    it("returns 0.5 for float with range <= 100", () => {
      expect(calculateStep(0, 100, "float")).toBe(0.5);
    });

    it("returns calculated step for float with range > 100", () => {
      const step = calculateStep(0, 1000, "float");
      expect(step).toBeGreaterThan(0);
    });

    it("returns 0.1 for int with range <= 20", () => {
      expect(calculateStep(0, 20, "int")).toBe(0.1);
    });

    it("returns 1 for int with range <= 1000", () => {
      expect(calculateStep(0, 1000, "int")).toBe(1);
    });

    it("returns 16 for int with range 1001-5000", () => {
      expect(calculateStep(0, 5000, "int")).toBe(16);
    });

    it("returns 32 for int with range 5001-10000", () => {
      expect(calculateStep(0, 10000, "int")).toBe(32);
    });

    it("returns 64 for int with range > 10000", () => {
      expect(calculateStep(0, 20000, "int")).toBe(64);
    });

    it("handles negative min value", () => {
      expect(calculateStep(-100, 100, "float")).toBe(1);
    });

    it("handles reversed bounds (min > max)", () => {
      const step = calculateStep(100, 0, "float");
      expect(step).toBe(0.01);
    });
  });

  describe("calculateDecimalPlaces", () => {
    it("returns 0 for baseStep >= 1", () => {
      expect(calculateDecimalPlaces(1)).toBe(0);
      expect(calculateDecimalPlaces(2)).toBe(0);
      expect(calculateDecimalPlaces(10)).toBe(0);
    });

    it("returns 1 for baseStep = 0.1", () => {
      expect(calculateDecimalPlaces(0.1)).toBe(1);
    });

    it("returns 2 for baseStep = 0.01", () => {
      expect(calculateDecimalPlaces(0.01)).toBe(2);
    });

    it("returns 3 for baseStep = 0.001", () => {
      expect(calculateDecimalPlaces(0.001)).toBe(3);
    });

    it("returns correct decimal places for various steps", () => {
      expect(calculateDecimalPlaces(0.5)).toBe(1);
      expect(calculateDecimalPlaces(0.05)).toBe(2);
      expect(calculateDecimalPlaces(0.005)).toBe(3);
    });

    it("handles very small baseStep", () => {
      const decimalPlaces = calculateDecimalPlaces(0.0001);
      expect(decimalPlaces).toBe(4);
    });
  });

  describe("calculateSpeedFactor", () => {
    it("returns 1 when mouse is at slider (distance = 0)", () => {
      const result = calculateSpeedFactor(0, false);
      expect(result).toBe(1);
    });

    it("returns MIN_SPEED_FACTOR when mouse is past full ramp distance", () => {
      const result = calculateSpeedFactor(1000, false);
      expect(result).toBeLessThan(1);
    });

    it("returns lower speed factor when shift key is pressed", () => {
      const normal = calculateSpeedFactor(50, false);
      const withShift = calculateSpeedFactor(50, true);
      expect(withShift).toBeLessThan(normal);
    });

    it("returns MIN_SPEED_FACTOR as minimum even with shift", () => {
      const result = calculateSpeedFactor(1000, true);
      expect(result).toBeGreaterThan(0);
    });

    it("decreases exponentially as distance increases", () => {
      const speed1 = calculateSpeedFactor(10, false);
      const speed2 = calculateSpeedFactor(50, false);
      const speed3 = calculateSpeedFactor(100, false);
      expect(speed1).toBeGreaterThan(speed2);
      expect(speed2).toBeGreaterThan(speed3);
    });
  });

  describe("getEffectiveSliderWidth", () => {
    it("returns actualSliderWidth when zoomEnabled is false", () => {
      expect(getEffectiveSliderWidth(false, 1.5, 100)).toBe(100);
    });

    it("returns actualSliderWidth when zoom is 0", () => {
      expect(getEffectiveSliderWidth(true, 0, 100)).toBe(100);
    });

    it("returns multiplied width when zoomEnabled is true", () => {
      expect(getEffectiveSliderWidth(true, 2, 100)).toBe(200);
    });

    it("returns multiplied width with fractional zoom", () => {
      expect(getEffectiveSliderWidth(true, 1.5, 100)).toBe(150);
    });
  });

  describe("applyValueConstraints", () => {
    it("returns value unchanged when no constraints", () => {
      expect(applyValueConstraints(5, undefined, undefined, "float", 2)).toBe(5);
    });

    it("clamps value to min when below min", () => {
      expect(applyValueConstraints(5, 10, 20, "float", 2)).toBe(10);
    });

    it("clamps value to max when above max", () => {
      expect(applyValueConstraints(25, 10, 20, "float", 2)).toBe(20);
    });

    it("keeps value within bounds", () => {
      expect(applyValueConstraints(15, 10, 20, "float", 2)).toBe(15);
    });

    it("rounds int values", () => {
      expect(applyValueConstraints(15.7, undefined, undefined, "int", 0)).toBe(16);
    });

    it("rounds float values to specified decimal places", () => {
      expect(applyValueConstraints(15.678, undefined, undefined, "float", 2)).toBe(15.68);
    });

    it("snaps to step when baseStep is provided", () => {
      const result = applyValueConstraints(13, 0, 100, "int", 0, 5);
      expect([10, 15]).toContain(result);
    });

    it("warns when min > max", () => {
      const consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => {});
      const result = applyValueConstraints(50, 100, 50, "float", 2);
      expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining("Invalid bounds"));
      expect(typeof result).toBe("number");
      consoleWarn.mockRestore();
    });

    it("handles negative bounds", () => {
      expect(applyValueConstraints(-5, -10, 10, "float", 2)).toBe(-5);
      expect(applyValueConstraints(-15, -10, 10, "float", 2)).toBe(-10);
    });

    it("handles all negative bounds", () => {
      expect(applyValueConstraints(-5, -20, -10, "float", 2)).toBe(-10);
    });

    it("clamps to max when value exceeds max", () => {
      expect(applyValueConstraints(1000, 0, 100, "int", 0)).toBe(100);
    });
  });
});
