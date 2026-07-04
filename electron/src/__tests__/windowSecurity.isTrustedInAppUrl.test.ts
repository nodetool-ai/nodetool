import { isTrustedInAppUrl } from "../windowSecurity";
import { serverState } from "../state";

jest.mock("../logger", () => ({
  logMessage: jest.fn(),
}));

jest.mock("../devMode", () => ({
  isElectronDevMode: jest.fn(() => false),
  getWebDevServerUrl: jest.fn(() => "http://127.0.0.1:3000"),
}));

const { isElectronDevMode, getWebDevServerUrl } =
  jest.requireMock("../devMode") as {
    isElectronDevMode: jest.Mock;
    getWebDevServerUrl: jest.Mock;
  };

describe("isTrustedInAppUrl", () => {
  beforeEach(() => {
    serverState.serverPort = 7777;
    isElectronDevMode.mockReturnValue(false);
    getWebDevServerUrl.mockReturnValue("http://127.0.0.1:3000");
  });

  describe("empty and blank URLs", () => {
    it("returns true for empty string", () => {
      expect(isTrustedInAppUrl("")).toBe(true);
    });

    it("returns true for about:blank", () => {
      expect(isTrustedInAppUrl("about:blank")).toBe(true);
    });
  });

  describe("invalid URLs", () => {
    it("returns false for unparseable string", () => {
      expect(isTrustedInAppUrl("not a url at all")).toBe(false);
    });

    it("returns false for bare hostname without scheme", () => {
      expect(isTrustedInAppUrl("localhost:7777")).toBe(false);
    });

    it("returns false for string with only spaces", () => {
      expect(isTrustedInAppUrl("   ")).toBe(false);
    });
  });

  describe("file: and data: protocols", () => {
    it("returns true for file:// URL", () => {
      expect(isTrustedInAppUrl("file:///path/to/index.html")).toBe(true);
    });

    it("returns true for file:// URL with Windows-style path", () => {
      expect(isTrustedInAppUrl("file:///C:/Users/app/index.html")).toBe(true);
    });

    it("returns true for data: URL", () => {
      expect(isTrustedInAppUrl("data:text/html,<h1>Loading</h1>")).toBe(true);
    });

    it("returns true for data: URL with base64 content", () => {
      expect(
        isTrustedInAppUrl("data:text/html;base64,PGgxPkxvYWRpbmc8L2gxPg==")
      ).toBe(true);
    });
  });

  describe("non-http protocols", () => {
    it("returns false for ftp:// on localhost", () => {
      expect(isTrustedInAppUrl("ftp://localhost:7777")).toBe(false);
    });

    it("returns false for https:// on localhost", () => {
      expect(isTrustedInAppUrl("https://localhost:7777")).toBe(false);
    });

    it("returns false for https:// on 127.0.0.1", () => {
      expect(isTrustedInAppUrl("https://127.0.0.1:7777/api")).toBe(false);
    });

    it("returns false for javascript: protocol", () => {
      expect(isTrustedInAppUrl("javascript:alert(1)")).toBe(false);
    });
  });

  describe("localhost with backend port", () => {
    it("returns true for http://127.0.0.1:7777 with path", () => {
      expect(isTrustedInAppUrl("http://127.0.0.1:7777/api/foo")).toBe(true);
    });

    it("returns true for http://localhost:7777", () => {
      expect(isTrustedInAppUrl("http://localhost:7777")).toBe(true);
    });

    it("returns true for http://localhost:7777 with query string", () => {
      expect(isTrustedInAppUrl("http://localhost:7777/path?key=val")).toBe(
        true
      );
    });
  });

  describe("non-localhost hosts", () => {
    it("returns false for external host on backend port", () => {
      expect(isTrustedInAppUrl("http://external.com:7777")).toBe(false);
    });

    it("returns false for external IP on backend port", () => {
      expect(isTrustedInAppUrl("http://192.168.1.1:7777/api")).toBe(false);
    });

    it("returns false for 0.0.0.0 on backend port", () => {
      expect(isTrustedInAppUrl("http://0.0.0.0:7777/")).toBe(false);
    });
  });

  describe("wrong port", () => {
    it("returns false for localhost on non-matching port", () => {
      expect(isTrustedInAppUrl("http://127.0.0.1:9999")).toBe(false);
    });

    it("returns false for localhost on port 80 (implicit)", () => {
      expect(isTrustedInAppUrl("http://127.0.0.1/path")).toBe(false);
    });
  });

  describe("custom server port", () => {
    it("returns true when serverPort is set to 8080 and URL matches", () => {
      serverState.serverPort = 8080;
      expect(isTrustedInAppUrl("http://127.0.0.1:8080/api")).toBe(true);
    });

    it("returns false for default port 7777 when serverPort changed", () => {
      serverState.serverPort = 8080;
      expect(isTrustedInAppUrl("http://127.0.0.1:7777/api")).toBe(false);
    });
  });

  describe("dev mode with Vite dev server", () => {
    it("returns true for Vite dev server port in dev mode", () => {
      isElectronDevMode.mockReturnValue(true);
      getWebDevServerUrl.mockReturnValue("http://127.0.0.1:3000");
      expect(isTrustedInAppUrl("http://127.0.0.1:3000/")).toBe(true);
    });

    it("returns true for custom Vite dev server port in dev mode", () => {
      isElectronDevMode.mockReturnValue(true);
      getWebDevServerUrl.mockReturnValue("http://127.0.0.1:5173");
      expect(isTrustedInAppUrl("http://127.0.0.1:5173/")).toBe(true);
    });

    it("returns false for Vite dev server port when NOT in dev mode", () => {
      isElectronDevMode.mockReturnValue(false);
      expect(isTrustedInAppUrl("http://127.0.0.1:3000/")).toBe(false);
    });

    it("returns false for non-matching port even in dev mode", () => {
      isElectronDevMode.mockReturnValue(true);
      getWebDevServerUrl.mockReturnValue("http://127.0.0.1:3000");
      expect(isTrustedInAppUrl("http://127.0.0.1:4000/")).toBe(false);
    });

    it("returns true for backend port regardless of dev mode", () => {
      isElectronDevMode.mockReturnValue(true);
      expect(isTrustedInAppUrl("http://127.0.0.1:7777/api")).toBe(true);
    });

    it("handles invalid getWebDevServerUrl gracefully in dev mode", () => {
      isElectronDevMode.mockReturnValue(true);
      getWebDevServerUrl.mockReturnValue("not-a-valid-url");
      expect(isTrustedInAppUrl("http://127.0.0.1:3000/")).toBe(false);
    });
  });
});
