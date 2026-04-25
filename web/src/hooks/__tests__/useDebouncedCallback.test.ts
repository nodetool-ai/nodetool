import { renderHook, act } from "@testing-library/react";
import { useDebouncedCallback } from "../useDebouncedCallback";

describe("useDebouncedCallback", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("does not call the function immediately", () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 200));

    act(() => {
      result.current("arg1");
    });

    expect(fn).not.toHaveBeenCalled();
  });

  it("calls the function after the delay", () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 200));

    act(() => {
      result.current("hello");
    });

    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("hello");
  });

  it("resets the timer on subsequent calls", () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 200));

    act(() => {
      result.current("first");
    });

    act(() => {
      jest.advanceTimersByTime(150);
    });

    act(() => {
      result.current("second");
    });

    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(fn).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(50);
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("second");
  });

  it("cancel() prevents the pending call", () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 200));

    act(() => {
      result.current("value");
    });

    act(() => {
      result.current.cancel();
    });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(fn).not.toHaveBeenCalled();
  });

  it("always calls the latest version of the callback", () => {
    let captured = "";
    const fn1 = jest.fn(() => {
      captured = "fn1";
    });
    const fn2 = jest.fn(() => {
      captured = "fn2";
    });

    const { result, rerender } = renderHook(
      ({ fn }) => useDebouncedCallback(fn, 200),
      { initialProps: { fn: fn1 as (...args: unknown[]) => unknown } }
    );

    act(() => {
      result.current();
    });

    rerender({ fn: fn2 as (...args: unknown[]) => unknown });

    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(captured).toBe("fn2");
  });

  it("cleans up timer on unmount", () => {
    const fn = jest.fn();
    const { result, unmount } = renderHook(() =>
      useDebouncedCallback(fn, 200)
    );

    act(() => {
      result.current();
    });

    unmount();

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(fn).not.toHaveBeenCalled();
  });

  it("creates a new debounced function when delay changes", () => {
    const fn = jest.fn();
    const { result, rerender } = renderHook(
      ({ delay }) => useDebouncedCallback(fn, delay),
      { initialProps: { delay: 200 } }
    );

    act(() => {
      result.current("a");
    });

    rerender({ delay: 500 });

    act(() => {
      result.current("b");
    });

    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(fn).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("b");
  });
});
