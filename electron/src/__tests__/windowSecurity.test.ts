import { isTrustedInAppUrl } from "../windowSecurity";
import { serverState } from "../state";

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

  describe("always trusted URLs", () => {
    it("trusts empty string", () => {
      expect(isTrustedInAppUrl("")).toBe(true);
    });

    it("trusts about:blank", () => {
      expect(isTrustedInAppUrl("about:blank")).toBe(true);
    });

    it("trusts file:// protocol", () => {
      expect(isTrustedInAppUrl("file:///app/index.html")).toBe(true);
    });

    it("trusts data: protocol", () => {
      expect(isTrustedInAppUrl("data:text/html,<h1>Loading</h1>")).toBe(true);
    });
  });

  describe("backend server URLs", () => {
    it("trusts backend on default port 7777", () => {
      expect(isTrustedInAppUrl("http://127.0.0.1:7777/api/foo")).toBe(true);
    });

    it("trusts backend on localhost", () => {
      expect(isTrustedInAppUrl("http://localhost:7777/api/foo")).toBe(true);
    });

    it("trusts backend on custom port", () => {
      serverState.serverPort = 9000;
      expect(isTrustedInAppUrl("http://127.0.0.1:9000/health")).toBe(true);
    });

    it("rejects localhost on wrong port", () => {
      expect(isTrustedInAppUrl("http://127.0.0.1:8080/api/foo")).toBe(false);
    });
  });

  describe("external URLs", () => {
    it("rejects external HTTP URLs", () => {
      expect(isTrustedInAppUrl("http://evil.com:7777/steal")).toBe(false);
    });

    it("rejects HTTPS URLs", () => {
      expect(isTrustedInAppUrl("https://127.0.0.1:7777/api")).toBe(false);
    });

    it("rejects javascript: protocol", () => {
      expect(isTrustedInAppUrl("javascript:alert(1)")).toBe(false);
    });

    it("rejects malformed URLs", () => {
      expect(isTrustedInAppUrl("not a url at all")).toBe(false);
    });
  });

  describe("dev mode", () => {
    it("trusts Vite dev server port when in dev mode", () => {
      isElectronDevMode.mockReturnValue(true);
      getWebDevServerUrl.mockReturnValue("http://127.0.0.1:3000");
      expect(isTrustedInAppUrl("http://127.0.0.1:3000/")).toBe(true);
    });

    it("rejects Vite dev server port when NOT in dev mode", () => {
      isElectronDevMode.mockReturnValue(false);
      expect(isTrustedInAppUrl("http://127.0.0.1:3000/")).toBe(false);
    });

    it("trusts custom Vite dev server URL", () => {
      isElectronDevMode.mockReturnValue(true);
      getWebDevServerUrl.mockReturnValue("http://127.0.0.1:5173");
      expect(isTrustedInAppUrl("http://127.0.0.1:5173/")).toBe(true);
    });
  });
});
