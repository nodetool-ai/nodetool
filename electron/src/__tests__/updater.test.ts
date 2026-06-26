/**
 * @fileoverview Tests for the auto-updater module
 *
 * Tests the hardened auto-updater logic that:
 * - Skips auto-update in development mode
 * - Gracefully handles missing app-update.yml file
 * - Logs warnings instead of crashing
 * - Requires opt-in via settings (auto-updates are disabled by default)
 */

// Mock electron-updater module
const mockAutoUpdater = {
  setFeedURL: jest.fn(),
  checkForUpdates: jest.fn().mockResolvedValue(undefined),
  quitAndInstall: jest.fn(),
  on: jest.fn(),
  logger: null,
  channel: "latest",
  allowPrerelease: false,
  allowDowngrade: false,
};

jest.mock("electron-updater", () => ({
  autoUpdater: mockAutoUpdater,
}));

jest.mock("electron-log", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mock electron module
jest.mock("electron", () => ({
  app: {
    isPackaged: false,
    getPath: jest.fn().mockReturnValue("/mock/path"),
    getVersion: jest.fn().mockReturnValue("1.0.0"),
  },
}));

// Mock fs module to control file existence
const mockExistsSync = jest.fn().mockReturnValue(true);
jest.mock("fs", () => ({
  existsSync: mockExistsSync,
}));

// Mock the logger module
const mockLogMessage = jest.fn();
jest.mock("../logger", () => ({
  logMessage: mockLogMessage,
}));

// Mock state module
jest.mock("../state", () => ({
  getMainWindow: jest.fn().mockReturnValue(null),
}));

// Mock settings module to control auto-updates setting
const mockReadSettings = jest.fn().mockReturnValue({ autoUpdatesEnabled: true });
const mockReadSettingsAsync = jest.fn().mockResolvedValue({ autoUpdatesEnabled: true });
const mockGetUpdateChannel = jest.fn().mockReturnValue("latest");
jest.mock("../settings", () => ({
  readSettings: mockReadSettings,
  readSettingsAsync: mockReadSettingsAsync,
  getUpdateChannel: mockGetUpdateChannel,
}));

// Store original process.resourcesPath
const originalResourcesPath = process.resourcesPath;

describe("Auto-updater Module", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the mocks
    mockExistsSync.mockReturnValue(true);
    mockAutoUpdater.checkForUpdates.mockResolvedValue(undefined);
    mockAutoUpdater.channel = "latest";
    mockAutoUpdater.allowPrerelease = false;
    mockAutoUpdater.allowDowngrade = false;
    mockGetUpdateChannel.mockReturnValue("latest");
    // Default to auto-updates enabled for backward-compatible tests
    mockReadSettings.mockReturnValue({ autoUpdatesEnabled: true });
    mockReadSettingsAsync.mockResolvedValue({ autoUpdatesEnabled: true });
    // Set a mock resourcesPath
    Object.defineProperty(process, "resourcesPath", {
      value: "/mock/resources",
      configurable: true,
    });
  });

  afterAll(() => {
    // Restore original resourcesPath
    if (originalResourcesPath !== undefined) {
      Object.defineProperty(process, "resourcesPath", {
        value: originalResourcesPath,
        configurable: true,
      });
    }
  });

  describe("setupAutoUpdater", () => {
    it("should skip auto-updater in development mode", () => {
      // Import fresh module with isPackaged = false
      jest.isolateModules(() => {
        jest.doMock("electron", () => ({
          app: { isPackaged: false },
        }));
        const { setupAutoUpdater } = require("../updater");
        setupAutoUpdater();
      });

      expect(mockLogMessage).toHaveBeenCalledWith(
        "Skipping auto-updater in development mode"
      );
    });

    it("should skip auto-updater when auto-updates are not enabled (opt-in required)", async () => {
      // Auto-updates not enabled (default opt-in behavior)
      mockReadSettingsAsync.mockResolvedValue({ autoUpdatesEnabled: false });
      mockExistsSync.mockReturnValue(true);

      let setupAutoUpdater: (() => Promise<void>) | undefined;
      jest.isolateModules(() => {
        jest.doMock("electron", () => ({
          app: { isPackaged: true, getVersion: jest.fn().mockReturnValue("1.0.0") },
        }));
        jest.doMock("../settings", () => ({
          readSettings: mockReadSettings,
          readSettingsAsync: mockReadSettingsAsync,
          getUpdateChannel: mockGetUpdateChannel,
        }));
        const updater = require("../updater");
        setupAutoUpdater = updater.setupAutoUpdater;
      });

      if (setupAutoUpdater) {
        await setupAutoUpdater();
      }

      expect(mockLogMessage).toHaveBeenCalledWith(
        "Auto-updates disabled by user preference (opt-in required)"
      );
      // Should NOT call setFeedURL
      expect(mockAutoUpdater.setFeedURL).not.toHaveBeenCalled();
    });

    it("should skip auto-updater when setting is not set (opt-in defaults to false)", async () => {
      // No autoUpdatesEnabled setting (should default to disabled)
      mockReadSettingsAsync.mockResolvedValue({});
      mockExistsSync.mockReturnValue(true);

      let setupAutoUpdater: (() => Promise<void>) | undefined;
      jest.isolateModules(() => {
        jest.doMock("electron", () => ({
          app: { isPackaged: true, getVersion: jest.fn().mockReturnValue("1.0.0") },
        }));
        jest.doMock("../settings", () => ({
          readSettings: mockReadSettings,
          readSettingsAsync: mockReadSettingsAsync,
          getUpdateChannel: mockGetUpdateChannel,
        }));
        const updater = require("../updater");
        setupAutoUpdater = updater.setupAutoUpdater;
      });

      if (setupAutoUpdater) {
        await setupAutoUpdater();
      }

      expect(mockLogMessage).toHaveBeenCalledWith(
        "Auto-updates disabled by user preference (opt-in required)"
      );
      // Should NOT call setFeedURL
      expect(mockAutoUpdater.setFeedURL).not.toHaveBeenCalled();
    });

    it("should disable auto-updater when app-update.yml is missing", async () => {
      mockExistsSync.mockReturnValue(false);
      mockReadSettingsAsync.mockResolvedValue({ autoUpdatesEnabled: true });

      let setupAutoUpdater: (() => Promise<void>) | undefined;
      jest.isolateModules(() => {
        jest.doMock("electron", () => ({
          app: { isPackaged: true, getVersion: jest.fn().mockReturnValue("1.0.0") },
        }));
        jest.doMock("../settings", () => ({
          readSettings: mockReadSettings,
          readSettingsAsync: mockReadSettingsAsync,
          getUpdateChannel: mockGetUpdateChannel,
        }));
        const updater = require("../updater");
        setupAutoUpdater = updater.setupAutoUpdater;
      });

      if (setupAutoUpdater) {
        await setupAutoUpdater();
      }

      // Should log warning about missing config file
      expect(mockLogMessage).toHaveBeenCalledWith(
        expect.stringContaining("app-update.yml not found"),
        "warn"
      );

      // Should log the disabled message
      expect(mockLogMessage).toHaveBeenCalledWith(
        expect.stringContaining("Auto-update disabled"),
        "warn"
      );

      // Should NOT call setFeedURL
      expect(mockAutoUpdater.setFeedURL).not.toHaveBeenCalled();
    });

    it("should set up auto-updater when app is packaged, config exists, and auto-updates are enabled", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadSettingsAsync.mockResolvedValue({ autoUpdatesEnabled: true });
      mockGetUpdateChannel.mockReturnValue("latest");

      let setupAutoUpdater: (() => Promise<void>) | undefined;
      jest.isolateModules(() => {
        jest.doMock("electron", () => ({
          app: { isPackaged: true, getVersion: jest.fn().mockReturnValue("1.0.0") },
        }));
        jest.doMock("../settings", () => ({
          readSettings: mockReadSettings,
          readSettingsAsync: mockReadSettingsAsync,
          getUpdateChannel: mockGetUpdateChannel,
        }));
        const updater = require("../updater");
        setupAutoUpdater = updater.setupAutoUpdater;
      });

      if (setupAutoUpdater) {
        await setupAutoUpdater();
      }

      expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith({
        provider: "github",
        owner: "nodetool-ai",
        repo: "nodetool",
        updaterCacheDirName: "nodetool-updater",
      });
      expect(mockAutoUpdater.channel).toBe("latest");
      expect(mockAutoUpdater.allowPrerelease).toBe(false);
      expect(mockAutoUpdater.allowDowngrade).toBe(true);
      expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled();
    });

    it("should configure nightly updater channel to allow prerelease updates", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadSettingsAsync.mockResolvedValue({ autoUpdatesEnabled: true });
      mockGetUpdateChannel.mockReturnValue("nightly");

      let setupAutoUpdater: (() => Promise<void>) | undefined;
      jest.isolateModules(() => {
        jest.doMock("electron", () => ({
          app: { isPackaged: true, getVersion: jest.fn().mockReturnValue("1.0.0-nightly.20260509.1") },
        }));
        jest.doMock("../settings", () => ({
          readSettings: mockReadSettings,
          readSettingsAsync: mockReadSettingsAsync,
          getUpdateChannel: mockGetUpdateChannel,
        }));
        const updater = require("../updater");
        setupAutoUpdater = updater.setupAutoUpdater;
      });

      if (setupAutoUpdater) {
        await setupAutoUpdater();
      }

      expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith({
        provider: "github",
        owner: "nodetool-ai",
        repo: "nodetool",
        updaterCacheDirName: "nodetool-updater",
        channel: "nightly",
      });
      expect(mockAutoUpdater.channel).toBe("nightly");
      expect(mockAutoUpdater.allowPrerelease).toBe(true);
      expect(mockAutoUpdater.allowDowngrade).toBe(true);
      expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled();
    });

    it("should gracefully handle ENOENT error for app-update.yml during update check", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadSettingsAsync.mockResolvedValue({ autoUpdatesEnabled: true });

      const enoentError = new Error(
        "ENOENT: no such file or directory, open 'C:\\...\\app-update.yml'"
      );
      mockAutoUpdater.checkForUpdates.mockRejectedValue(enoentError);

      let setupAutoUpdater: (() => Promise<void>) | undefined;
      jest.isolateModules(() => {
        jest.doMock("electron", () => ({
          app: { isPackaged: true, getVersion: jest.fn().mockReturnValue("1.0.0") },
        }));
        jest.doMock("../settings", () => ({
          readSettings: mockReadSettings,
          readSettingsAsync: mockReadSettingsAsync,
          getUpdateChannel: mockGetUpdateChannel,
        }));
        const updater = require("../updater");
        setupAutoUpdater = updater.setupAutoUpdater;
      });

      if (setupAutoUpdater) {
        await setupAutoUpdater();
      }

      // Wait for the rejected promise to be handled
      // Using flushPromises pattern
      await Promise.resolve();
      await Promise.resolve();

      expect(mockLogMessage).toHaveBeenCalledWith(
        expect.stringContaining("app-update.yml not found"),
        "warn"
      );
    });

    it("should log other update errors normally", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadSettingsAsync.mockResolvedValue({ autoUpdatesEnabled: true });

      const networkError = new Error("Network error");
      mockAutoUpdater.checkForUpdates.mockRejectedValue(networkError);

      let setupAutoUpdater: (() => Promise<void>) | undefined;
      jest.isolateModules(() => {
        jest.doMock("electron", () => ({
          app: { isPackaged: true, getVersion: jest.fn().mockReturnValue("1.0.0") },
        }));
        jest.doMock("../settings", () => ({
          readSettings: mockReadSettings,
          readSettingsAsync: mockReadSettingsAsync,
          getUpdateChannel: mockGetUpdateChannel,
        }));
        const updater = require("../updater");
        setupAutoUpdater = updater.setupAutoUpdater;
      });

      if (setupAutoUpdater) {
        await setupAutoUpdater();
      }

      // Wait for the rejected promise to be handled
      // Using flushPromises pattern
      await Promise.resolve();
      await Promise.resolve();

      expect(mockLogMessage).toHaveBeenCalledWith(
        "Failed to check for updates: Network error",
        "warn"
      );
    });

    it("should set up event handlers when auto-updater is initialized", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadSettingsAsync.mockResolvedValue({ autoUpdatesEnabled: true });

      let setupAutoUpdater: (() => Promise<void>) | undefined;
      jest.isolateModules(() => {
        jest.doMock("electron", () => ({
          app: { isPackaged: true, getVersion: jest.fn().mockReturnValue("1.0.0") },
        }));
        jest.doMock("../settings", () => ({
          readSettings: mockReadSettings,
          readSettingsAsync: mockReadSettingsAsync,
          getUpdateChannel: mockGetUpdateChannel,
        }));
        const updater = require("../updater");
        setupAutoUpdater = updater.setupAutoUpdater;
      });

      if (setupAutoUpdater) {
        await setupAutoUpdater();
      }

      // Verify event handlers are registered
      expect(mockAutoUpdater.on).toHaveBeenCalledWith(
        "checking-for-update",
        expect.any(Function)
      );
      expect(mockAutoUpdater.on).toHaveBeenCalledWith(
        "update-available",
        expect.any(Function)
      );
      expect(mockAutoUpdater.on).toHaveBeenCalledWith(
        "update-not-available",
        expect.any(Function)
      );
      expect(mockAutoUpdater.on).toHaveBeenCalledWith(
        "download-progress",
        expect.any(Function)
      );
      expect(mockAutoUpdater.on).toHaveBeenCalledWith(
        "update-downloaded",
        expect.any(Function)
      );
      expect(mockAutoUpdater.on).toHaveBeenCalledWith(
        "error",
        expect.any(Function)
      );
    });
  });

  describe("update-downloaded notification", () => {
    it("should install the update when the notification is clicked", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadSettingsAsync.mockResolvedValue({ autoUpdatesEnabled: true });

      const clickHandlers: Record<string, () => void> = {};
      class MockNotification {
        opts: { title: string; body: string };
        constructor(opts: { title: string; body: string }) {
          this.opts = opts;
        }
        on(event: string, handler: () => void) {
          if (event === "click") {
            clickHandlers[this.opts.title] = handler;
          }
        }
        show() {}
        static isSupported() {
          return true;
        }
      }

      let setupAutoUpdater: (() => Promise<void>) | undefined;
      jest.isolateModules(() => {
        jest.doMock("electron", () => ({
          app: { isPackaged: true, getVersion: jest.fn().mockReturnValue("1.0.0") },
          Notification: MockNotification,
        }));
        jest.doMock("../settings", () => ({
          readSettings: mockReadSettings,
          readSettingsAsync: mockReadSettingsAsync,
          getUpdateChannel: mockGetUpdateChannel,
        }));
        const updater = require("../updater");
        setupAutoUpdater = updater.setupAutoUpdater;
      });

      if (setupAutoUpdater) {
        await setupAutoUpdater();
      }

      const downloadedHandler = mockAutoUpdater.on.mock.calls.find(
        (call) => call[0] === "update-downloaded"
      )?.[1];
      expect(downloadedHandler).toBeDefined();

      await downloadedHandler({ version: "1.2.3" });

      const clickHandler = clickHandlers["NodeTool Update Ready"];
      expect(clickHandler).toBeDefined();

      clickHandler();

      expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalled();
    });
  });

  describe("error event handler", () => {
    it("should handle missing app-update.yml error gracefully", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadSettingsAsync.mockResolvedValue({ autoUpdatesEnabled: true });

      let setupAutoUpdater: (() => Promise<void>) | undefined;
      jest.isolateModules(() => {
        jest.doMock("electron", () => ({
          app: { isPackaged: true, getVersion: jest.fn().mockReturnValue("1.0.0") },
        }));
        jest.doMock("../settings", () => ({
          readSettings: mockReadSettings,
          readSettingsAsync: mockReadSettingsAsync,
          getUpdateChannel: mockGetUpdateChannel,
        }));
        const updater = require("../updater");
        setupAutoUpdater = updater.setupAutoUpdater;
      });

      if (setupAutoUpdater) {
        await setupAutoUpdater();
      }

      // Find the error handler and call it
      const errorHandler = mockAutoUpdater.on.mock.calls.find(
        (call) => call[0] === "error"
      )?.[1];

      expect(errorHandler).toBeDefined();

      const enoentError = new Error(
        "ENOENT: no such file or directory, open 'C:\\...\\app-update.yml'"
      );
      errorHandler(enoentError);

      // Should log as warning, not error, for missing config file
      expect(mockLogMessage).toHaveBeenCalledWith(
        expect.stringContaining("app-update.yml not found"),
        "warn"
      );
    });

    it("should log other errors normally", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadSettingsAsync.mockResolvedValue({ autoUpdatesEnabled: true });

      let setupAutoUpdater: (() => Promise<void>) | undefined;
      jest.isolateModules(() => {
        jest.doMock("electron", () => ({
          app: { isPackaged: true, getVersion: jest.fn().mockReturnValue("1.0.0") },
        }));
        jest.doMock("../settings", () => ({
          readSettings: mockReadSettings,
          readSettingsAsync: mockReadSettingsAsync,
          getUpdateChannel: mockGetUpdateChannel,
        }));
        const updater = require("../updater");
        setupAutoUpdater = updater.setupAutoUpdater;
      });

      if (setupAutoUpdater) {
        await setupAutoUpdater();
      }

      const errorHandler = mockAutoUpdater.on.mock.calls.find(
        (call) => call[0] === "error"
      )?.[1];

      expect(errorHandler).toBeDefined();

      const networkError = new Error("Network connection failed");
      errorHandler(networkError);

      expect(mockLogMessage).toHaveBeenCalledWith(
        "Update error: Network connection failed",
        "error"
      );
    });
  });

  describe("checkForUpdatesManually", () => {
    const loadManualCheck = (): (() => Promise<unknown>) => {
      let fn: (() => Promise<unknown>) | undefined;
      jest.isolateModules(() => {
        jest.doMock("electron", () => ({
          app: {
            isPackaged: true,
            getVersion: jest.fn().mockReturnValue("1.0.0"),
          },
        }));
        jest.doMock("../settings", () => ({
          readSettings: mockReadSettings,
          readSettingsAsync: mockReadSettingsAsync,
          getUpdateChannel: mockGetUpdateChannel,
        }));
        fn = require("../updater").checkForUpdatesManually;
      });
      if (!fn) {
        throw new Error("checkForUpdatesManually not exported");
      }
      return fn;
    };

    it("returns dev status and does not check when not packaged", async () => {
      let fn: (() => Promise<unknown>) | undefined;
      jest.isolateModules(() => {
        jest.doMock("electron", () => ({
          app: { isPackaged: false },
        }));
        fn = require("../updater").checkForUpdatesManually;
      });

      const result = await fn!();

      expect(result).toEqual({ status: "dev" });
      expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
      expect(mockAutoUpdater.setFeedURL).not.toHaveBeenCalled();
    });

    it("returns unsupported status when app-update.yml is missing", async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await loadManualCheck()();

      expect(result).toEqual({ status: "unsupported" });
      expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
    });

    it("checks for updates even when auto-updates are disabled (opt-in bypass)", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadSettingsAsync.mockResolvedValue({ autoUpdatesEnabled: false });
      mockGetUpdateChannel.mockReturnValue("latest");
      mockAutoUpdater.checkForUpdates.mockResolvedValue({
        isUpdateAvailable: false,
        updateInfo: { version: "1.0.0" },
      });

      const result = await loadManualCheck()();

      expect(mockAutoUpdater.setFeedURL).toHaveBeenCalled();
      expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled();
      expect(result).toEqual({ status: "up-to-date" });
    });

    it("reports an available update with its version", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadSettingsAsync.mockResolvedValue({ autoUpdatesEnabled: false });
      mockAutoUpdater.checkForUpdates.mockResolvedValue({
        isUpdateAvailable: true,
        updateInfo: { version: "2.5.0" },
      });

      const result = await loadManualCheck()();

      expect(result).toEqual({ status: "available", version: "2.5.0" });
    });

    it("returns an error status when the check throws", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadSettingsAsync.mockResolvedValue({ autoUpdatesEnabled: true });
      mockAutoUpdater.checkForUpdates.mockRejectedValue(
        new Error("Network down")
      );

      const result = await loadManualCheck()();

      expect(result).toEqual({ status: "error", message: "Network down" });
    });
  });
});
