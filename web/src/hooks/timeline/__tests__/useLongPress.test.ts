/**
 * useLongPress — the touch stand-in for a right-click.
 *
 * The timeline's clip and lane menus are the only route to add / split /
 * duplicate / delete on a phone, so these assert the hold fires, a mouse is
 * left to its own context menu, and a hold that turns into a drag doesn't
 * steal the gesture.
 */

import { act, renderHook } from "@testing-library/react";

import { useLongPress } from "../useLongPress";

const pointer = (
  overrides: Partial<{
    clientX: number;
    clientY: number;
    pointerType: string;
    target: EventTarget | null;
  }> = {}
) => ({
  clientX: 100,
  clientY: 100,
  pointerType: "touch",
  target: null,
  ...overrides
});

describe("useLongPress", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("fires after the hold elapses and reports where the finger went down", () => {
    const onLongPress = jest.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    const target = document.createElement("div");

    act(() => {
      result.current.start(pointer({ clientX: 42, clientY: 7, target }));
    });
    expect(onLongPress).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(onLongPress).toHaveBeenCalledWith({
      clientX: 42,
      clientY: 7,
      target
    });
  });

  it("ignores a mouse — it already has a context menu", () => {
    const onLongPress = jest.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => {
      result.current.start(pointer({ pointerType: "mouse" }));
      jest.advanceTimersByTime(2000);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("cancels once the finger moves past the tolerance, so a drag wins", () => {
    const onLongPress = jest.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => {
      result.current.start(pointer({ clientX: 100, clientY: 100 }));
      result.current.move({ clientX: 140, clientY: 100 });
      jest.advanceTimersByTime(2000);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("tolerates the jitter of a finger holding still", () => {
    const onLongPress = jest.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => {
      result.current.start(pointer({ clientX: 100, clientY: 100 }));
      result.current.move({ clientX: 104, clientY: 103 });
      jest.advanceTimersByTime(500);
    });

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("cancels explicitly on pointer up", () => {
    const onLongPress = jest.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => {
      result.current.start(pointer());
      result.current.cancel();
      jest.advanceTimersByTime(2000);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("does not fire after unmount", () => {
    const onLongPress = jest.fn();
    const { result, unmount } = renderHook(() => useLongPress(onLongPress));

    act(() => {
      result.current.start(pointer());
    });
    unmount();
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });
});
