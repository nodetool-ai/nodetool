import {
  calculateStep,
  calculateDecimalPlaces,
  calculateSpeedFactor,
  getEffectiveSliderWidth,
  applyValueConstraints
} from './NumberInput.utils';
import {
  DRAG_SLOWDOWN_RAMP_PX,
  MIN_SPEED_FACTOR,
  SHIFT_MIN_SPEED_FACTOR,
  SHIFT_SLOWDOWN_DIVIDER
} from './NumberInput';

describe('NumberInput Utilities', () => {
  describe('calculateStep', () => {
    describe('float input type', () => {
      it('returns 0.01 for range <= 1', () => {
        expect(calculateStep(0, 1, 'float')).toBe(0.01);
        expect(calculateStep(5, 5.5, 'float')).toBe(0.01);
      });

      it('returns 0.1 for range <= 50', () => {
        expect(calculateStep(0, 50, 'float')).toBe(0.1);
        expect(calculateStep(25, 50, 'float')).toBe(0.1);
      });

    it('returns 0.5 for range <= 100', () => {
      expect(calculateStep(0, 100, 'float')).toBe(0.5);
      expect(calculateStep(50, 100, 'float')).toBe(0.1); // Range is 50
    });

      it('returns calculated step for range > 100', () => {
        const step = calculateStep(0, 1000, 'float');
        expect(step).toBeGreaterThan(0);
        expect(step).toBeLessThanOrEqual(10);
      });

      it('returns 0.1 for unbounded float input', () => {
        expect(calculateStep(undefined, undefined, 'float')).toBe(0.1);
        expect(calculateStep(0, undefined, 'float')).toBe(0.1);
        expect(calculateStep(undefined, 100, 'float')).toBe(0.1);
      });
    });

    describe('int input type', () => {
      it('returns 0.1 for range <= 20', () => {
        expect(calculateStep(0, 20, 'int')).toBe(0.1);
      });

      it('returns 1 for range <= 1000', () => {
        expect(calculateStep(0, 1000, 'int')).toBe(1);
        expect(calculateStep(100, 1000, 'int')).toBe(1);
      });

      it('returns 16 for range > 1000 and <= 5000', () => {
        expect(calculateStep(0, 5000, 'int')).toBe(16);
        expect(calculateStep(1000, 4000, 'int')).toBe(16);
      });

      it('returns 32 for range > 5000 and <= 10000', () => {
        expect(calculateStep(0, 10000, 'int')).toBe(32);
        expect(calculateStep(5000, 9000, 'int')).toBe(16); // Range is 4000
      });

      it('returns 64 for range > 10000', () => {
        expect(calculateStep(0, 20000, 'int')).toBe(64);
      });

      it('returns 1 for unbounded int input', () => {
        expect(calculateStep(undefined, undefined, 'int')).toBe(1);
        expect(calculateStep(0, undefined, 'int')).toBe(1);
      });
    });
  });

  describe('calculateDecimalPlaces', () => {
    it('returns 0 for step of 1', () => {
      expect(calculateDecimalPlaces(1)).toBe(0);
    });

    it('returns 1 for step of 0.1', () => {
      expect(calculateDecimalPlaces(0.1)).toBe(1);
    });

    it('returns 2 for step of 0.01', () => {
      expect(calculateDecimalPlaces(0.01)).toBe(2);
    });

    it('returns 3 for step of 0.001', () => {
      expect(calculateDecimalPlaces(0.001)).toBe(3);
    });

    it('returns 0 for step >= 1', () => {
      expect(calculateDecimalPlaces(2)).toBe(0);
      expect(calculateDecimalPlaces(10)).toBe(0);
    });
  });

  describe('calculateSpeedFactor', () => {
    it('returns 1 when mouse is at slider (distance = 0)', () => {
      expect(calculateSpeedFactor(0, false)).toBe(1);
    });

    it('returns MIN_SPEED_FACTOR when mouse is far away', () => {
      const farDistance = DRAG_SLOWDOWN_RAMP_PX * 2;
      const speedFactor = calculateSpeedFactor(farDistance, false);
      expect(speedFactor).toBe(MIN_SPEED_FACTOR);
    });

    it('interpolates exponentially between 1 and MIN_SPEED_FACTOR', () => {
      const halfDistance = DRAG_SLOWDOWN_RAMP_PX / 2;
      const speedFactor = calculateSpeedFactor(halfDistance, false);

      expect(speedFactor).toBeGreaterThan(MIN_SPEED_FACTOR);
      expect(speedFactor).toBeLessThan(1);
    });

    it('slows down significantly when shift key is pressed', () => {
      const normalSpeed = calculateSpeedFactor(DRAG_SLOWDOWN_RAMP_PX / 2, false);
      const shiftSpeed = calculateSpeedFactor(DRAG_SLOWDOWN_RAMP_PX / 2, true);

      expect(shiftSpeed).toBeLessThan(normalSpeed);
    });

    it('applies minimum speed factor when shift key is pressed', () => {
      const farDistance = DRAG_SLOWDOWN_RAMP_PX * 2;
      const shiftSpeed = calculateSpeedFactor(farDistance, true);

      expect(shiftSpeed).toBe(SHIFT_MIN_SPEED_FACTOR);
    });

    it('divides by SHIFT_SLOWDOWN_DIVIDER for shift key', () => {
      const distance = DRAG_SLOWDOWN_RAMP_PX / 4;
      const normalSpeed = calculateSpeedFactor(distance, false);
      const shiftSpeed = calculateSpeedFactor(distance, true);

      expect(shiftSpeed).toBeCloseTo(normalSpeed / SHIFT_SLOWDOWN_DIVIDER, 2);
    });
  });

  describe('getEffectiveSliderWidth', () => {
    it('returns actual width when zoom is disabled', () => {
      expect(getEffectiveSliderWidth(false, 1.0, 100)).toBe(100);
    });

    it('returns actual width when zoom is 0', () => {
      expect(getEffectiveSliderWidth(true, 0, 100)).toBe(100);
    });

    it('returns scaled width when zoom is enabled and zoom > 0', () => {
      expect(getEffectiveSliderWidth(true, 2.0, 100)).toBe(200);
      expect(getEffectiveSliderWidth(true, 0.5, 100)).toBe(50);
    });

    it('handles decimal zoom values', () => {
      expect(getEffectiveSliderWidth(true, 1.5, 100)).toBe(150);
      expect(getEffectiveSliderWidth(true, 0.25, 100)).toBe(25);
    });
  });

  describe('applyValueConstraints', () => {
    it('clamps value to min when below min', () => {
      expect(applyValueConstraints(5, 10, 20, 'int', 0)).toBe(10);
      expect(applyValueConstraints(5, 10, 20, 'float', 2)).toBe(10);
    });

    it('clamps value to max when above max', () => {
      expect(applyValueConstraints(25, 10, 20, 'int', 0)).toBe(20);
      expect(applyValueConstraints(25, 10, 20, 'float', 2)).toBe(20);
    });

    it('keeps value within bounds', () => {
      expect(applyValueConstraints(15, 10, 20, 'int', 0)).toBe(15);
      expect(applyValueConstraints(15, 10, 20, 'float', 2)).toBe(15);
    });

    it('rounds int values', () => {
      expect(applyValueConstraints(15.7, 0, 100, 'int', 0)).toBe(16);
      expect(applyValueConstraints(15.3, 0, 100, 'int', 0)).toBe(15);
    });

    it('rounds float values to specified decimal places', () => {
      expect(applyValueConstraints(15.456, 0, 100, 'float', 2)).toBe(15.46);
      expect(applyValueConstraints(15.456, 0, 100, 'float', 1)).toBe(15.5);
    });

    it('snaps to step when baseStep is provided', () => {
      const value = applyValueConstraints(17, 0, 100, 'float', 2, 5);
      expect(value).toBe(15);
    });

    it('handles unbounded values (no min/max)', () => {
      expect(applyValueConstraints(100, undefined, undefined, 'int', 0)).toBe(100);
      expect(applyValueConstraints(100.456, undefined, undefined, 'float', 2)).toBe(100.46);
    });

    it('handles only min bound', () => {
      expect(applyValueConstraints(5, 10, undefined, 'int', 0)).toBe(10);
      expect(applyValueConstraints(15, 10, undefined, 'int', 0)).toBe(15);
    });

    it('handles only max bound', () => {
      expect(applyValueConstraints(25, undefined, 20, 'int', 0)).toBe(20);
      expect(applyValueConstraints(15, undefined, 20, 'int', 0)).toBe(15);
    });

    it('warns and swaps when min > max', () => {
      const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const result = applyValueConstraints(15, 20, 10, 'int', 0);
      expect(consoleWarn).toHaveBeenCalledWith('Invalid bounds: min (20) > max (10)');
      expect(result).toBe(15); // Value is within the swapped bounds
      consoleWarn.mockRestore();
    });
  });

  describe('calculateStep edge cases', () => {
    it('handles min greater than max', () => {
      const step = calculateStep(100, 0, 'float');
      expect(step).toBeGreaterThan(0);
    });

    it('handles negative ranges', () => {
      const step = calculateStep(-100, -50, 'float');
      expect(step).toBeGreaterThan(0);
    });

    it('handles zero range', () => {
      const step = calculateStep(50, 50, 'float');
      expect(step).toBe(0.01);
    });

    it('handles very large ranges', () => {
      const step = calculateStep(0, 1000000, 'int');
      expect(step).toBeGreaterThan(0);
    });
  });

  describe('calculateDecimalPlaces edge cases', () => {
    it('handles very small steps', () => {
      expect(calculateDecimalPlaces(0.0001)).toBe(4);
    });

    it('handles very large steps', () => {
      expect(calculateDecimalPlaces(100)).toBe(0);
    });
  });

  describe('calculateSpeedFactor edge cases', () => {
    it('clamps distance at full ramp', () => {
      const farDistance = DRAG_SLOWDOWN_RAMP_PX * 5;
      const speedFactor = calculateSpeedFactor(farDistance, false);
      expect(speedFactor).toBe(MIN_SPEED_FACTOR);
    });

    it('returns valid speed factor for any distance', () => {
      expect(calculateSpeedFactor(0, false)).toBe(1);
      expect(calculateSpeedFactor(DRAG_SLOWDOWN_RAMP_PX, false)).toBe(MIN_SPEED_FACTOR);
    });
  });
});
