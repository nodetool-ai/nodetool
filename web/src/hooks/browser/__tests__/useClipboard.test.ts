import { renderHook, act } from "@testing-library/react";
import { useClipboard } from "../useClipboard";


jest.mock("../../../utils/clipboardUtils", () => ({
  copyAssetToClipboard: jest.fn()
}));

const mockSessionState: Record<string, any> = {
  clipboardData: null,
  isClipboardValid: false,
  setClipboardData: jest.fn(),
  setIsClipboardValid: jest.fn()
};

jest.mock("../../../stores/SessionStateStore", () => {
  const store: any = (selector: any) => selector(mockSessionState);
  store.getState = () => mockSessionState;
  return { __esModule: true, default: store };
});

const validClipboardData = JSON.stringify({
  nodes: [{ id: "1", type: "test" }],
  edges: []
});

const invalidClipboardData = JSON.stringify({
  nodes: [],
  edges: []
});

describe("useClipboard", () => {
  let originalNavigator: any;
  let originalWindow: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSessionState.clipboardData = null;
    mockSessionState.isClipboardValid = false;

    originalNavigator = { ...navigator };
    originalWindow = { ...window };

    Object.defineProperty(navigator, "clipboard", {
      value: {
        readText: jest.fn().mockResolvedValue(""),
        writeText: jest.fn().mockResolvedValue(undefined)
      },
      writable: true,
      configurable: true
    });

    Object.defineProperty(document, "hasFocus", {
      value: () => true,
      configurable: true
    });

    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 Chrome/120.0.0.0",
      configurable: true
    });

    delete (window as any).api;
  });

  it("returns clipboard functions and state", () => {
    const { result } = renderHook(() => useClipboard());

    expect(typeof result.current.readClipboard).toBe("function");
    expect(typeof result.current.writeClipboard).toBe("function");
    expect(result.current.clipboardData).toBeNull();
  });

  describe("readClipboard", () => {
    it("reads from navigator.clipboard and validates", async () => {
      (navigator.clipboard.readText as jest.Mock).mockResolvedValue(
        validClipboardData
      );

      const { result } = renderHook(() => useClipboard());

      let readResult: { data: string | null; isValid: boolean };
      await act(async () => {
        readResult = await result.current.readClipboard();
      });

      expect(readResult!.isValid).toBe(true);
      expect(readResult!.data).toBe(validClipboardData);
      expect(mockSessionState.setIsClipboardValid).toHaveBeenCalledWith(true);
      expect(mockSessionState.setClipboardData).toHaveBeenCalledWith(
        validClipboardData
      );
    });

    it("returns invalid for non-node clipboard data", async () => {
      (navigator.clipboard.readText as jest.Mock).mockResolvedValue(
        "just some text"
      );

      const { result } = renderHook(() => useClipboard());

      let readResult: { data: string | null; isValid: boolean };
      await act(async () => {
        readResult = await result.current.readClipboard();
      });

      expect(readResult!.isValid).toBe(false);
      expect(readResult!.data).toBeNull();
    });

    it("returns invalid when nodes array is empty", async () => {
      (navigator.clipboard.readText as jest.Mock).mockResolvedValue(
        invalidClipboardData
      );

      const { result } = renderHook(() => useClipboard());

      let readResult: { data: string | null; isValid: boolean };
      await act(async () => {
        readResult = await result.current.readClipboard();
      });

      expect(readResult!.isValid).toBe(false);
    });
  });

  describe("writeClipboard", () => {
    it("writes valid data to clipboard", async () => {
      const { result } = renderHook(() => useClipboard());

      await act(async () => {
        await result.current.writeClipboard(validClipboardData);
      });

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        validClipboardData
      );
      expect(mockSessionState.setIsClipboardValid).toHaveBeenCalledWith(true);
      expect(mockSessionState.setClipboardData).toHaveBeenCalledWith(
        validClipboardData
      );
    });

    it("does not write invalid data to clipboard", async () => {
      const { result } = renderHook(() => useClipboard());

      await act(async () => {
        await result.current.writeClipboard("not valid json");
      });

      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
      expect(mockSessionState.setIsClipboardValid).toHaveBeenCalledWith(false);
    });

    it("writes arbitrary data when allowArbitrary is true", async () => {
      const { result } = renderHook(() => useClipboard());

      await act(async () => {
        await result.current.writeClipboard("arbitrary text", true);
      });

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "arbitrary text"
      );
      expect(mockSessionState.setIsClipboardValid).toHaveBeenCalledWith(true);
    });

    it("formats JSON when formatJson is true", async () => {
      const { result } = renderHook(() => useClipboard());

      const compact = JSON.stringify({ nodes: [{ id: "1" }], edges: [] });

      await act(async () => {
        await result.current.writeClipboard(compact, true, true);
      });

      const written = (navigator.clipboard.writeText as jest.Mock).mock
        .calls[0][0];
      expect(written).toBe(JSON.stringify(JSON.parse(compact), null, 2));
    });

    it("prefers Electron clipboard API when available", async () => {
      const mockElectronWrite = jest.fn().mockResolvedValue(undefined);
      (window as any).api = {
        clipboard: {
          writeText: mockElectronWrite,
          readText: jest.fn()
        }
      };

      const { result } = renderHook(() => useClipboard());

      await act(async () => {
        await result.current.writeClipboard(validClipboardData);
      });

      expect(mockElectronWrite).toHaveBeenCalledWith(validClipboardData);
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    });
  });
});
