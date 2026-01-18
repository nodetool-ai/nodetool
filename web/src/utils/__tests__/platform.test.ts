describe("platform", () => {
  const originalNavigator = global.navigator;

  beforeEach(() => {
    Object.defineProperty(global, "navigator", {
      value: {
        userAgent: "",
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(global, "navigator", {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it("returns false when navigator is undefined", () => {
    Object.defineProperty(global, "navigator", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    const { isMac } = require("../platform");
    expect(isMac()).toBe(false);
  });

  it("returns true when userAgent contains Mac", () => {
    Object.defineProperty(global, "navigator", {
      value: {
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      writable: true,
      configurable: true,
    });
    const { isMac } = require("../platform");
    expect(isMac()).toBe(true);
  });

  it("returns false when userAgent does not contain Mac", () => {
    Object.defineProperty(global, "navigator", {
      value: {
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      writable: true,
      configurable: true,
    });
    const { isMac } = require("../platform");
    expect(isMac()).toBe(false);
  });

  it("returns false when userAgent is Linux", () => {
    Object.defineProperty(global, "navigator", {
      value: {
        userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
      },
      writable: true,
      configurable: true,
    });
    const { isMac } = require("../platform");
    expect(isMac()).toBe(false);
  });

  it("returns true for iPad userAgent", () => {
    Object.defineProperty(global, "navigator", {
      value: {
        userAgent: "Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X)",
      },
      writable: true,
      configurable: true,
    });
    const { isMac } = require("../platform");
    expect(isMac()).toBe(true);
  });

  it("returns true for iPhone userAgent", () => {
    Object.defineProperty(global, "navigator", {
      value: {
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)",
      },
      writable: true,
      configurable: true,
    });
    const { isMac } = require("../platform");
    expect(isMac()).toBe(true);
  });

  it("is case-insensitive for Mac substring", () => {
    Object.defineProperty(global, "navigator", {
      value: {
        userAgent: "mozilla/5.0 (macintosh; intel mac os x 10_15_7)",
      },
      writable: true,
      configurable: true,
    });
    const { isMac } = require("../platform");
    expect(isMac()).toBe(true);
  });
});
