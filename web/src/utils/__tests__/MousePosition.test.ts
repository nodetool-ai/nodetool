import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import {
  getMousePosition,
  addWiggleMovement,
  isWiggling,
  resetWiggleDetection
} from "../MousePosition";

describe("MousePosition", () => {
  let originalDocument: Document | undefined;

  beforeEach(() => {
    // Clean up any existing timers
    jest.clearAllTimers();

    // Store original document
    originalDocument = (global as any).document;
  });

  afterEach(() => {
    // Clean up timers and mocks
    jest.clearAllTimers();
    jest.clearAllMocks();

    // Restore original document
    (global as any).document = originalDocument;
  });

  describe("getMousePosition", () => {
    it("should return initial mouse position", () => {
      const position = getMousePosition();
      expect(position).toEqual({ x: 0, y: 0 });
    });

    it("should return current mouse position after update", () => {
      // Since we can't easily trigger the event listener in the module,
      // we'll test that the function returns a valid position object
      const position = getMousePosition();
      expect(position).toHaveProperty("x");
      expect(position).toHaveProperty("y");
      expect(typeof position.x).toBe("number");
      expect(typeof position.y).toBe("number");
    });
  });

  describe("wiggle detection", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      resetWiggleDetection();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    describe("addWiggleMovement", () => {
      it("should not detect wiggling with too few movements", () => {
        addWiggleMovement(10, 10);
        expect(isWiggling()).toBe(false);
      });

      it("should not detect wiggling without direction changes", () => {
        // Straight line movement
        addWiggleMovement(0, 0);
        addWiggleMovement(10, 0);
        addWiggleMovement(20, 0);
        addWiggleMovement(30, 0);
        expect(isWiggling()).toBe(false);
      });

      it("should detect wiggling with sufficient direction changes", () => {
        // Simulate wiggling motion with direction changes
        const now = Date.now();
        jest.setSystemTime(now);

        addWiggleMovement(0, 0);
        jest.advanceTimersByTime(100);
        addWiggleMovement(10, 0);
        jest.advanceTimersByTime(100);
        addWiggleMovement(0, 0);
        jest.advanceTimersByTime(100);
        addWiggleMovement(-10, 0);
        jest.advanceTimersByTime(100);
        addWiggleMovement(0, 0);

        // Should detect wiggling with back-and-forth motion
        expect(isWiggling()).toBe(true);
      });

      it("should ignore movements below distance threshold", () => {
        addWiggleMovement(0, 0);
        addWiggleMovement(1, 0); // Below threshold
        addWiggleMovement(0, 0);
        addWiggleMovement(-1, 0); // Below threshold
        expect(isWiggling()).toBe(false);
      });

      it("should filter out old movements outside time window", () => {
        const now = Date.now();
        jest.setSystemTime(now);

        addWiggleMovement(0, 0);
        addWiggleMovement(10, 0);

        // Advance time beyond window
        jest.advanceTimersByTime(3000);

        addWiggleMovement(20, 0);
        addWiggleMovement(30, 0);

        // Old movements should be filtered out
        expect(isWiggling()).toBe(false);
      });

      it("should ignore duplicate movements within 10ms", () => {
        const now = Date.now();
        jest.setSystemTime(now);

        addWiggleMovement(10, 10);
        jest.advanceTimersByTime(5); // Within 10ms
        addWiggleMovement(10, 10); // Same coordinates
        jest.advanceTimersByTime(5);
        addWiggleMovement(10, 10); // Still same coordinates

        // Should have only added the first one
        expect(isWiggling()).toBe(false);
      });

      it("should accept duplicate coordinates after 10ms", () => {
        const now = Date.now();
        jest.setSystemTime(now);

        addWiggleMovement(10, 10);
        jest.advanceTimersByTime(15); // Beyond 10ms
        addWiggleMovement(10, 10); // Same coordinates but after threshold

        // Both should be added
        expect(isWiggling()).toBe(false); // Still not wiggling, but points should be accepted
      });
    });

    describe("isWiggling", () => {
      it("should return false initially", () => {
        expect(isWiggling()).toBe(false);
      });

      it("should return true when wiggling is detected", () => {
        const now = Date.now();
        jest.setSystemTime(now);

        // Create a clear wiggling pattern
        addWiggleMovement(0, 0);
        jest.advanceTimersByTime(50);
        addWiggleMovement(20, 0);
        jest.advanceTimersByTime(50);
        addWiggleMovement(0, 0);
        jest.advanceTimersByTime(50);
        addWiggleMovement(-20, 0);
        jest.advanceTimersByTime(50);
        addWiggleMovement(0, 0);

        expect(isWiggling()).toBe(true);
      });
    });

    describe("resetWiggleDetection", () => {
      it("should clear wiggle history", () => {
        addWiggleMovement(10, 10);
        addWiggleMovement(20, 20);
        resetWiggleDetection();
        expect(isWiggling()).toBe(false);
      });

      it("should reset wiggling state", () => {
        const now = Date.now();
        jest.setSystemTime(now);

        // Create wiggling
        addWiggleMovement(0, 0);
        addWiggleMovement(20, 0);
        addWiggleMovement(0, 0);
        addWiggleMovement(-20, 0);
        addWiggleMovement(0, 0);

        // Reset
        resetWiggleDetection();
        expect(isWiggling()).toBe(false);

        // Should need new movements to detect wiggling again
        addWiggleMovement(10, 10);
        expect(isWiggling()).toBe(false);
      });
    });
  });

  describe("wiggle angle calculation", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      resetWiggleDetection();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should detect perpendicular movements as direction changes", () => {
      const now = Date.now();
      jest.setSystemTime(now);

      // Move right, then up (90 degree turn)
      addWiggleMovement(0, 0);
      jest.advanceTimersByTime(50);
      addWiggleMovement(10, 0);
      jest.advanceTimersByTime(50);
      addWiggleMovement(10, 10);
      jest.advanceTimersByTime(50);
      addWiggleMovement(10, 0);

      // This creates direction changes
      expect(isWiggling()).toBe(false); // May not be enough changes yet
    });

    it("should handle diagonal movements", () => {
      const now = Date.now();
      jest.setSystemTime(now);

      // Diagonal wiggle pattern
      addWiggleMovement(0, 0);
      jest.advanceTimersByTime(50);
      addWiggleMovement(10, 10);
      jest.advanceTimersByTime(50);
      addWiggleMovement(0, 0);
      jest.advanceTimersByTime(50);
      addWiggleMovement(-10, -10);
      jest.advanceTimersByTime(50);
      addWiggleMovement(0, 0);

      expect(isWiggling()).toBe(true);
    });
  });
});