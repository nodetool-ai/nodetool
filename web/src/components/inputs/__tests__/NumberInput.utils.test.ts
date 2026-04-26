import {
  calculateStep,
  calculateDecimalPlaces,
  calculateSpeedFactor,
  getEffectiveSliderWidth,
  formatFloat,
  applyValueConstraints
} from "../NumberInput.utils";
import {
  DRAG_SLOWDOWN_RAMP_PX,
  MIN_SPEED_FACTOR,
  SHIFT_MIN_SPEED_FACTOR
} from "../NumberInput";

describe("NumberInput.utils", () => {
  describe("calculateStep", () => {
    describe("float input type", () => {
      it("returns 0.01 for range <= 2", () => {
        expect(calculateStep(0, 1, "float")).toBe(0.01);
        expect(calculateStep(0, 2, "float")).toBe(0.01);
      });

      it("returns 0.1 for range <= 50", () => {
        expect(calculateStep(0, 10, "float")).toBe(0.1);
        expect(calculateStep(0, 50, "float")).toBe(0.1);
      });

      it("returns 0.5 for range <= 100", () => {
        expect(calculateStep(0, 100, "float")).toBe(0.5);
        expect(calculateStep(0, 51, "float")).toBe(0.5);
      });

      it("scales with log10 for large ranges", () => {
        const step = calculateStep(0, 1000, "float");
        expect(step).toBeGreaterThan(0.5);
      });

      it("returns 0.1 when min/max undefined", () => {
        expect(calculateStep(undefined, undefined, "float")).toBe(0.1);
        expect(calculateStep(0, undefined, "float")).toBe(0.1);
        expect(calculateStep(undefined, 100, "float")).toBe(0.1);
      });
    });

    describe("int input type", () => {
      it("returns 0.1 for range <= 20", () => {
        expect(calculateStep(0, 10, "int")).toBe(0.1);
        expect(calculateStep(0, 20, "int")).toBe(0.1);
      });

      it("returns 1 for range <= 1000", () => {
        expect(calculateStep(0, 100, "int")).toBe(1);
        expect(calculateStep(0, 1000, "int")).toBe(1);
      });

      it("returns 16 for range 1001..5000", () => {
        expect(calculateStep(0, 2000, "int")).toBe(16);
        expect(calculateStep(0, 5000, "int")).toBe(16);
      });

      it("returns 32 for range 5001..10000", () => {
        expect(calculateStep(0, 6000, "int")).toBe(32);
        expect(calculateStep(0, 10000, "int")).toBe(32);
      });

      it("returns 64 for range > 10000", () => {
        expect(calculateStep(0, 20000, "int")).toBe(64);
      });

      it("returns 1 when min/max undefined", () => {
        expect(calculateStep(undefined, undefined, "int")).toBe(1);
      });
    });

    it("handles negative ranges", () => {
      expect(calculateStep(-10, 10, "float")).toBe(0.1);
      expect(calculateStep(-500, 500, "int")).toBe(1);
    });
  });

  describe("calculateDecimalPlaces", () => {
    it("returns 0 for step >= 1", () => {
      expect(calculateDecimalPlaces(1)).toBe(0);
      expect(calculateDecimalPlaces(10)).toBe(0);
    });

    it("returns 1 for step 0.1", () => {
      expect(calculateDecimalPlaces(0.1)).toBe(1);
    });

    it("returns 2 for step 0.01", () => {
      expect(calculateDecimalPlaces(0.01)).toBe(2);
    });

    it("returns 3 for step 0.001", () => {
      expect(calculateDecimalPlaces(0.001)).toBe(3);
    });
  });

  describe("calculateSpeedFactor", () => {
    it("returns 1 when distance is 0 (mouse on slider)", () => {
      expect(calculateSpeedFactor(0, false)).toBeCloseTo(1, 5);
    });

    it("returns MIN_SPEED_FACTOR at full ramp distance", () => {
      expect(calculateSpeedFactor(DRAG_SLOWDOWN_RAMP_PX, false)).toBeCloseTo(
        MIN_SPEED_FACTOR,
        5
      );
    });

    it("clamps at MIN_SPEED_FACTOR beyond ramp distance", () => {
      expect(
        calculateSpeedFactor(DRAG_SLOWDOWN_RAMP_PX * 2, false)
      ).toBeCloseTo(MIN_SPEED_FACTOR, 5);
    });

    it("returns intermediate value at half ramp distance", () => {
      const factor = calculateSpeedFactor(DRAG_SLOWDOWN_RAMP_PX / 2, false);
      expect(factor).toBeGreaterThan(MIN_SPEED_FACTOR);
      expect(factor).toBeLessThan(1);
    });

    it("slows down further with shift key", () => {
      const dist = DRAG_SLOWDOWN_RAMP_PX / 2;
      const normal = calculateSpeedFactor(dist, false);
      const shifted = calculateSpeedFactor(dist, true);
      expect(shifted).toBeLessThan(normal);
    });

    it("clamps to SHIFT_MIN_SPEED_FACTOR with shift key at max distance", () => {
      const shifted = calculateSpeedFactor(DRAG_SLOWDOWN_RAMP_PX, true);
      expect(shifted).toBeCloseTo(SHIFT_MIN_SPEED_FACTOR, 5);
    });
  });

  describe("getEffectiveSliderWidth", () => {
    it("multiplies width by zoom when zoom enabled", () => {
      expect(getEffectiveSliderWidth(true, 2, 100)).toBe(200);
      expect(getEffectiveSliderWidth(true, 0.5, 100)).toBe(50);
    });

    it("returns raw width when zoom disabled", () => {
      expect(getEffectiveSliderWidth(false, 2, 100)).toBe(100);
    });

    it("returns raw width when zoom is 0", () => {
      expect(getEffectiveSliderWidth(true, 0, 100)).toBe(100);
    });
  });

  describe("formatFloat", () => {
    it("adds minimum decimal places to integers", () => {
      expect(formatFloat(5)).toBe("5.0");
      expect(formatFloat(5, 2)).toBe("5.00");
    });

    it("preserves existing decimals beyond minimum", () => {
      expect(formatFloat(3.14159, 1)).toBe("3.14159");
    });

    it("uses minimum when existing decimals are fewer", () => {
      expect(formatFloat(3.1, 3)).toBe("3.100");
    });

    it("handles zero", () => {
      expect(formatFloat(0)).toBe("0.0");
    });

    it("handles negative values", () => {
      expect(formatFloat(-1.5, 2)).toBe("-1.50");
    });
  });

  describe("applyValueConstraints", () => {
    it("clamps to min", () => {
      expect(applyValueConstraints(-5, 0, 100, "float", 2)).toBe(0);
    });

    it("clamps to max", () => {
      expect(applyValueConstraints(150, 0, 100, "float", 2)).toBe(100);
    });

    it("rounds int type to nearest integer", () => {
      expect(applyValueConstraints(5.7, 0, 100, "int", 0)).toBe(6);
    });

    it("rounds float to specified decimal places", () => {
      expect(applyValueConstraints(5.678, 0, 100, "float", 2)).toBe(5.68);
    });

    it("snaps to baseStep when provided", () => {
      expect(applyValueConstraints(7, 0, 100, "int", 0, 5)).toBe(5);
      expect(applyValueConstraints(8, 0, 100, "int", 0, 5)).toBe(10);
    });

    it("snaps to baseStep aligned to min", () => {
      expect(applyValueConstraints(7, 2, 100, "int", 0, 5)).toBe(7);
      expect(applyValueConstraints(9, 2, 100, "int", 0, 5)).toBe(7);
    });

    it("swaps min > max and warns once", () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation();
      const result = applyValueConstraints(50, 100, 0, "float", 2);
      expect(result).toBe(50);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      warnSpy.mockRestore();
    });

    it("handles undefined bounds", () => {
      expect(applyValueConstraints(50, undefined, undefined, "float", 2)).toBe(
        50
      );
    });
  });
});
