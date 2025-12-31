import { renderHook, act } from "@testing-library/react";
import { useDelayedHover } from "../useDelayedHover";

describe("useDelayedHover", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("handleMouseEnter", () => {
    it("calls callback after specified delay", () => {
      const callback = jest.fn();
      const delay = 500;

      const { result } = renderHook(() => useDelayedHover(callback, delay));

      act(() => {
        result.current.handleMouseEnter();
      });

      expect(callback).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("does not call callback before delay", () => {
      const callback = jest.fn();
      const delay = 500;

      const { result } = renderHook(() => useDelayedHover(callback, delay));

      act(() => {
        result.current.handleMouseEnter();
      });

      act(() => {
        jest.advanceTimersByTime(499);
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it("respects different delay values", () => {
      const callback = jest.fn();
      const delay = 1000;

      const { result } = renderHook(() => useDelayedHover(callback, delay));

      act(() => {
        result.current.handleMouseEnter();
      });

      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(callback).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("works with zero delay", () => {
      const callback = jest.fn();
      const delay = 0;

      const { result } = renderHook(() => useDelayedHover(callback, delay));

      act(() => {
        result.current.handleMouseEnter();
      });

      act(() => {
        jest.advanceTimersByTime(0);
      });

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe("handleMouseLeave", () => {
    it("cancels the timer before callback is called", () => {
      const callback = jest.fn();
      const delay = 500;

      const { result } = renderHook(() => useDelayedHover(callback, delay));

      act(() => {
        result.current.handleMouseEnter();
      });

      act(() => {
        jest.advanceTimersByTime(200);
        result.current.handleMouseLeave();
      });

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it("can be called multiple times safely", () => {
      const callback = jest.fn();
      const delay = 500;

      const { result } = renderHook(() => useDelayedHover(callback, delay));

      act(() => {
        result.current.handleMouseLeave();
        result.current.handleMouseLeave();
        result.current.handleMouseLeave();
      });

      // Should not throw
      expect(callback).not.toHaveBeenCalled();
    });

    it("cancels timer even without previous mouseEnter", () => {
      const callback = jest.fn();
      const delay = 500;

      const { result } = renderHook(() => useDelayedHover(callback, delay));

      // Should not throw
      act(() => {
        result.current.handleMouseLeave();
      });

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("multiple interactions", () => {
    it("can trigger callback multiple times with separate enter/leave cycles", () => {
      const callback = jest.fn();
      const delay = 500;

      const { result } = renderHook(() => useDelayedHover(callback, delay));

      // First hover cycle
      act(() => {
        result.current.handleMouseEnter();
      });
      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(callback).toHaveBeenCalledTimes(1);

      act(() => {
        result.current.handleMouseLeave();
      });

      // Second hover cycle
      act(() => {
        result.current.handleMouseEnter();
      });
      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it("rapid enter/leave does not trigger callback", () => {
      const callback = jest.fn();
      const delay = 500;

      const { result } = renderHook(() => useDelayedHover(callback, delay));

      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.handleMouseEnter();
        });
        act(() => {
          jest.advanceTimersByTime(100);
        });
        act(() => {
          result.current.handleMouseLeave();
        });
      }

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it("multiple mouseEnter calls create multiple timers", () => {
      const callback = jest.fn();
      const delay = 500;

      const { result } = renderHook(() => useDelayedHover(callback, delay));

      act(() => {
        result.current.handleMouseEnter();
      });

      act(() => {
        jest.advanceTimersByTime(400);
      });

      act(() => {
        result.current.handleMouseEnter();
      });

      // First timer fires after 100ms more (500ms total)
      act(() => {
        jest.advanceTimersByTime(100);
      });
      expect(callback).toHaveBeenCalledTimes(1);

      // Second timer fires after 400ms more (500ms from second mouseEnter)
      act(() => {
        jest.advanceTimersByTime(400);
      });
      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  describe("callback reference update", () => {
    it("uses the latest callback when fired", () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const delay = 500;

      const { result, rerender } = renderHook(
        ({ callback, delay }) => useDelayedHover(callback, delay),
        { initialProps: { callback: callback1, delay } }
      );

      act(() => {
        result.current.handleMouseEnter();
      });

      // Update callback before timer fires
      rerender({ callback: callback2, delay });

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledTimes(1);
    });
  });

  describe("delay change", () => {
    it("uses updated delay for new hover cycles", () => {
      const callback = jest.fn();

      const { result, rerender } = renderHook(
        ({ callback, delay }) => useDelayedHover(callback, delay),
        { initialProps: { callback, delay: 500 } }
      );

      // Change delay
      rerender({ callback, delay: 1000 });

      act(() => {
        result.current.handleMouseEnter();
      });

      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(callback).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe("return value stability", () => {
    it("returns stable function references", () => {
      const callback = jest.fn();
      const delay = 500;

      const { result, rerender } = renderHook(() => useDelayedHover(callback, delay));

      const { handleMouseEnter: enter1, handleMouseLeave: leave1 } = result.current;

      rerender();

      const { handleMouseEnter: enter2, handleMouseLeave: leave2 } = result.current;

      expect(enter1).toBe(enter2);
      expect(leave1).toBe(leave2);
    });

    it("updates handlers when delay changes", () => {
      const callback = jest.fn();

      const { result, rerender } = renderHook(
        ({ delay }) => useDelayedHover(callback, delay),
        { initialProps: { delay: 500 } }
      );

      const { handleMouseEnter: enter1 } = result.current;

      rerender({ delay: 1000 });

      const { handleMouseEnter: enter2 } = result.current;

      // handleMouseEnter should be updated when delay changes due to useCallback dependency
      expect(enter1).not.toBe(enter2);
    });
  });
});
