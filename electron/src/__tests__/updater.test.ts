/**
 * @fileoverview Tests for the auto-updater module
 *
 * Tests the hardened auto-updater logic that:
 * - Skips auto-update in development mode
 * - Gracefully handles missing app-update.yml file
 * - Logs warnings instead of crashing
 */

// Mock electron-updater module
const mockAutoUpdater = {
  setFeedURL: jest.fn(),
  checkForUpdates: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  logger: null,
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

// Store original process.resourcesPath
const originalResourcesPath = process.resourcesPath;

describe("Auto-updater Module", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the mocks
    mockExistsSync.mockReturnValue(true);
    mockAutoUpdater.checkForUpdates.mockResolvedValue(undefined);
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

    it("should disable auto-updater when app-update.yml is missing", () => {
      mockExistsSync.mockReturnValue(false);

      jest.isolateModules(() => {
        jest.doMock("electron", () => ({
          app: { isPackaged: true },
        }));
        const { setupAutoUpdater } = require("../updater");
        setupAutoUpdater();
      });

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

    it("should set up auto-updater when app is packaged and config exists", () => {
      mockExistsSync.mockReturnValue(true);

      jest.isolateModules(() => {
        jest.doMock("electron", () => ({
          app: { isPackaged: true },
        }));
        const { setupAutoUpdater } = require("../updater");
        setupAutoUpdater();
      });

      expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith({
        provider: "github",
        owner: "nodetool-ai",
        repo: "nodetool",
        updaterCacheDirName: "nodetool-updater",
      });
      expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled();
    });

    it("should gracefully handle ENOENT error for app-update.yml during update check", async () => {
      mockExistsSync.mockReturnValue(true);

      const enoentError = new Error(
        "ENOENT: no such file or directory, open 'C:\\...\\app-update.yml'"
      );
      mockAutoUpdater.checkForUpdates.mockRejectedValue(enoentError);

      jest.isolateModules(() => {
        jest.doMock("electron", () => ({
          app: { isPackaged: true },
        }));
        const { setupAutoUpdater } = require("../updater");
        setupAutoUpdater();
      });

      // Wait for async catch to execute
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockLogMessage).toHaveBeenCalledWith(
        expect.stringContaining("app-update.yml not found"),
        "warn"
      );
    });

    it("should log other update errors normally", async () => {
      mockExistsSync.mockReturnValue(true);

      const networkError = new Error("Network error");
      mockAutoUpdater.checkForUpdates.mockRejectedValue(networkError);

      jest.isolateModules(() => {
        jest.doMock("electron", () => ({
          app: { isPackaged: true },
        }));
        const { setupAutoUpdater } = require("../updater");
        setupAutoUpdater();
      });

      // Wait for async catch to execute
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockLogMessage).toHaveBeenCalledWith(
        "Failed to check for updates: Network error",
        "warn"
      );
    });

    it("should set up event handlers when auto-updater is initialized", () => {
      mockExistsSync.mockReturnValue(true);

      jest.isolateModules(() => {
        jest.doMock("electron", () => ({
          app: { isPackaged: true },
        }));
        const { setupAutoUpdater } = require("../updater");
        setupAutoUpdater();
      });

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

  describe("isUpdateAvailable", () => {
    it("should return false by default", () => {
      jest.isolateModules(() => {
        const { isUpdateAvailable } = require("../updater");
        expect(isUpdateAvailable()).toBe(false);
      });
    });
  });

  describe("error event handler", () => {
    it("should handle missing app-update.yml error gracefully", () => {
      mockExistsSync.mockReturnValue(true);

      jest.isolateModules(() => {
        jest.doMock("electron", () => ({
          app: { isPackaged: true },
        }));
        const { setupAutoUpdater } = require("../updater");
        setupAutoUpdater();
      });

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

    it("should log other errors normally", () => {
      mockExistsSync.mockReturnValue(true);

      jest.isolateModules(() => {
        jest.doMock("electron", () => ({
          app: { isPackaged: true },
        }));
        const { setupAutoUpdater } = require("../updater");
        setupAutoUpdater();
      });

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
});
