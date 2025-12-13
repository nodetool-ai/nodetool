import { getIsElectronDetails } from "../browser";

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
    // isElectron is only true when window.api is present (the primary check)
    expect(details.isElectron).toBe(false);
    expect(details.isRendererProcess).toBe(true);
  });

  it("detects electron version in process", () => {
    (window as any).process = { versions: { electron: "1.0.0" } };
    const details = getIsElectronDetails();
    // isElectron is only true when window.api is present (the primary check)
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
    // isElectron is only true when window.api is present (the primary check)
    expect(details.isElectron).toBe(false);
    expect(details.hasElectronInUserAgent).toBe(true);
  });

  it("detects electron bridge via window.api", () => {
    (window as any).api = {};
    const details = getIsElectronDetails();
    expect(details.isElectron).toBe(true);
    expect(details.hasElectronBridge).toBe(true);
  });
});
