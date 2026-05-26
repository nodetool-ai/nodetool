import { renderHook, act } from "@testing-library/react";
import { useRunningTime } from "../useRunningTime";

describe("useRunningTime", () => {
  const getTimerKey = () => expect.getState().currentTestName ?? "test";

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("initializes with 0 seconds when not running", () => {
    const { result } = renderHook(() => useRunningTime(false, getTimerKey()));
    expect(result.current).toBe(0);
  });

  it("starts counting when isRunning becomes true", () => {
    const { result } = renderHook(() => useRunningTime(true, getTimerKey()));

    expect(result.current).toBe(0);

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(result.current).toBe(1);
  });

  it("increments seconds every second", () => {
    const { result } = renderHook(() => useRunningTime(true, getTimerKey()));

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(result.current).toBe(3);
  });

  it("resets to 0 when isRunning becomes false", () => {
    const { result, rerender } = renderHook(
      ({ isRunning }) => useRunningTime(isRunning, getTimerKey()),
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
      ({ isRunning }) => useRunningTime(isRunning, getTimerKey()),
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
      ({ isRunning }) => useRunningTime(isRunning, getTimerKey()),
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
    const timerKey = getTimerKey();
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
});
