import { getIsElectronDetails } from "../browser";
import { isMac } from "../platform";

describe("getIsElectronDetails", () => {
  const originalUserAgent = navigator.userAgent;

  afterEach(() => {
    delete (window as any).process;
    delete (window as any).api;
    Object.defineProperty(Object.getPrototypeOf(navigator), "userAgent", {
      value: originalUserAgent,
      configurable: true,
      writable: true
    });
  });

  it("returns false when no electron signals are present", () => {
    const details = getIsElectronDetails();
    expect(details).toEqual({
      isElectron: false,
      isRendererProcess: false,
      hasElectronVersionInWindowProcess: false,
      hasElectronInUserAgent: false,
      hasElectronBridge: false
    });
  });

  it("detects renderer process", () => {
    (window as any).process = { type: "renderer" };
    const details = getIsElectronDetails();
    expect(details.isElectron).toBe(false);
    expect(details.isRendererProcess).toBe(true);
  });

  it("detects electron version in process", () => {
    (window as any).process = { versions: { electron: "1.0.0" } };
    const details = getIsElectronDetails();
    expect(details.isElectron).toBe(false);
    expect(details.hasElectronVersionInWindowProcess).toBe(true);
  });

  it("detects electron user agent", () => {
    Object.defineProperty(Object.getPrototypeOf(navigator), "userAgent", {
      value: "MyApp Electron/22.0",
      configurable: true,
      writable: true
    });
    const details = getIsElectronDetails();
    expect(details.isElectron).toBe(false);
    expect(details.hasElectronInUserAgent).toBe(true);
  });

  it("detects electron bridge via window.api", () => {
    (window as any).api = {};
    const details = getIsElectronDetails();
    expect(details.isElectron).toBe(true);
    expect(details.hasElectronBridge).toBe(true);
  });

  it("prioritizes window.api over other signals", () => {
    (window as any).process = { type: "renderer", versions: { electron: "1.0.0" } };
    Object.defineProperty(Object.getPrototypeOf(navigator), "userAgent", {
      value: "Electron/1.0",
      configurable: true,
      writable: true
    });
    (window as any).api = {};
    const details = getIsElectronDetails();
    expect(details.isElectron).toBe(true);
    expect(details.isRendererProcess).toBe(true);
    expect(details.hasElectronVersionInWindowProcess).toBe(true);
    expect(details.hasElectronInUserAgent).toBe(true);
  });
});

describe("isMac", () => {
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

  it("returns false when userAgent is empty", () => {
    Object.defineProperty(Object.getPrototypeOf(navigator), "userAgent", {
      value: "",
      configurable: true,
      writable: true
    });
    expect(isMac()).toBe(false);
  });
});
