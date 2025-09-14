import { renderHook, act } from "@testing-library/react";
import { useFullscreenMode } from "../useFullscreenMode";

const KEY = "__test_fullscreen__";

beforeEach(() => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* empty */
  }
});

describe("useFullscreenMode", () => {
  test("default false and persists", () => {
    const { result } = renderHook(() => useFullscreenMode({ storageKey: KEY }));
    expect(result.current.isFullscreen).toBe(false);

    act(() => {
      result.current.toggleFullscreen();
    });
    expect(result.current.isFullscreen).toBe(true);
    expect(localStorage.getItem(KEY)).toBe("true");
  });

  test("reads initial value from storage", () => {
    localStorage.setItem(KEY, "true");
    const { result } = renderHook(() => useFullscreenMode({ storageKey: KEY }));
    expect(result.current.isFullscreen).toBe(true);
  });
});

