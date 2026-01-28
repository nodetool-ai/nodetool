import { isMac } from "../platform";

describe("platform utilities", () => {
  describe("isMac", () => {
    let originalUserAgent: string;

    beforeEach(() => {
      originalUserAgent = navigator.userAgent;
    });

    afterEach(() => {
      Object.defineProperty(navigator, "userAgent", {
        value: originalUserAgent,
        configurable: true
      });
    });

    it("returns true when userAgent contains Mac", () => {
      Object.defineProperty(navigator, "userAgent", {
        value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        configurable: true
      });

      expect(isMac()).toBe(true);
    });

    it("returns false when userAgent does not contain Mac", () => {
      Object.defineProperty(navigator, "userAgent", {
        value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        configurable: true
      });

      expect(isMac()).toBe(false);
    });

    it("returns false when userAgent contains macOS but not Mac", () => {
      Object.defineProperty(navigator, "userAgent", {
        value: "Mozilla/5.0 (MacIntel) AppleWebKit/537.36",
        configurable: true
      });

      expect(isMac()).toBe(true);
    });

    it("handles empty userAgent", () => {
      Object.defineProperty(navigator, "userAgent", {
        value: "",
        configurable: true
      });

      expect(isMac()).toBe(false);
    });
  });
});
