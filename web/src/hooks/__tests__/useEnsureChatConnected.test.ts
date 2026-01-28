import { renderHook, cleanup } from "@testing-library/react";
import { useEnsureChatConnected } from "../useEnsureChatConnected";

describe("useEnsureChatConnected", () => {
  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
  });

  it("logs message when autoConnect is true", () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    renderHook(() => useEnsureChatConnected());

    expect(consoleSpy).toHaveBeenCalledWith(
      "useEnsureChatConnected: WebSocketManager handles connection automatically"
    );

    consoleSpy.mockRestore();
  });

  it("does not log when autoConnect is false", () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    renderHook(() => useEnsureChatConnected({ autoConnect: false }));

    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("returns undefined", () => {
    const { result } = renderHook(() => useEnsureChatConnected());

    expect(result.current).toBeUndefined();
  });

  it("uses default options when no options provided", () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    renderHook(() => useEnsureChatConnected());

    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("handles disconnectOnUnmount option", () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    const { unmount } = renderHook(() =>
      useEnsureChatConnected({ disconnectOnUnmount: true })
    );

    unmount();

    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("handles both options set to false", () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    renderHook(() =>
      useEnsureChatConnected({ autoConnect: false, disconnectOnUnmount: false })
    );

    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
