import { renderHook } from "@testing-library/react";
import { useRenderLogger } from "../useRenderLogger";

// Mock the constants module
jest.mock("../../config/constants", () => ({
  DEBUG_RENDER_LOGGING: true,
}));

// Mock loglevel
jest.mock("loglevel", () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
  },
}));

// Get the mocked module
import log from "loglevel";

describe("useRenderLogger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the mock
    (log.info as jest.Mock).mockClear();
  });

  it("should not log on initial render when no previous deps exist", () => {
    renderHook(() => useRenderLogger("TestComponent", { value: 1 }));

    // On initial render, there are no changes because prevDeps starts with the same reference
    // useMemo compares the deps array, and on first render they're the same object
    expect(log.info).not.toHaveBeenCalled();
  });

  it("should call log.info when dependencies change", () => {
    const { rerender } = renderHook(
      ({ deps }) => useRenderLogger("TestComponent", deps),
      { initialProps: { deps: { value: 1 } } }
    );

    // Clear initial call
    (log.info as jest.Mock).mockClear();

    rerender({ deps: { value: 2 } });

    expect(log.info).toHaveBeenCalledWith(
      "TestComponent render triggered by:",
      "value"
    );
  });

  it("should handle multiple dependency changes", () => {
    const { rerender } = renderHook(
      ({ deps }) => useRenderLogger("TestComponent", deps),
      { initialProps: { deps: { value1: 1, value2: "a" } } }
    );

    // Clear initial call
    (log.info as jest.Mock).mockClear();

    rerender({ deps: { value1: 2, value2: "b" } });

    expect(log.info).toHaveBeenCalledWith(
      "TestComponent render triggered by:",
      "value1, value2"
    );
  });

  it("should only log changed dependencies", () => {
    const { rerender } = renderHook(
      ({ deps }) => useRenderLogger("TestComponent", deps),
      { initialProps: { deps: { changed: 1, unchanged: "constant" } } }
    );

    // Clear initial call
    (log.info as jest.Mock).mockClear();

    rerender({ deps: { changed: 2, unchanged: "constant" } });

    expect(log.info).toHaveBeenCalledWith(
      "TestComponent render triggered by:",
      "changed"
    );
  });
});
