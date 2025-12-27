import { renderHook, waitFor } from "@testing-library/react";
import { useIsDarkMode } from "../../hooks/useIsDarkMode";

describe("useIsDarkMode", () => {
  beforeEach(() => {
    // Clear any existing dark mode class
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
    const { result } = renderHook(() => useIsDarkMode());
    expect(result.current).toBe(false);

    // Toggle dark mode
    document.documentElement.classList.add("dark");

    // Wait for the state to update via MutationObserver
    await waitFor(
      () => {
        expect(result.current).toBe(true);
      },
      { timeout: 1000 }
    );
  });

  it("updates when dark mode class is removed", async () => {
    document.documentElement.classList.add("dark");
    const { result } = renderHook(() => useIsDarkMode());
    expect(result.current).toBe(true);

    // Toggle dark mode
    document.documentElement.classList.remove("dark");

    // Wait for the state to update via MutationObserver
    await waitFor(
      () => {
        expect(result.current).toBe(false);
      },
      { timeout: 1000 }
    );
  });

  it("cleans up observer on unmount", () => {
    const disconnectSpy = jest.spyOn(MutationObserver.prototype, "disconnect");
    const { unmount } = renderHook(() => useIsDarkMode());

    unmount();

    expect(disconnectSpy).toHaveBeenCalled();
    disconnectSpy.mockRestore();
  });
});
