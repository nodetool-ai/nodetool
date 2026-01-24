import { renderHook, act } from "@testing-library/react";
import { useCopyFeedback } from "../useCopyFeedback";

describe("useCopyFeedback", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("initialization", () => {
    it("starts with no copied format", () => {
      const { result } = renderHook(() => useCopyFeedback());

      expect(result.current.copiedFormat).toBeNull();
    });

    it("provides showFeedback function", () => {
      const { result } = renderHook(() => useCopyFeedback());

      expect(typeof result.current.showFeedback).toBe("function");
    });

    it("provides clearFeedback function", () => {
      const { result } = renderHook(() => useCopyFeedback());

      expect(typeof result.current.clearFeedback).toBe("function");
    });
  });

  describe("showFeedback", () => {
    it("sets copied format", () => {
      const { result } = renderHook(() => useCopyFeedback());

      act(() => {
        result.current.showFeedback("hex");
      });

      expect(result.current.copiedFormat).toBe("hex");
    });

    it("supports different format identifiers", () => {
      const { result } = renderHook(() => useCopyFeedback());

      act(() => {
        result.current.showFeedback("rgb");
      });
      expect(result.current.copiedFormat).toBe("rgb");

      act(() => {
        result.current.showFeedback("css");
      });
      expect(result.current.copiedFormat).toBe("css");

      act(() => {
        result.current.showFeedback("gradient");
      });
      expect(result.current.copiedFormat).toBe("gradient");
    });

    it("clears feedback after default duration", () => {
      const { result } = renderHook(() => useCopyFeedback());

      act(() => {
        result.current.showFeedback("hex");
      });
      expect(result.current.copiedFormat).toBe("hex");

      act(() => {
        jest.advanceTimersByTime(1500);
      });

      expect(result.current.copiedFormat).toBeNull();
    });

    it("clears feedback after custom duration", () => {
      const { result } = renderHook(() =>
        useCopyFeedback({ feedbackDuration: 3000 })
      );

      act(() => {
        result.current.showFeedback("hex");
      });

      act(() => {
        jest.advanceTimersByTime(2999);
      });
      expect(result.current.copiedFormat).toBe("hex");

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(result.current.copiedFormat).toBeNull();
    });

    it("does not clear feedback before duration", () => {
      const { result } = renderHook(() =>
        useCopyFeedback({ feedbackDuration: 2000 })
      );

      act(() => {
        result.current.showFeedback("hex");
      });

      act(() => {
        jest.advanceTimersByTime(1999);
      });

      expect(result.current.copiedFormat).toBe("hex");
    });

    it("resets timer on subsequent calls", () => {
      const { result } = renderHook(() =>
        useCopyFeedback({ feedbackDuration: 1000 })
      );

      act(() => {
        result.current.showFeedback("hex");
      });

      act(() => {
        jest.advanceTimersByTime(500);
      });

      // Show feedback again before first timeout fires
      act(() => {
        result.current.showFeedback("rgb");
      });

      // Original timer would have fired at 1000ms from first call
      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(result.current.copiedFormat).toBe("rgb");

      // New timer fires at 1000ms from second call
      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(result.current.copiedFormat).toBeNull();
    });

    it("handles rapid successive calls", () => {
      const { result } = renderHook(() =>
        useCopyFeedback({ feedbackDuration: 1000 })
      );

      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.showFeedback(`format${i}`);
          jest.advanceTimersByTime(100);
        });
      }

      expect(result.current.copiedFormat).toBe("format4");

      // Wait for last timeout
      act(() => {
        jest.advanceTimersByTime(900);
      });

      expect(result.current.copiedFormat).toBeNull();
    });

    it("works with zero duration", () => {
      const { result } = renderHook(() =>
        useCopyFeedback({ feedbackDuration: 0 })
      );

      act(() => {
        result.current.showFeedback("hex");
      });
      expect(result.current.copiedFormat).toBe("hex");

      act(() => {
        jest.advanceTimersByTime(0);
      });

      expect(result.current.copiedFormat).toBeNull();
    });
  });

  describe("clearFeedback", () => {
    it("clears copied format", () => {
      const { result } = renderHook(() => useCopyFeedback());

      act(() => {
        result.current.showFeedback("hex");
      });
      expect(result.current.copiedFormat).toBe("hex");

      act(() => {
        result.current.clearFeedback();
      });

      expect(result.current.copiedFormat).toBeNull();
    });

    it("cancels pending timeout", () => {
      const { result } = renderHook(() =>
        useCopyFeedback({ feedbackDuration: 2000 })
      );

      act(() => {
        result.current.showFeedback("hex");
      });

      act(() => {
        jest.advanceTimersByTime(500);
        result.current.clearFeedback();
      });

      // Timeout should not fire
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      expect(result.current.copiedFormat).toBeNull();
    });

    it("can be called multiple times safely", () => {
      const { result } = renderHook(() => useCopyFeedback());

      act(() => {
        result.current.clearFeedback();
        result.current.clearFeedback();
        result.current.clearFeedback();
      });

      expect(result.current.copiedFormat).toBeNull();
    });

    it("can be called without previous showFeedback", () => {
      const { result } = renderHook(() => useCopyFeedback());

      // Should not throw
      act(() => {
        result.current.clearFeedback();
      });

      expect(result.current.copiedFormat).toBeNull();
    });
  });

  describe("cleanup", () => {
    it("cleans up timeout on unmount", () => {
      const { result, unmount } = renderHook(() =>
        useCopyFeedback({ feedbackDuration: 1000 })
      );

      act(() => {
        result.current.showFeedback("hex");
      });

      unmount();

      // Should not throw or cause issues
      act(() => {
        jest.runAllTimers();
      });
    });

    it("prevents state updates after unmount", () => {
      const { result, unmount } = renderHook(() =>
        useCopyFeedback({ feedbackDuration: 1000 })
      );

      act(() => {
        result.current.showFeedback("hex");
      });

      unmount();

      // This should not cause warnings or errors
      act(() => {
        jest.advanceTimersByTime(1000);
      });
    });
  });

  describe("duration changes", () => {
    it("uses updated duration for new feedback calls", () => {
      const { result, rerender } = renderHook(
        ({ duration }) => useCopyFeedback({ feedbackDuration: duration }),
        { initialProps: { duration: 1000 } }
      );

      // Change duration
      rerender({ duration: 2000 });

      act(() => {
        result.current.showFeedback("hex");
      });

      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.copiedFormat).toBe("hex");

      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.copiedFormat).toBeNull();
    });
  });

  describe("callback stability", () => {
    it("returns stable function references", () => {
      const { result, rerender } = renderHook(() => useCopyFeedback());

      const { showFeedback: show1, clearFeedback: clear1 } = result.current;

      rerender();

      const { showFeedback: show2, clearFeedback: clear2 } = result.current;

      // clearFeedback should be stable
      expect(clear1).toBe(clear2);
      // showFeedback should be stable when feedbackDuration doesn't change
      expect(show1).toBe(show2);
    });

    it("updates showFeedback when duration changes", () => {
      const { result, rerender } = renderHook(
        ({ duration }) => useCopyFeedback({ feedbackDuration: duration }),
        { initialProps: { duration: 1000 } }
      );

      const { showFeedback: show1 } = result.current;

      rerender({ duration: 2000 });

      const { showFeedback: show2 } = result.current;

      // showFeedback should be updated when feedbackDuration changes
      expect(show1).not.toBe(show2);
    });
  });

  describe("edge cases", () => {
    it("handles empty string format", () => {
      const { result } = renderHook(() => useCopyFeedback());

      act(() => {
        result.current.showFeedback("");
      });

      expect(result.current.copiedFormat).toBe("");
    });

    it("handles very long format strings", () => {
      const { result } = renderHook(() => useCopyFeedback());
      const longFormat = "x".repeat(1000);

      act(() => {
        result.current.showFeedback(longFormat);
      });

      expect(result.current.copiedFormat).toBe(longFormat);
    });

    it("handles special characters in format", () => {
      const { result } = renderHook(() => useCopyFeedback());
      const specialFormat = "rgb(255, 0, 0)";

      act(() => {
        result.current.showFeedback(specialFormat);
      });

      expect(result.current.copiedFormat).toBe(specialFormat);
    });

    it("handles very large durations", () => {
      const { result } = renderHook(() =>
        useCopyFeedback({ feedbackDuration: 999999 })
      );

      act(() => {
        result.current.showFeedback("hex");
      });

      act(() => {
        jest.advanceTimersByTime(100000);
      });

      expect(result.current.copiedFormat).toBe("hex");
    });
  });
});
