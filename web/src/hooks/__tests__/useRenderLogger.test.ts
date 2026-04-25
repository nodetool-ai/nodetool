import { renderHook } from "@testing-library/react";
import { useRenderLogger } from "../useRenderLogger";

// Mock the constants module
jest.mock("../../config/constants", () => ({
  DEBUG_RENDER_LOGGING: true,
}));

describe("useRenderLogger", () => {
  let infoSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  it("should not log on initial render when no previous deps exist", () => {
    renderHook(() => useRenderLogger("TestComponent", { value: 1 }));

    // On initial render, there are no changes because prevDeps starts with the same reference
    // useMemo compares the deps array, and on first render they're the same object
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("should call console.info when dependencies change", () => {
    const { rerender } = renderHook(
      ({ deps }) => useRenderLogger("TestComponent", deps),
      { initialProps: { deps: { value: 1 } } }
    );

    infoSpy.mockClear();

    rerender({ deps: { value: 2 } });

    expect(infoSpy).toHaveBeenCalledWith(
      "TestComponent render triggered by:",
      "value"
    );
  });

  it("should handle multiple dependency changes", () => {
    const { rerender } = renderHook(
      ({ deps }) => useRenderLogger("TestComponent", deps),
      { initialProps: { deps: { value1: 1, value2: "a" } } }
    );

    infoSpy.mockClear();

    rerender({ deps: { value1: 2, value2: "b" } });

    expect(infoSpy).toHaveBeenCalledWith(
      "TestComponent render triggered by:",
      "value1, value2"
    );
  });

  it("should only log changed dependencies", () => {
    const { rerender } = renderHook(
      ({ deps }) => useRenderLogger("TestComponent", deps),
      { initialProps: { deps: { changed: 1, unchanged: "constant" } } }
    );

    infoSpy.mockClear();

    rerender({ deps: { changed: 2, unchanged: "constant" } });

    expect(infoSpy).toHaveBeenCalledWith(
      "TestComponent render triggered by:",
      "changed"
    );
  });
});
