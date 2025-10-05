import { renderHook, act } from "@testing-library/react";
import { useAssistantVisibility } from "../useAssistantVisibility";

const KEY = "__test_assistant_visible__";

beforeEach(() => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* empty */
  }
});

describe("useAssistantVisibility", () => {
  test("default true and persists", () => {
    const { result } = renderHook(() =>
      useAssistantVisibility({ storageKey: KEY, defaultVisible: true })
    );
    expect(result.current.assistantVisible).toBe(true);

    act(() => {
      result.current.toggleAssistantVisible();
    });
    expect(result.current.assistantVisible).toBe(false);
    expect(localStorage.getItem(KEY)).toBe("false");
  });

  test("reads initial value from storage", () => {
    localStorage.setItem(KEY, "false");
    const { result } = renderHook(() =>
      useAssistantVisibility({ storageKey: KEY, defaultVisible: true })
    );
    expect(result.current.assistantVisible).toBe(false);
  });
});









