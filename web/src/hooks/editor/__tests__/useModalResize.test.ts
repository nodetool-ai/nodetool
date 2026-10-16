import { renderHook, act } from "@testing-library/react";
import { useModalResize } from "../useModalResize";

const KEY = "__test_modal_height__";

beforeEach(() => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* empty */
  }
});

describe("useModalResize", () => {
  test("initial height and persistence on update", () => {
    const { result } = renderHook(() =>
      useModalResize({
        storageKey: KEY,
        minHeight: 100,
        defaultHeight: 200,
        maxHeight: 500
      })
    );
    // initial default
    expect(result.current.modalHeight).toBe(200);

    act(() => {
      result.current.resizeBy(50);
    });
    expect(result.current.modalHeight).toBe(250);

    // Clamped to the max and the min.
    act(() => {
      result.current.resizeBy(1000);
    });
    expect(result.current.modalHeight).toBe(500);
    act(() => {
      result.current.resizeBy(-1000);
    });
    expect(result.current.modalHeight).toBe(100);
    expect(result.current.minHeight).toBe(100);
    expect(result.current.maxHeight).toBe(500);
  });

  test("respects min/max when updating programmatically", () => {
    const { result } = renderHook(() =>
      useModalResize({
        storageKey: KEY,
        minHeight: 100,
        defaultHeight: 200,
        maxHeight: 300
      })
    );

    const { setModalHeight } = result.current;

    act(() => {
      setModalHeight(50);
    });
    expect(result.current.modalHeight).toBe(50); // direct setter bypasses clamp (allowed)
  });
});
