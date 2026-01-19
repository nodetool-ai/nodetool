import { isMac } from "../platform";

describe("platform", () => {
  const originalUserAgent = navigator.userAgent;

  afterEach(() => {
    Object.defineProperty(Object.getPrototypeOf(navigator), "userAgent", {
      value: originalUserAgent,
      configurable: true,
      writable: true
    });
  });

  it("returns true for Mac user agent", () => {
    Object.defineProperty(Object.getPrototypeOf(navigator), "userAgent", {
      value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      configurable: true,
      writable: true
    });
    expect(isMac()).toBe(true);
  });

  it("returns false for Windows user agent", () => {
    Object.defineProperty(Object.getPrototypeOf(navigator), "userAgent", {
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      configurable: true,
      writable: true
    });
    expect(isMac()).toBe(false);
  });

  it("returns false for Linux user agent", () => {
    Object.defineProperty(Object.getPrototypeOf(navigator), "userAgent", {
      value: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
      configurable: true,
      writable: true
    });
    expect(isMac()).toBe(false);
  });

  it("returns false when navigator is undefined", () => {
    const originalNavigator = global.navigator;
    try {
      (global as any).navigator = undefined;
      expect(isMac()).toBe(false);
    } finally {
      global.navigator = originalNavigator;
    }
  });
});
