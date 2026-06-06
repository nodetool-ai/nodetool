import { renderHook, act } from "@testing-library/react";
import { useRunningTime } from "../useRunningTime";

describe("useRunningTime", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("initializes with 0 seconds when not running", () => {
    const { result } = renderHook(() => useRunningTime(false, "test-initial"));
    expect(result.current).toBe(0);
  });

  it("starts counting when isRunning becomes true", () => {
    const { result } = renderHook(() => useRunningTime(true, "test-start"));

    expect(result.current).toBe(0);

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(result.current).toBe(1);
  });

  it("increments seconds every second", () => {
    const { result } = renderHook(() => useRunningTime(true, "test-increment"));

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(result.current).toBe(3);
  });

  it("resets to 0 when isRunning becomes false", () => {
    const { result, rerender } = renderHook(
      ({ isRunning }) => useRunningTime(isRunning, "test-reset"),
      { initialProps: { isRunning: true } }
    );

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(result.current).toBe(5);

    rerender({ isRunning: false });

    expect(result.current).toBe(0);
  });

  it("restarts counting from 0 when isRunning toggles", () => {
    const { result, rerender } = renderHook(
      ({ isRunning }) => useRunningTime(isRunning, "test-toggle"),
      { initialProps: { isRunning: true } }
    );

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(result.current).toBe(3);

    rerender({ isRunning: false });
    expect(result.current).toBe(0);

    rerender({ isRunning: true });
    expect(result.current).toBe(0);

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(result.current).toBe(2);
  });

  it("handles rapid toggles", () => {
    const { result, rerender } = renderHook(
      ({ isRunning }) => useRunningTime(isRunning, "test-rapid-toggle"),
      { initialProps: { isRunning: true } }
    );

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    rerender({ isRunning: false });
    rerender({ isRunning: true });
    rerender({ isRunning: false });
    rerender({ isRunning: true });

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(result.current).toBe(2);
  });

  it("keeps counting after remount while still running", () => {
    const timerKey = "test-remount";
    const { result, unmount } = renderHook(() => useRunningTime(true, timerKey));

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(result.current).toBe(3);

    unmount();

    const remounted = renderHook(() => useRunningTime(true, timerKey));
    expect(remounted.result.current).toBe(3);

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(remounted.result.current).toBe(5);
  });

  it("clears persisted timer when workflow is not running", () => {
    const timerKey = "test-stop-clears";
    const running = renderHook(() => useRunningTime(true, timerKey));

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(running.result.current).toBe(3);

    running.unmount();

    const stopped = renderHook(() => useRunningTime(false, timerKey));
    expect(stopped.result.current).toBe(0);
    stopped.unmount();

    const restarted = renderHook(() => useRunningTime(true, timerKey));
    expect(restarted.result.current).toBe(0);
  });
});
