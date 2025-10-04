import { renderHook, act } from "@testing-library/react";
import { useEditorMode } from "../useEditorMode";

const KEY = "__test_editor_mode__";

beforeEach(() => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* empty */
  }
});

describe("useEditorMode", () => {
  test("defaults to false when no localStorage", () => {
    const { result } = renderHook(() => useEditorMode({ storageKey: KEY }));
    expect(result.current.isCodeEditor).toBe(false);
  });

  test("persists toggle to localStorage and calls onCodeEnabled when enabling", () => {
    const onCodeEnabled = jest.fn();
    const { result } = renderHook(() =>
      useEditorMode({ storageKey: KEY, onCodeEnabled })
    );

    act(() => {
      result.current.toggleEditorMode();
    });

    expect(result.current.isCodeEditor).toBe(true);
    expect(localStorage.getItem(KEY)).toBe("true");
    expect(onCodeEnabled).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.toggleEditorMode();
    });

    expect(result.current.isCodeEditor).toBe(false);
    expect(localStorage.getItem(KEY)).toBe("false");
  });

  test("reads initial value from localStorage", () => {
    localStorage.setItem(KEY, "true");
    const { result } = renderHook(() => useEditorMode({ storageKey: KEY }));
    expect(result.current.isCodeEditor).toBe(true);
  });
});






