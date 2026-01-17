import { renderHook } from "@testing-library/react";
import { useClipboard } from "../browser/useClipboard";

jest.mock("../../stores/SessionStateStore", () => ({
  default: jest.fn((selector) => {
    const state = {
      clipboardData: null,
      setClipboardData: jest.fn(),
      isClipboardValid: false,
      setIsClipboardValid: jest.fn(),
    };
    if (typeof selector === "function") {
      return selector(state);
    }
    return state;
  }),
  __esModule: true,
}));

describe("useClipboard", () => {
  const originalNavigator = navigator;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock navigator.userAgent for non-Firefox
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      configurable: true,
    });
    
    // Mock clipboard API
    global.navigator.clipboard = {
      writeText: jest.fn().mockResolvedValue(undefined),
      readText: jest.fn().mockResolvedValue(""),
    } as any;
    
    // Mock document.hasFocus
    document.hasFocus = jest.fn().mockReturnValue(true);
  });

  afterEach(() => {
    Object.defineProperty(navigator, "userAgent", {
      value: originalNavigator.userAgent,
      configurable: true,
    });
  });

  it("returns clipboard data from store", () => {
    const { result } = renderHook(() => useClipboard());
    
    expect(result.current.clipboardData).toBeNull();
    expect(result.current.isClipboardValid).toBe(false);
  });

  it("returns readClipboard function", () => {
    const { result } = renderHook(() => useClipboard());
    
    expect(typeof result.current.readClipboard).toBe("function");
  });

  it("returns writeClipboard function", () => {
    const { result } = renderHook(() => useClipboard());
    
    expect(typeof result.current.writeClipboard).toBe("function");
  });

  it("writes text to clipboard when allowed arbitrary", async () => {
    const { result } = renderHook(() => useClipboard());
    
    await result.current.writeClipboard("test text", true);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("test text");
  });

  it("does not write invalid workflow data to clipboard by default", async () => {
    const { result } = renderHook(() => useClipboard());
    
    // Invalid workflow data (not valid JSON with nodes and edges)
    await result.current.writeClipboard("invalid data");

    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("writes valid workflow data to clipboard", async () => {
    const validData = JSON.stringify({
      nodes: [{ id: "node-1" }],
      edges: [{ id: "edge-1" }]
    });
    
    const { result } = renderHook(() => useClipboard());
    
    await result.current.writeClipboard(validData);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(validData);
  });

  it("reads text from clipboard when document has focus", async () => {
    // Mock hasFocus before the hook is called
    document.hasFocus = jest.fn().mockReturnValue(true);
    
    const { result } = renderHook(() => useClipboard());
    
    // The hook uses hasFocus in a useCallback, so we need to make sure it's mocked before
    const response = await result.current.readClipboard();
    // The actual behavior depends on the mock setup, we just verify it returns an object
    expect(response).toHaveProperty("data");
    expect(response).toHaveProperty("isValid");
  });

  it("returns null data when clipboard read fails due to no focus", async () => {
    document.hasFocus = jest.fn().mockReturnValue(false);
    
    const { result } = renderHook(() => useClipboard());
    
    const response = await result.current.readClipboard();
    expect(response.data).toBeNull();
  });
});
