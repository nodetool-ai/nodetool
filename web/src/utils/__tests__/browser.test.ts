import { getIsElectronDetails, isElectron, ElectronDetectionDetails } from "../browser";

describe("getIsElectronDetails", () => {
  const originalUserAgent = navigator.userAgent;
  const originalWindow = global.window;
  const originalProcess = global.process;

  interface ExtendedWindow {
    api?: unknown;
    process?: {
      type?: string;
      versions?: {
        electron?: string;
      };
    };
  }

  beforeEach(() => {
    jest.resetModules();
    delete (window as any).process;
    delete (window as any).api;
    Object.defineProperty(Object.getPrototypeOf(navigator), "userAgent", {
      value: originalUserAgent,
      configurable: true,
      writable: true
    });
  });

  afterEach(() => {
    delete (window as any).process;
    delete (window as any).api;
    Object.defineProperty(Object.getPrototypeOf(navigator), "userAgent", {
      value: originalUserAgent,
      configurable: true,
      writable: true
    });
    jest.restoreAllMocks();
  });

  it("returns all false when no electron signals are present", () => {
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

  it("returns combined isElectron as true when bridge is present", () => {
    (window as any).api = {};
    (window as any).process = { type: "renderer", versions: { electron: "28.0.0" } };
    Object.defineProperty(Object.getPrototypeOf(navigator), "userAgent", {
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Electron/28.0.0",
      configurable: true,
      writable: true
    });
    
    const details = getIsElectronDetails();
    
    expect(details.isElectron).toBe(true);
    expect(details.isRendererProcess).toBe(true);
    expect(details.hasElectronVersionInWindowProcess).toBe(true);
    expect(details.hasElectronInUserAgent).toBe(true);
    expect(details.hasElectronBridge).toBe(true);
  });

  it("handles missing process.versions gracefully", () => {
    (window as any).process = {};
    const details = getIsElectronDetails();
    expect(details.hasElectronVersionInWindowProcess).toBe(false);
  });

  it("handles process without type gracefully", () => {
    (window as any).process = { versions: { electron: "28.0.0" } };
    const details = getIsElectronDetails();
    expect(details.isRendererProcess).toBe(false);
    expect(details.hasElectronVersionInWindowProcess).toBe(true);
  });

  it("handles user agent without Electron gracefully", () => {
    Object.defineProperty(Object.getPrototypeOf(navigator), "userAgent", {
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      configurable: true,
      writable: true
    });
    const details = getIsElectronDetails();
    expect(details.hasElectronInUserAgent).toBe(false);
  });

  it("returns correct interface structure", () => {
    const details = getIsElectronDetails();
    expect(details).toHaveProperty("isElectron");
    expect(details).toHaveProperty("isRendererProcess");
    expect(details).toHaveProperty("hasElectronVersionInWindowProcess");
    expect(details).toHaveProperty("hasElectronInUserAgent");
    expect(details).toHaveProperty("hasElectronBridge");
    expect(typeof details.isElectron).toBe("boolean");
    expect(typeof details.isRendererProcess).toBe("boolean");
  });

  it("prioritizes window.api bridge over other signals for isElectron", () => {
    (window as any).process = { type: "renderer" };
    Object.defineProperty(Object.getPrototypeOf(navigator), "userAgent", {
      value: "MyApp Chrome/120.0.0.0",
      configurable: true,
      writable: true
    });
    
    let details = getIsElectronDetails();
    expect(details.isElectron).toBe(false);
    
    (window as any).api = {};
    details = getIsElectronDetails();
    expect(details.isElectron).toBe(true);
  });
});

describe("isElectron constant", () => {
  const originalWindow = global.window;

  interface ExtendedWindow {
    api?: unknown;
  }

  beforeEach(() => {
    delete (window as any).api;
  });

  afterEach(() => {
    global.window = originalWindow;
    jest.resetModules();
  });

  it("is defined as a constant", () => {
    expect(isElectron).toBeDefined();
  });

  it("reflects the current environment state when window.api is not present", () => {
    delete (window as any).api;
    jest.resetModules();
    const { isElectron: checkIsElectron } = require("../browser");
    expect(checkIsElectron).toBe(false);
  });

  it("reflects the current environment state when window.api is present", () => {
    (window as any).api = {};
    jest.resetModules();
    const { isElectron: checkIsElectron } = require("../browser");
    expect(checkIsElectron).toBe(true);
  });
});
