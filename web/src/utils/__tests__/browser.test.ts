import { getIsElectronDetails, ElectronDetectionDetails } from "../browser";

describe("browser", () => {
  describe("getIsElectronDetails", () => {
    let originalWindow: typeof window;
    let originalNavigator: typeof navigator;
    let originalProcess: typeof process;

    beforeEach(() => {
      originalWindow = global.window;
      originalNavigator = global.navigator;
      originalProcess = global.process;
    });

    afterEach(() => {
      global.window = originalWindow;
      global.navigator = originalNavigator;
      global.process = originalProcess;
    });

    it("returns false for isElectron when no window", () => {
      delete (global as any).window;
      const result = getIsElectronDetails();
      expect(result.isElectron).toBe(false);
    });

    it("returns true for hasElectronBridge when window.api exists", () => {
      (global as any).window = { api: {} };
      const result = getIsElectronDetails();
      expect(result.hasElectronBridge).toBe(true);
    });

    it("returns false for hasElectronBridge when window.api is undefined", () => {
      (global as any).window = {};
      const result = getIsElectronDetails();
      expect(result.hasElectronBridge).toBe(false);
    });

    it("detects renderer process", () => {
      (global as any).window = { process: { type: "renderer" } };
      const result = getIsElectronDetails();
      expect(result.isRendererProcess).toBe(true);
    });

    it("does not detect renderer process when type is not renderer", () => {
      (global as any).window = { process: { type: "browser" } };
      const result = getIsElectronDetails();
      expect(result.isRendererProcess).toBe(false);
    });

    it("detects electron version in process.versions", () => {
      (global as any).window = { process: { versions: { electron: "28.0.0" } } };
      const result = getIsElectronDetails();
      expect(result.hasElectronVersionInWindowProcess).toBe(true);
    });

    it("does not detect electron version when not present", () => {
      (global as any).window = { process: { versions: { chrome: "120.0.0" } } };
      const result = getIsElectronDetails();
      expect(result.hasElectronVersionInWindowProcess).toBe(false);
    });

    it("detects Electron in user agent", () => {
      const originalGlobalNavigator = global.navigator;
      const mockNavigator = {
        get userAgent() { return "Mozilla/5.0 Electron/28.0.0"; }
      };
      Object.defineProperty(global, 'navigator', {
        value: mockNavigator,
        writable: true
      });
      const result = getIsElectronDetails();
      Object.defineProperty(global, 'navigator', {
        value: originalGlobalNavigator,
        writable: true
      });
      expect(result.hasElectronInUserAgent).toBe(true);
    });

    it("does not detect Electron in user agent when not present", () => {
      const originalGlobalNavigator = global.navigator;
      const mockNavigator = {
        get userAgent() { return "Mozilla/5.0 Chrome/120.0.0"; }
      };
      Object.defineProperty(global, 'navigator', {
        value: mockNavigator,
        writable: true
      });
      const result = getIsElectronDetails();
      Object.defineProperty(global, 'navigator', {
        value: originalGlobalNavigator,
        writable: true
      });
      expect(result.hasElectronInUserAgent).toBe(false);
    });

    it("returns all boolean properties", () => {
      const result = getIsElectronDetails();
      expect(typeof result.isElectron).toBe("boolean");
      expect(typeof result.isRendererProcess).toBe("boolean");
      expect(typeof result.hasElectronVersionInWindowProcess).toBe("boolean");
      expect(typeof result.hasElectronInUserAgent).toBe("boolean");
      expect(typeof result.hasElectronBridge).toBe("boolean");
    });

    it("returns ElectronDetectionDetails interface structure", () => {
      const result: ElectronDetectionDetails = getIsElectronDetails();
      expect(result).toHaveProperty("isElectron");
      expect(result).toHaveProperty("isRendererProcess");
      expect(result).toHaveProperty("hasElectronVersionInWindowProcess");
      expect(result).toHaveProperty("hasElectronInUserAgent");
      expect(result).toHaveProperty("hasElectronBridge");
    });
  });
});
