import { renderHook, waitFor } from "@testing-library/react";
import { useEnsureChatConnected } from "../useEnsureChatConnected";

describe("useEnsureChatConnected", () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it("logs connection message when autoConnect is true", async () => {
    const { unmount } = renderHook(() =>
      useEnsureChatConnected({ autoConnect: true })
    );

    await waitFor(() => {
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "useEnsureChatConnected: WebSocketManager handles connection automatically"
      );
    }, { timeout: 100 });

    unmount();
  });

  it("does nothing when autoConnect is false", async () => {
    const { unmount } = renderHook(() =>
      useEnsureChatConnected({ autoConnect: false })
    );

    await waitFor(() => {
      expect(consoleLogSpy).not.toHaveBeenCalled();
    }, { timeout: 100 });

    unmount();
  });

  it("uses default options when not provided", async () => {
    const { unmount } = renderHook(() => useEnsureChatConnected());

    await waitFor(() => {
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "useEnsureChatConnected: WebSocketManager handles connection automatically"
      );
    }, { timeout: 100 });

    unmount();
  });

  it("handles disconnectOnUnmount option", async () => {
    const { unmount } = renderHook(() =>
      useEnsureChatConnected({ autoConnect: true, disconnectOnUnmount: true })
    );

    await waitFor(() => {
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "useEnsureChatConnected: WebSocketManager handles connection automatically"
      );
    }, { timeout: 100 });

    expect(() => unmount()).not.toThrow();
  });

  it("handles multiple renders", async () => {
    const { rerender, unmount } = renderHook(
      (props) => useEnsureChatConnected(props),
      { initialProps: { autoConnect: true } as { autoConnect?: boolean } }
    );

    await waitFor(() => {
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    }, { timeout: 100 });

    rerender({ autoConnect: false });

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);

    rerender({ autoConnect: true });

    await waitFor(() => {
      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
    }, { timeout: 100 });

    unmount();
  });

  it("handles disconnectOnUnmount false", async () => {
    const { unmount } = renderHook(() =>
      useEnsureChatConnected({ autoConnect: true, disconnectOnUnmount: false })
    );

    await waitFor(() => {
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "useEnsureChatConnected: WebSocketManager handles connection automatically"
      );
    }, { timeout: 100 });

    expect(() => unmount()).not.toThrow();
  });
});
