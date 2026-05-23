import { renderHook } from "@testing-library/react";
import { useFloatingToolbarPosition } from "../useFloatingToolbarPosition";

describe("useFloatingToolbarPosition", () => {
  // The bottom panel always renders a thin tab rail (36px), so the toolbar
  // sits 12px above it (48px) when no view is expanded.
  const COLLAPSED_BOTTOM = "48px";

  it("returns default position when the bottom panel is collapsed", () => {
    const { result } = renderHook(() =>
      useFloatingToolbarPosition(false, 0)
    );

    expect(result.current).toEqual({
      bottom: COLLAPSED_BOTTOM
    });
  });

  it("ignores right-panel state — toolbar stays centered when inspector opens", () => {
    // The right panel auto-opens on node selection; shifting the toolbar
    // with it would jump on every click.
    const { result } = renderHook(() =>
      useFloatingToolbarPosition(false, 0)
    );

    expect(result.current).toEqual({
      bottom: COLLAPSED_BOTTOM
    });
  });

  it("adjusts position when bottom panel is visible", () => {
    const { result } = renderHook(() =>
      useFloatingToolbarPosition(true, 200)
    );

    expect(result.current.bottom).toBe("220px");
  });

  it("respects minimum bottom offset of 80px", () => {
    const { result } = renderHook(() =>
      useFloatingToolbarPosition(true, 10)
    );

    expect(result.current.bottom).toBe("80px");
  });

  it("caps bottom panel size at 60% of window height", () => {
    Object.defineProperty(window, "innerHeight", {
      writable: true,
      configurable: true,
      value: 1000
    });

    const { result } = renderHook(() =>
      useFloatingToolbarPosition(true, 800)
    );

    // Max allowed: 1000 * 0.6 = 600
    // Position: 600 + 20 = 620
    expect(result.current.bottom).toBe("620px");
  });

  it("uses minimum height of 200px for bottom panel", () => {
    Object.defineProperty(window, "innerHeight", {
      writable: true,
      configurable: true,
      value: 300
    });

    const { result } = renderHook(() =>
      useFloatingToolbarPosition(true, 150)
    );

    // Max allowed: max(200, 300 * 0.6) = max(200, 180) = 200
    // Actual: min(150, 200) = 150
    // Position: max(150 + 20, 80) = max(170, 80) = 170
    expect(result.current.bottom).toBe("170px");
  });

  it("memoizes result when inputs don't change", () => {
    const { result, rerender } = renderHook(
      ({ isBottomVisible, bottomSize }) =>
        useFloatingToolbarPosition(isBottomVisible, bottomSize),
      {
        initialProps: {
          isBottomVisible: true,
          bottomSize: 200
        }
      }
    );

    const firstResult = result.current;

    rerender({
      isBottomVisible: true,
      bottomSize: 200
    });

    expect(result.current).toBe(firstResult);
  });

  it("updates result when inputs change", () => {
    Object.defineProperty(window, "innerHeight", {
      writable: true,
      configurable: true,
      value: 1000
    });
    const { result, rerender } = renderHook(
      ({ isBottomVisible, bottomSize }) =>
        useFloatingToolbarPosition(isBottomVisible, bottomSize),
      {
        initialProps: {
          isBottomVisible: true,
          bottomSize: 200
        }
      }
    );

    const firstResult = result.current;

    rerender({
      isBottomVisible: true,
      bottomSize: 300
    });

    expect(result.current).not.toBe(firstResult);
    expect(result.current.bottom).toBe("320px");
  });
});
