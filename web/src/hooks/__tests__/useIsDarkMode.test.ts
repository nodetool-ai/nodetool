import { renderHook, waitFor } from "@testing-library/react";
import { useIsDarkMode } from "../../hooks/useIsDarkMode";

describe("useIsDarkMode", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    document.documentElement.classList.remove("dark");
  });

  it("returns false when dark mode is not active", () => {
    const { result } = renderHook(() => useIsDarkMode());
    expect(result.current).toBe(false);
  });

  it("returns true when dark mode is active", () => {
    document.documentElement.classList.add("dark");
    const { result } = renderHook(() => useIsDarkMode());
    expect(result.current).toBe(true);
  });

  it("updates when dark mode class is added", async () => {
    const { result, rerender } = renderHook(() => useIsDarkMode());
    expect(result.current).toBe(false);

    document.documentElement.classList.add("dark");
    rerender();

    await waitFor(
      () => {
        expect(result.current).toBe(true);
      },
      { timeout: 1000 }
    );
  });

  it("updates when dark mode class is removed", async () => {
    document.documentElement.classList.add("dark");
    const { result, rerender } = renderHook(() => useIsDarkMode());
    expect(result.current).toBe(true);

    document.documentElement.classList.remove("dark");
    rerender();

    await waitFor(
      () => {
        expect(result.current).toBe(false);
      },
      { timeout: 1000 }
    );
  });

  it("cleans up observer on unmount", () => {
    const disconnectSpy = jest.fn();
    const originalDisconnect = MutationObserver.prototype.disconnect;
    MutationObserver.prototype.disconnect = disconnectSpy;

    const { unmount } = renderHook(() => useIsDarkMode());
    unmount();

    expect(disconnectSpy).toHaveBeenCalled();

    MutationObserver.prototype.disconnect = originalDisconnect;
  });
});
