import { renderHook } from "@testing-library/react";
import { useFloatingToolbarPosition } from "../useFloatingToolbarPosition";

describe("useFloatingToolbarPosition", () => {
  it("returns default position when no panels are visible", () => {
    const { result } = renderHook(() =>
      useFloatingToolbarPosition(false, 0, false, 0)
    );

    expect(result.current).toEqual({
      bottom: "20px"
    });
  });

  it("adjusts position when right panel is visible", () => {
    const { result } = renderHook(() =>
      useFloatingToolbarPosition(true, 300, false, 0)
    );

    expect(result.current).toEqual({
      left: "auto",
      transform: "none",
      right: "320px",
      bottom: "20px"
    });
  });

  it("uses minimum right offset of 72px", () => {
    const { result } = renderHook(() =>
      useFloatingToolbarPosition(true, 50, false, 0)
    );

    expect(result.current).toEqual({
      left: "auto",
      transform: "none",
      right: "72px",
      bottom: "20px"
    });
  });

  it("adjusts position when bottom panel is visible", () => {
    const { result } = renderHook(() =>
      useFloatingToolbarPosition(false, 0, true, 200)
    );

    expect(result.current.bottom).toBe("220px");
  });

  it("adjusts position when both panels are visible", () => {
    const { result } = renderHook(() =>
      useFloatingToolbarPosition(true, 400, true, 250)
    );

    expect(result.current).toEqual({
      left: "auto",
      transform: "none",
      right: "420px",
      bottom: "270px"
    });
  });

  it("respects minimum bottom offset of 80px", () => {
    const { result } = renderHook(() =>
      useFloatingToolbarPosition(false, 0, true, 10)
    );

    expect(result.current.bottom).toBe("80px");
  });

  it("caps bottom panel size at 60% of window height", () => {
    // Mock window.innerHeight
    Object.defineProperty(window, "innerHeight", {
      writable: true,
      configurable: true,
      value: 1000
    });

    const { result } = renderHook(() =>
      useFloatingToolbarPosition(false, 0, true, 800)
    );

    // Max allowed: 1000 * 0.6 = 600
    // Position: 600 + 20 = 620
    expect(result.current.bottom).toBe("620px");
  });

  it("uses minimum height of 200px for bottom panel", () => {
    // Mock window.innerHeight to very small value
    Object.defineProperty(window, "innerHeight", {
      writable: true,
      configurable: true,
      value: 300
    });

    const { result } = renderHook(() =>
      useFloatingToolbarPosition(false, 0, true, 150)
    );

    // Max allowed: max(200, 300 * 0.6) = max(200, 180) = 200
    // Actual: min(150, 200) = 150
    // Position: max(150 + 20, 80) = max(170, 80) = 170
    expect(result.current.bottom).toBe("170px");
  });

  it("memoizes result when inputs don't change", () => {
    const { result, rerender } = renderHook(
      ({ isRightVisible, rightSize, isBottomVisible, bottomSize }) =>
        useFloatingToolbarPosition(
          isRightVisible,
          rightSize,
          isBottomVisible,
          bottomSize
        ),
      {
        initialProps: {
          isRightVisible: true,
          rightSize: 300,
          isBottomVisible: true,
          bottomSize: 200
        }
      }
    );

    const firstResult = result.current;

    rerender({
      isRightVisible: true,
      rightSize: 300,
      isBottomVisible: true,
      bottomSize: 200
    });

    expect(result.current).toBe(firstResult);
  });

  it("updates result when inputs change", () => {
    const { result, rerender } = renderHook(
      ({ isRightVisible, rightSize, isBottomVisible, bottomSize }) =>
        useFloatingToolbarPosition(
          isRightVisible,
          rightSize,
          isBottomVisible,
          bottomSize
        ),
      {
        initialProps: {
          isRightVisible: true,
          rightSize: 300,
          isBottomVisible: true,
          bottomSize: 200
        }
      }
    );

    const firstResult = result.current;

    rerender({
      isRightVisible: true,
      rightSize: 400,
      isBottomVisible: true,
      bottomSize: 200
    });

    expect(result.current).not.toBe(firstResult);
    expect(result.current.right).toBe("420px");
  });
});
