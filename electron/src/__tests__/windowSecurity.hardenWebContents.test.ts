import { shell } from "electron";
import { hardenWebContents } from "../windowSecurity";
import { serverState } from "../state";

jest.mock("../devMode", () => ({
  isElectronDevMode: jest.fn(() => false),
  getWebDevServerUrl: jest.fn(() => "http://127.0.0.1:3000"),
}));

type EventHandler = (event: { preventDefault: jest.Mock }, url: string) => void;
type WebviewHandler = (event: { preventDefault: jest.Mock }) => void;

function createMockWebContents() {
  const handlers: Record<string, EventHandler | WebviewHandler> = {};
  let windowOpenHandler: ((details: { url: string }) => { action: string }) | null = null;

  return {
    on: jest.fn((event: string, handler: EventHandler | WebviewHandler) => {
      handlers[event] = handler;
    }),
    setWindowOpenHandler: jest.fn(
      (handler: (details: { url: string }) => { action: string }) => {
        windowOpenHandler = handler;
      }
    ),
    _emit(event: string, url?: string) {
      const ev = { preventDefault: jest.fn() };
      const handler = handlers[event];
      if (url !== undefined) {
        (handler as EventHandler)(ev, url);
      } else {
        (handler as WebviewHandler)(ev);
      }
      return ev;
    },
    _openWindow(url: string) {
      return windowOpenHandler?.({ url });
    },
  };
}

describe("hardenWebContents", () => {
  let mock: ReturnType<typeof createMockWebContents>;

  beforeEach(() => {
    serverState.serverPort = 7777;
    jest.clearAllMocks();
    mock = createMockWebContents();
    hardenWebContents(mock as unknown as Electron.WebContents);
  });

  it("registers all expected event handlers", () => {
    expect(mock.on).toHaveBeenCalledWith("will-navigate", expect.any(Function));
    expect(mock.on).toHaveBeenCalledWith("will-redirect", expect.any(Function));
    expect(mock.on).toHaveBeenCalledWith("will-attach-webview", expect.any(Function));
    expect(mock.setWindowOpenHandler).toHaveBeenCalledWith(expect.any(Function));
  });

  describe("will-navigate", () => {
    it("allows trusted URLs", () => {
      const ev = mock._emit("will-navigate", "http://127.0.0.1:7777/api");
      expect(ev.preventDefault).not.toHaveBeenCalled();
    });

    it("blocks untrusted URLs", () => {
      const ev = mock._emit("will-navigate", "https://evil.com/steal");
      expect(ev.preventDefault).toHaveBeenCalled();
    });
  });

  describe("will-redirect", () => {
    it("allows trusted URLs", () => {
      const ev = mock._emit("will-redirect", "http://127.0.0.1:7777/health");
      expect(ev.preventDefault).not.toHaveBeenCalled();
    });

    it("blocks untrusted URLs", () => {
      const ev = mock._emit("will-redirect", "http://malicious.site:7777/");
      expect(ev.preventDefault).toHaveBeenCalled();
    });
  });

  describe("setWindowOpenHandler", () => {
    it("opens http URLs in the OS browser and denies the popup", () => {
      const result = mock._openWindow("https://example.com");
      expect(shell.openExternal).toHaveBeenCalledWith("https://example.com");
      expect(result).toEqual({ action: "deny" });
    });

    it("opens plain http URLs in the OS browser", () => {
      const result = mock._openWindow("http://docs.example.com/page");
      expect(shell.openExternal).toHaveBeenCalledWith("http://docs.example.com/page");
      expect(result).toEqual({ action: "deny" });
    });

    it("blocks non-http protocols without opening externally", () => {
      const result = mock._openWindow("javascript:alert(1)");
      expect(shell.openExternal).not.toHaveBeenCalled();
      expect(result).toEqual({ action: "deny" });
    });

    it("blocks malformed URLs without opening externally", () => {
      const result = mock._openWindow("not a url");
      expect(shell.openExternal).not.toHaveBeenCalled();
      expect(result).toEqual({ action: "deny" });
    });
  });

  describe("will-attach-webview", () => {
    it("blocks webview attachment", () => {
      const ev = mock._emit("will-attach-webview");
      expect(ev.preventDefault).toHaveBeenCalled();
    });
  });
});
