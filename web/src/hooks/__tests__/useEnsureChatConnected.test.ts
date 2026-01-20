import { renderHook } from "@testing-library/react";
import { useEnsureChatConnected } from "../useEnsureChatConnected";

describe("useEnsureChatConnected", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("logs message on mount with default options", () => {
    renderHook(() => useEnsureChatConnected());
    
    expect(console.log).toHaveBeenCalledWith(
      "useEnsureChatConnected: WebSocketManager handles connection automatically"
    );
  });

  it("logs message on mount with explicit autoConnect=true", () => {
    renderHook(() => useEnsureChatConnected({ autoConnect: true }));
    
    expect(console.log).toHaveBeenCalledWith(
      "useEnsureChatConnected: WebSocketManager handles connection automatically"
    );
  });

  it("does not log when autoConnect=false", () => {
    renderHook(() => useEnsureChatConnected({ autoConnect: false }));
    
    expect(console.log).not.toHaveBeenCalled();
  });

  it("does not log with empty options object", () => {
    renderHook(() => useEnsureChatConnected({}));
    
    expect(console.log).toHaveBeenCalledWith(
      "useEnsureChatConnected: WebSocketManager handles connection automatically"
    );
  });

  it("handles disconnectOnUnmount without error", () => {
    const { unmount } = renderHook(() => 
      useEnsureChatConnected({ autoConnect: true, disconnectOnUnmount: true })
    );
    
    expect(() => unmount()).not.toThrow();
  });
});
