import { renderHook, act } from "@testing-library/react";
import { useCopyToClipboard } from "../useCopyToClipboard";

// Mock navigator.clipboard
const mockWriteText = jest.fn();
Object.assign(navigator, {
  clipboard: {
    writeText: mockWriteText
  }
});

describe("useCopyToClipboard", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockWriteText.mockClear();
    mockWriteText.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("initial state", () => {
    it("returns isCopied as false initially", () => {
      const { result } = renderHook(() => useCopyToClipboard());
      
      expect(result.current.isCopied).toBe(false);
    });

    it("returns copiedText as null initially", () => {
      const { result } = renderHook(() => useCopyToClipboard());
      
      expect(result.current.copiedText).toBeNull();
    });

    it("returns copyToClipboard function", () => {
      const { result } = renderHook(() => useCopyToClipboard());
      
      expect(typeof result.current.copyToClipboard).toBe("function");
    });
  });

  describe("copyToClipboard", () => {
    it("copies text to clipboard", async () => {
      const { result } = renderHook(() => useCopyToClipboard());
      
      await act(async () => {
        await result.current.copyToClipboard("test text");
      });

      expect(mockWriteText).toHaveBeenCalledWith("test text");
    });

    it("sets isCopied to true after copying", async () => {
      const { result } = renderHook(() => useCopyToClipboard());
      
      await act(async () => {
        await result.current.copyToClipboard("test text");
      });

      expect(result.current.isCopied).toBe(true);
    });

    it("sets copiedText after copying", async () => {
      const { result } = renderHook(() => useCopyToClipboard());
      
      await act(async () => {
        await result.current.copyToClipboard("test text");
      });

      expect(result.current.copiedText).toBe("test text");
    });

    it("resets isCopied to false after feedback duration", async () => {
      const { result } = renderHook(() =>
        useCopyToClipboard({ feedbackDuration: 1000 })
      );
      
      await act(async () => {
        await result.current.copyToClipboard("test text");
      });

      expect(result.current.isCopied).toBe(true);

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(result.current.isCopied).toBe(false);
    });

    it("does not reset isCopied before feedback duration", async () => {
      const { result } = renderHook(() =>
        useCopyToClipboard({ feedbackDuration: 1000 })
      );
      
      await act(async () => {
        await result.current.copyToClipboard("test text");
      });

      act(() => {
        jest.advanceTimersByTime(999);
      });

      expect(result.current.isCopied).toBe(true);
    });

    it("uses default feedback duration of 1500ms", async () => {
      const { result } = renderHook(() => useCopyToClipboard());
      
      await act(async () => {
        await result.current.copyToClipboard("test text");
      });

      act(() => {
        jest.advanceTimersByTime(1499);
      });
      expect(result.current.isCopied).toBe(true);

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(result.current.isCopied).toBe(false);
    });

    it("calls onCopySuccess callback", async () => {
      const onCopySuccess = jest.fn();
      const { result } = renderHook(() =>
        useCopyToClipboard({ onCopySuccess })
      );
      
      await act(async () => {
        await result.current.copyToClipboard("test text");
      });

      expect(onCopySuccess).toHaveBeenCalledWith("test text");
    });

    it("calls onCopyError callback on failure", async () => {
      const onCopyError = jest.fn();
      const error = new Error("Copy failed");
      mockWriteText.mockRejectedValue(error);

      const { result } = renderHook(() =>
        useCopyToClipboard({ onCopyError })
      );
      
      await act(async () => {
        try {
          await result.current.copyToClipboard("test text");
        } catch (_e) {
          // Expected to throw
        }
      });

      expect(onCopyError).toHaveBeenCalledWith(error);
    });

    it("throws error on clipboard failure", async () => {
      const error = new Error("Copy failed");
      mockWriteText.mockRejectedValue(error);

      const { result } = renderHook(() => useCopyToClipboard());
      
      await act(async () => {
        await expect(
          result.current.copyToClipboard("test text")
        ).rejects.toThrow("Copy failed");
      });
    });

    it("converts non-Error objects to Error", async () => {
      const onCopyError = jest.fn();
      mockWriteText.mockRejectedValue("string error");

      const { result } = renderHook(() =>
        useCopyToClipboard({ onCopyError })
      );
      
      await act(async () => {
        try {
          await result.current.copyToClipboard("test text");
        } catch (_e) {
          // Expected to throw
        }
      });

      expect(onCopyError).toHaveBeenCalledWith(expect.any(Error));
      expect(onCopyError.mock.calls[0][0].message).toBe("string error");
    });
  });

  describe("multiple copies", () => {
    it("updates copiedText on subsequent copies", async () => {
      const { result } = renderHook(() => useCopyToClipboard());
      
      await act(async () => {
        await result.current.copyToClipboard("first text");
      });
      expect(result.current.copiedText).toBe("first text");

      await act(async () => {
        await result.current.copyToClipboard("second text");
      });
      expect(result.current.copiedText).toBe("second text");
    });

    it("resets timer on subsequent copies", async () => {
      const { result } = renderHook(() =>
        useCopyToClipboard({ feedbackDuration: 1000 })
      );
      
      await act(async () => {
        await result.current.copyToClipboard("first text");
      });

      act(() => {
        jest.advanceTimersByTime(500);
      });

      await act(async () => {
        await result.current.copyToClipboard("second text");
      });

      // Original timer would have fired at 1000ms from first copy
      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(result.current.isCopied).toBe(true);

      // New timer fires at 1000ms from second copy
      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(result.current.isCopied).toBe(false);
    });

    it("handles rapid successive copies", async () => {
      const { result } = renderHook(() =>
        useCopyToClipboard({ feedbackDuration: 1000 })
      );
      
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          await result.current.copyToClipboard(`text ${i}`);
        });
        act(() => {
          jest.advanceTimersByTime(100);
        });
      }

      expect(result.current.isCopied).toBe(true);
      expect(result.current.copiedText).toBe("text 4");
      expect(mockWriteText).toHaveBeenCalledTimes(5);
    });
  });

  describe("feedback duration", () => {
    it("respects custom feedback duration", async () => {
      const { result } = renderHook(() =>
        useCopyToClipboard({ feedbackDuration: 3000 })
      );
      
      await act(async () => {
        await result.current.copyToClipboard("test text");
      });

      act(() => {
        jest.advanceTimersByTime(2999);
      });
      expect(result.current.isCopied).toBe(true);

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(result.current.isCopied).toBe(false);
    });

    it("handles zero feedback duration", async () => {
      const { result } = renderHook(() =>
        useCopyToClipboard({ feedbackDuration: 0 })
      );
      
      await act(async () => {
        await result.current.copyToClipboard("test text");
      });

      expect(result.current.isCopied).toBe(true);

      act(() => {
        jest.advanceTimersByTime(0);
      });

      expect(result.current.isCopied).toBe(false);
    });
  });

  describe("callback reference updates", () => {
    it("uses updated onCopySuccess callback", async () => {
      const onCopySuccess1 = jest.fn();
      const onCopySuccess2 = jest.fn();

      const { result, rerender } = renderHook(
        ({ onCopySuccess }) => useCopyToClipboard({ onCopySuccess }),
        { initialProps: { onCopySuccess: onCopySuccess1 } }
      );

      rerender({ onCopySuccess: onCopySuccess2 });
      
      await act(async () => {
        await result.current.copyToClipboard("test text");
      });

      expect(onCopySuccess1).not.toHaveBeenCalled();
      expect(onCopySuccess2).toHaveBeenCalledWith("test text");
    });

    it("uses updated onCopyError callback", async () => {
      const onCopyError1 = jest.fn();
      const onCopyError2 = jest.fn();
      mockWriteText.mockRejectedValue(new Error("Copy failed"));

      const { result, rerender } = renderHook(
        ({ onCopyError }) => useCopyToClipboard({ onCopyError }),
        { initialProps: { onCopyError: onCopyError1 } }
      );

      rerender({ onCopyError: onCopyError2 });
      
      await act(async () => {
        try {
          await result.current.copyToClipboard("test text");
        } catch (_e) {
          // Expected to throw
        }
      });

      expect(onCopyError1).not.toHaveBeenCalled();
      expect(onCopyError2).toHaveBeenCalled();
    });

    it("uses updated feedbackDuration", async () => {
      const { result, rerender } = renderHook(
        ({ feedbackDuration }) => useCopyToClipboard({ feedbackDuration }),
        { initialProps: { feedbackDuration: 1000 } }
      );

      rerender({ feedbackDuration: 2000 });
      
      await act(async () => {
        await result.current.copyToClipboard("test text");
      });

      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.isCopied).toBe(true);

      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.isCopied).toBe(false);
    });
  });

  describe("cleanup", () => {
    it("cleans up timer on unmount", async () => {
      const { result, unmount } = renderHook(() =>
        useCopyToClipboard({ feedbackDuration: 1000 })
      );
      
      await act(async () => {
        await result.current.copyToClipboard("test text");
      });

      unmount();

      // Should not throw or cause issues
      act(() => {
        jest.runAllTimers();
      });
    });
  });

  describe("edge cases", () => {
    it("handles empty string", async () => {
      const { result } = renderHook(() => useCopyToClipboard());
      
      await act(async () => {
        await result.current.copyToClipboard("");
      });

      expect(mockWriteText).toHaveBeenCalledWith("");
      expect(result.current.isCopied).toBe(true);
      expect(result.current.copiedText).toBe("");
    });

    it("handles very long strings", async () => {
      const longText = "x".repeat(10000);
      const { result } = renderHook(() => useCopyToClipboard());
      
      await act(async () => {
        await result.current.copyToClipboard(longText);
      });

      expect(mockWriteText).toHaveBeenCalledWith(longText);
      expect(result.current.isCopied).toBe(true);
    });

    it("handles special characters", async () => {
      const specialText = "🎉\n\t<>&\"'";
      const { result } = renderHook(() => useCopyToClipboard());
      
      await act(async () => {
        await result.current.copyToClipboard(specialText);
      });

      expect(mockWriteText).toHaveBeenCalledWith(specialText);
      expect(result.current.copiedText).toBe(specialText);
    });
  });
});
