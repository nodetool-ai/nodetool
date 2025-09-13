import { renderHook, act } from "@testing-library/react";
import { useCodeLanguage } from "../useCodeLanguage";

const KEY = "textEditorModal_codeLanguage";

beforeEach(() => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* empty */
  }
});

describe("useCodeLanguage", () => {
  test("initializes from default and persists", () => {
    const { result } = renderHook(() =>
      useCodeLanguage({ defaultLanguage: "python" })
    );
    expect(result.current.codeLanguage).toBe("python");
    act(() => result.current.setCodeLanguage("javascript"));
    expect(localStorage.getItem(KEY)).toBe("javascript");
  });

  test("reads from storage when present", () => {
    localStorage.setItem(KEY, "typescript");
    const { result } = renderHook(() =>
      useCodeLanguage({ defaultLanguage: "python" })
    );
    expect(result.current.codeLanguage).toBe("typescript");
  });
});
