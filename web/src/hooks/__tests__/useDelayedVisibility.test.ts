import { renderHook, act } from "@testing-library/react";
import { useDelayedVisibility } from "../useDelayedVisibility";

describe("useDelayedVisibility", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("initial state", () => {
    it("returns false initially when shouldBeVisible is false", () => {
      const { result } = renderHook(() =>
        useDelayedVisibility({
          shouldBeVisible: false,
          delay: 200
        })
      );

      expect(result.current).toBe(false);
    });

    it("returns false initially when shouldBeVisible is true (before delay)", () => {
      const { result } = renderHook(() =>
        useDelayedVisibility({
          shouldBeVisible: true,
          delay: 200
        })
      );

      expect(result.current).toBe(false);
    });
  });

  describe("delayed visibility", () => {
    it("returns true after delay when shouldBeVisible is true", () => {
      const { result } = renderHook(() =>
        useDelayedVisibility({
          shouldBeVisible: true,
          delay: 200
        })
      );

      expect(result.current).toBe(false);

      act(() => {
        jest.advanceTimersByTime(200);
      });

      expect(result.current).toBe(true);
    });

    it("does not show before delay expires", () => {
      const { result } = renderHook(() =>
        useDelayedVisibility({
          shouldBeVisible: true,
          delay: 200
        })
      );

      act(() => {
        jest.advanceTimersByTime(199);
      });

      expect(result.current).toBe(false);
    });

    it("respects different delay values", () => {
      const { result } = renderHook(() =>
        useDelayedVisibility({
          shouldBeVisible: true,
          delay: 500
        })
      );

      act(() => {
        jest.advanceTimersByTime(200);
      });
      expect(result.current).toBe(false);

      act(() => {
        jest.advanceTimersByTime(300);
      });
      expect(result.current).toBe(true);
    });

    it("works with zero delay", () => {
      const { result } = renderHook(() =>
        useDelayedVisibility({
          shouldBeVisible: true,
          delay: 0
        })
      );

      expect(result.current).toBe(false);

      act(() => {
        jest.advanceTimersByTime(0);
      });

      expect(result.current).toBe(true);
    });

    it("uses default delay of 0 when not specified", () => {
      const { result } = renderHook(() =>
        useDelayedVisibility({
          shouldBeVisible: true
        })
      );

      expect(result.current).toBe(false);

      act(() => {
        jest.advanceTimersByTime(0);
      });

      expect(result.current).toBe(true);
    });
  });

  describe("visibility changes", () => {
    it("immediately hides when shouldBeVisible becomes false", () => {
      const { result, rerender } = renderHook(
        ({ shouldBeVisible }) =>
          useDelayedVisibility({
            shouldBeVisible,
            delay: 200
          }),
        {
          initialProps: { shouldBeVisible: true }
        }
      );

      act(() => {
        jest.advanceTimersByTime(200);
      });
      expect(result.current).toBe(true);

      // Change to false
      rerender({ shouldBeVisible: false });
      expect(result.current).toBe(false);
    });

    it("cancels pending timer when shouldBeVisible becomes false", () => {
      const { result, rerender } = renderHook(
        ({ shouldBeVisible }) =>
          useDelayedVisibility({
            shouldBeVisible,
            delay: 200
          }),
        {
          initialProps: { shouldBeVisible: true }
        }
      );

      act(() => {
        jest.advanceTimersByTime(100);
      });

      // Change to false before timer fires
      rerender({ shouldBeVisible: false });
      expect(result.current).toBe(false);

      // Timer shouldn't fire anymore
      act(() => {
        jest.advanceTimersByTime(200);
      });
      expect(result.current).toBe(false);
    });

    it("restarts timer when shouldBeVisible changes back to true", () => {
      const { result, rerender } = renderHook(
        ({ shouldBeVisible }) =>
          useDelayedVisibility({
            shouldBeVisible,
            delay: 200
          }),
        {
          initialProps: { shouldBeVisible: true }
        }
      );

      act(() => {
        jest.advanceTimersByTime(100);
      });

      rerender({ shouldBeVisible: false });
      expect(result.current).toBe(false);

      rerender({ shouldBeVisible: true });
      expect(result.current).toBe(false);

      // Need to wait full delay again
      act(() => {
        jest.advanceTimersByTime(100);
      });
      expect(result.current).toBe(false);

      act(() => {
        jest.advanceTimersByTime(100);
      });
      expect(result.current).toBe(true);
    });
  });

  describe("rapid changes", () => {
    it("handles rapid on/off transitions", () => {
      const { result, rerender } = renderHook(
        ({ shouldBeVisible }) =>
          useDelayedVisibility({
            shouldBeVisible,
            delay: 200
          }),
        {
          initialProps: { shouldBeVisible: false }
        }
      );

      for (let i = 0; i < 5; i++) {
        rerender({ shouldBeVisible: true });
        act(() => {
          jest.advanceTimersByTime(50);
        });
        rerender({ shouldBeVisible: false });
      }

      expect(result.current).toBe(false);
    });

    it("eventually shows after staying true", () => {
      const { result, rerender } = renderHook(
        ({ shouldBeVisible }) =>
          useDelayedVisibility({
            shouldBeVisible,
            delay: 200
          }),
        {
          initialProps: { shouldBeVisible: false }
        }
      );

      // Rapidly toggle a few times
      for (let i = 0; i < 3; i++) {
        rerender({ shouldBeVisible: true });
        act(() => {
          jest.advanceTimersByTime(50);
        });
        rerender({ shouldBeVisible: false });
      }

      // Now stay true
      rerender({ shouldBeVisible: true });
      act(() => {
        jest.advanceTimersByTime(200);
      });

      expect(result.current).toBe(true);
    });
  });

  describe("delay changes", () => {
    it("uses updated delay for new visibility cycles", () => {
      const { result, rerender } = renderHook(
        ({ delay }) =>
          useDelayedVisibility({
            shouldBeVisible: true,
            delay
          }),
        {
          initialProps: { delay: 200 }
        }
      );

      // Change delay
      rerender({ delay: 500 });

      act(() => {
        jest.advanceTimersByTime(200);
      });
      expect(result.current).toBe(false);

      act(() => {
        jest.advanceTimersByTime(300);
      });
      expect(result.current).toBe(true);
    });

    it("restarts timer when delay changes mid-countdown", () => {
      const { result, rerender } = renderHook(
        ({ delay }) =>
          useDelayedVisibility({
            shouldBeVisible: true,
            delay
          }),
        {
          initialProps: { delay: 200 }
        }
      );

      act(() => {
        jest.advanceTimersByTime(100);
      });

      // Change delay while timer is running
      rerender({ delay: 300 });

      // Original timer would have fired at 200ms
      act(() => {
        jest.advanceTimersByTime(100);
      });
      expect(result.current).toBe(false);

      // New timer fires at 300ms from the change
      act(() => {
        jest.advanceTimersByTime(200);
      });
      expect(result.current).toBe(true);
    });
  });

  describe("cleanup", () => {
    it("cleans up timer on unmount", () => {
      const { unmount } = renderHook(() =>
        useDelayedVisibility({
          shouldBeVisible: true,
          delay: 200
        })
      );

      unmount();

      // Should not throw or cause issues
      act(() => {
        jest.runAllTimers();
      });
    });

    it("cleans up timer when shouldBeVisible changes", () => {
      const { rerender } = renderHook(
        ({ shouldBeVisible }) =>
          useDelayedVisibility({
            shouldBeVisible,
            delay: 200
          }),
        {
          initialProps: { shouldBeVisible: true }
        }
      );

      rerender({ shouldBeVisible: false });
      rerender({ shouldBeVisible: true });

      // Should not have multiple timers running
      act(() => {
        jest.runAllTimers();
      });
    });
  });

  describe("edge cases", () => {
    it("handles negative delay as 0", () => {
      const { result } = renderHook(() =>
        useDelayedVisibility({
          shouldBeVisible: true,
          delay: -100
        })
      );

      act(() => {
        jest.advanceTimersByTime(0);
      });

      expect(result.current).toBe(true);
    });

    it("handles very large delays", () => {
      const { result } = renderHook(() =>
        useDelayedVisibility({
          shouldBeVisible: true,
          delay: 1000000
        })
      );

      act(() => {
        jest.advanceTimersByTime(999999);
      });
      expect(result.current).toBe(false);

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(result.current).toBe(true);
    });

    it("stays false when never becoming visible", () => {
      const { result } = renderHook(() =>
        useDelayedVisibility({
          shouldBeVisible: false,
          delay: 200
        })
      );

      act(() => {
        jest.advanceTimersByTime(10000);
      });

      expect(result.current).toBe(false);
    });
  });
});
