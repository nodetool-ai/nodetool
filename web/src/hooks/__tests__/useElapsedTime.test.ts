import { renderHook, act } from "@testing-library/react";
import { useElapsedTime } from "../useElapsedTime";

describe("useElapsedTime", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns 0 when inactive", () => {
    const { result } = renderHook(() => useElapsedTime(false));
    expect(result.current).toBe(0);
  });

  it("starts at 0 when active", () => {
    const { result } = renderHook(() => useElapsedTime(true));
    expect(result.current).toBe(0);
  });

  it("increments each second while active", () => {
    const { result } = renderHook(() => useElapsedTime(true));

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(1);

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(3);
  });

  it("resets to 0 when deactivated", () => {
    const { result, rerender } = renderHook(
      ({ active }) => useElapsedTime(active),
      { initialProps: { active: true } }
    );

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(result.current).toBe(3);

    rerender({ active: false });
    expect(result.current).toBe(0);
  });

  it("restarts from 0 when reactivated", () => {
    const { result, rerender } = renderHook(
      ({ active }) => useElapsedTime(active),
      { initialProps: { active: true } }
    );

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(5);

    rerender({ active: false });
    rerender({ active: true });
    expect(result.current).toBe(0);

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(2);
  });

  it("stops counting on unmount", () => {
    const { result, unmount } = renderHook(() => useElapsedTime(true));

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(2);

    unmount();

    act(() => {
      jest.runAllTimers();
    });
  });

  it("does not tick when always inactive", () => {
    const { result } = renderHook(() => useElapsedTime(false));

    act(() => {
      jest.advanceTimersByTime(10000);
    });
    expect(result.current).toBe(0);
  });

  it("handles rapid active toggles", () => {
    const { result, rerender } = renderHook(
      ({ active }) => useElapsedTime(active),
      { initialProps: { active: true } }
    );

    act(() => {
      jest.advanceTimersByTime(500);
    });
    rerender({ active: false });
    rerender({ active: true });
    rerender({ active: false });
    rerender({ active: true });

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(result.current).toBe(3);
  });
});
