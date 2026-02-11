import { renderHook, cleanup } from "@testing-library/react";
import { useEnsureChatConnected } from "../useEnsureChatConnected";

describe("useEnsureChatConnected", () => {
  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
  });

  it("returns undefined", () => {
    const { result } = renderHook(() => useEnsureChatConnected());

    expect(result.current).toBeUndefined();
  });

  it("accepts autoConnect option without error", () => {
    expect(() => {
      renderHook(() => useEnsureChatConnected({ autoConnect: false }));
    }).not.toThrow();
  });

  it("accepts disconnectOnUnmount option without error", () => {
    expect(() => {
      const { unmount } = renderHook(() =>
        useEnsureChatConnected({ disconnectOnUnmount: true })
      );
      unmount();
    }).not.toThrow();
  });

  it("accepts both options without error", () => {
    expect(() => {
      renderHook(() =>
        useEnsureChatConnected({ autoConnect: false, disconnectOnUnmount: false })
      );
    }).not.toThrow();
  });

  it("accepts default options without error", () => {
    expect(() => {
      renderHook(() => useEnsureChatConnected());
    }).not.toThrow();
  });
});
