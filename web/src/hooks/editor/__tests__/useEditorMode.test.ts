import { renderHook, act } from "@testing-library/react";
import { useEditorMode } from "../useEditorMode";

describe("useEditorMode", () => {
  test("defaults to false", () => {
    const { result } = renderHook(() => useEditorMode());
    expect(result.current.isCodeEditor).toBe(false);
  });

  test("defaults to true when defaultEnabled is true", () => {
    const { result } = renderHook(() => useEditorMode({ defaultEnabled: true }));
    expect(result.current.isCodeEditor).toBe(true);
  });

  test("toggle switches mode and calls onCodeEnabled when enabling", () => {
    const onCodeEnabled = jest.fn();
    const { result } = renderHook(() =>
      useEditorMode({ onCodeEnabled })
    );

    act(() => {
      result.current.toggleEditorMode();
    });

    expect(result.current.isCodeEditor).toBe(true);
    expect(onCodeEnabled).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.toggleEditorMode();
    });

    expect(result.current.isCodeEditor).toBe(false);
    // onCodeEnabled should not be called again when disabling
    expect(onCodeEnabled).toHaveBeenCalledTimes(1);
  });
});
