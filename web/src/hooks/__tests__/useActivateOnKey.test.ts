import { describe, it, expect, jest } from "@jest/globals";
import { renderHook } from "@testing-library/react";
import { useActivateOnKey } from "../useActivateOnKey";

function makeKeyEvent(key: string): React.KeyboardEvent<HTMLElement> {
  return {
    key,
    preventDefault: jest.fn()
  } as unknown as React.KeyboardEvent<HTMLElement>;
}

describe("useActivateOnKey", () => {
  it("should call onActivate on Enter", () => {
    const onActivate = jest.fn();
    const { result } = renderHook(() => useActivateOnKey(onActivate));

    const event = makeKeyEvent("Enter");
    result.current(event);

    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("should call onActivate on Space", () => {
    const onActivate = jest.fn();
    const { result } = renderHook(() => useActivateOnKey(onActivate));

    const event = makeKeyEvent(" ");
    result.current(event);

    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("should not call onActivate on other keys", () => {
    const onActivate = jest.fn();
    const { result } = renderHook(() => useActivateOnKey(onActivate));

    const tabEvent = makeKeyEvent("Tab");
    result.current(tabEvent);

    const escapeEvent = makeKeyEvent("Escape");
    result.current(escapeEvent);

    const aEvent = makeKeyEvent("a");
    result.current(aEvent);

    expect(onActivate).not.toHaveBeenCalled();
    expect(tabEvent.preventDefault).not.toHaveBeenCalled();
  });

  it("should return a stable reference when onActivate is stable", () => {
    const onActivate = jest.fn();
    const { result, rerender } = renderHook(() => useActivateOnKey(onActivate));

    const firstHandler = result.current;
    rerender();
    expect(result.current).toBe(firstHandler);
  });
});
