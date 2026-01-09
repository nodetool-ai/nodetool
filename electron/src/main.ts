/**
 * @fileoverview Main entry point for the Electron application.
 *
 * This module initializes and manages the core application lifecycle, including:
 * - Application window management
 * - Python/Conda environment setup and validation
 * - System permissions handling
 * - IPC (Inter-Process Communication) setup
 * - Error handling and logging
 * - Auto-updates
 * - System tray integration
 * - Global shortcuts
 * - Backend server management
 *
 * The application follows a multi-process architecture typical of Electron apps,
 * with this main process coordinating window creation, system integration, and
 * background services.
 *
 * Key Features:
 * - Handles application lifecycle events (ready, quit, activate)
 * - Manages Python/Conda environment installation and updates
 * - Implements permission checks for system resources (e.g., microphone)
 * - Provides error handling and logging infrastructure
 * - Supports command-line workflow execution (--run) and chat overlay (--chat)
 */

import {
  app,
  ipcMain,
  dialog,
  shell,
  systemPreferences,
  BrowserWindow,
  globalShortcut,
} from "electron";
import { createWindow, forceQuit, handleActivation } from "./window";
import { setupAutoUpdater } from "./updater";
import { setupWorkflowShortcuts } from "./shortcuts";
import { logMessage, closeLogStream } from "./logger";
import { initializeBackendServer, stopServer, serverState } from "./server";
import { verifyApplicationPaths, isCondaEnvironmentInstalled } from "./python";
import { installCondaEnvironment } from "./installer";
import { emitBootMessage, emitShowPackageManager } from "./events";
import { createTray, cleanupTrayEvents } from "./tray";
import { createWorkflowWindow } from "./workflowWindow";
import { initializeIpcHandlers } from "./ipc";
import { buildMenu } from "./menu";
import assert from "assert";
import { checkForPackageUpdates, installExpectedPackages, checkExpectedPackageVersions } from "./packageManager";
import { IpcChannels } from "./types.d";
import { readSettings, updateSetting } from "./settings";

/**
 * Global application state flags and objects
 */
let isAppQuitting = false;
let mainWindow: BrowserWindow | null = null;
let isShowingUnexpectedError = false;

function shouldForceQuit(error: unknown): boolean {
  // Treat only clearly fatal cases as requiring a full shutdown.
  if (!app.isReady()) {
    return true;
  }
  if (error instanceof assert.AssertionError) {
    return true;
  }
  return false;
}

function showUnexpectedErrorDialog(title: string, message: string): void {
  if (isShowingUnexpectedError) {
    return;
  }
  isShowingUnexpectedError = true;

  dialog
    .showMessageBox({
      type: "error",
      title,
      message,
      detail:
        "An unexpected error occurred in the main process. Some features may not work correctly.",
    })
    .finally(() => {
      // Avoid spamming dialogs if multiple errors occur in quick succession.
      setTimeout(() => {
        isShowingUnexpectedError = false;
      }, 2000);
    });
}

function logUnexpectedError(prefix: string, error: unknown): string {
  const errorMessage =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  logMessage(`${prefix}: ${errorMessage}`, "error");
  if (error instanceof Error && error.stack) {
    logMessage(`Stack Trace: ${error.stack}`, "error");
  }
  return errorMessage;
}

async function notifyPackageUpdates(): Promise<void> {
  try {
    const updates = await checkForPackageUpdates();
    if (!updates.length || !mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.webContents.send(IpcChannels.PACKAGE_UPDATES_AVAILABLE, updates);
  } catch (error: any) {
    logMessage(
      `Failed to notify package updates: ${error.message ?? String(error)}`,
      "warn"
    );
  }
}

/**
 * Check and install expected package versions on startup
 */
async function checkAndInstallExpectedPackages(): Promise<void> {
  try {
    logMessage("=== Starting Expected Package Version Check ===");

    const packagesNeedingUpdate = await checkExpectedPackageVersions();

    if (packagesNeedingUpdate.length === 0) {
      logMessage("All expected packages are at correct versions");
      return;
    }

    logMessage(
      `Found ${packagesNeedingUpdate.length} package(s) needing update: ${packagesNeedingUpdate.map((p) => p.packageName).join(", ")}`
    );

    emitBootMessage(
      `Updating ${packagesNeedingUpdate.length} package(s)...`
    );

    const result = await installExpectedPackages();

    if (result.success) {
      logMessage(
        `Successfully updated ${result.packagesUpdated} of ${result.packagesChecked} expected packages`
      );
    } else {
      logMessage(
        `Failed to update ${result.failures.length} of ${result.packagesChecked} expected packages`,
        "warn"
      );
      for (const failure of result.failures) {
        logMessage(
          `  - ${failure.packageName}: ${failure.error}`,
          "warn"
        );
      }
    }

    logMessage("=== Expected Package Version Check Complete ===");
  } catch (error: any) {
    logMessage(
      `Failed to check/install expected packages: ${error.message ?? String(error)}`,
      "warn"
    );
  }
}

/**
 * Checks and sets up the Python Conda environment
 * @returns Promise<boolean> - true if environment exists, false if installation was needed
 */
async function checkPythonEnvironment(): Promise<boolean> {
  logMessage("=== Starting Python Environment Check ===");

  emitBootMessage("Checking for Python environment...");
  logMessage("Emitted boot message: Checking for Python environment...");

  try {
    logMessage("Calling isCondaEnvironmentInstalled()...");
    const hasCondaEnv = await isCondaEnvironmentInstalled();
    logMessage(`isCondaEnvironmentInstalled() returned: ${hasCondaEnv}`);

    if (hasCondaEnv) {
      logMessage(`Python environment found - proceeding with startup`);
      return true;
    } else {
      logMessage("Python environment not found - starting installation");
      emitBootMessage("Python environment not found");
      await installCondaEnvironment();
      logMessage("Installation completed");
      return false;
    }
  } catch (error) {
    // Be defensive: if the check itself failed, attempt to run installer as fallback
    logMessage(`Error in checkPythonEnvironment: ${error}`, "error");
    const errorMessage = error instanceof Error ? error.message : String(error);
    // If the error already occurred during installation, don't attempt to run the installer again
    if (
      errorMessage.includes("Failed to install Python environment") ||
      errorMessage.includes("install-to-location")
    ) {
      throw error;
    }
    try {
      emitBootMessage("Environment check failed, starting installer...");
      await installCondaEnvironment();
      logMessage("Fallback installation completed");
      return false;
    } catch (installError) {
      logMessage(`Fallback installation failed: ${installError}`, "error");
      throw installError;
    }
  } finally {
    logMessage("=== Python Environment Check Complete ===");
  }
}

/**
 * Initializes the application, verifies paths, and starts required servers
 * @throws {Error} When critical permissions are missing
 */
async function initialize(): Promise<void> {
  try {
    logMessage("=== Starting Application Initialization ===");

    // Skip heavy initialization in test mode
    if (process.env.NODE_ENV === 'test') {
      logMessage("Running in test mode, skipping Python/server initialization");
      assert(mainWindow, "MainWindow is not initialized");
      // Load a simple page for testing
      mainWindow.loadURL('data:text/html,<html><body>Test Mode</body></html>');
      logMessage("=== Application Initialization Complete (Test Mode) ===");
      return;
    }

    // Verify paths and permissions
    logMessage("Verifying application paths...");
    const validationResult = await verifyApplicationPaths();
    logMessage(`Path validation result: ${JSON.stringify(validationResult)}`);

    if (validationResult.errors.length > 0) {
      logMessage("Critical permission errors detected", "error");
      const errorMessage =
        "Critical permission errors detected:\n\n" +
        validationResult.errors.join("\n") +
        "\n\nPlease ensure the application has proper permissions to these locations.";

      dialog.showErrorBox("Permission Error", errorMessage);
      app.quit();
      return;
    }

    logMessage("Setting up auto updater...");
    setupAutoUpdater();

    // Check if conda environment is installed
    logMessage("About to check Python environment...");
    const hasEnvironment = await checkPythonEnvironment();
    logMessage(
      `Python environment check complete, hasEnvironment: ${hasEnvironment}`
    );

    assert(mainWindow, "MainWindow is not initialized");

    if (hasEnvironment) {
      logMessage("Environment exists, starting backend server");
      await initializeBackendServer();
      logMessage("initializeBackendServer() completed");
      logMessage("Loading web app...");
      const timestamp = new Date().getTime();
      mainWindow.loadURL(`${serverState.initialURL}?nocache=${timestamp}`);
    } else {
      // Environment was just installed, proceed normally
      logMessage("Environment was just installed, initializing backend server");
      await initializeBackendServer();
      logMessage("initializeBackendServer() completed");

      logMessage("Setting up workflow shortcuts...");
      await setupWorkflowShortcuts();
    }

    void notifyPackageUpdates();

    // Check and install expected package versions
    void checkAndInstallExpectedPackages();

    // Request notification permissions
    if (process.platform === "darwin") {
      logMessage("Setting activation policy for macOS (regular)");
      // Use 'regular' so the app has a normal menu bar and responds to menu clicks
      app.setActivationPolicy("regular");
    }

    logMessage("=== Application Initialization Complete ===");
  } catch (error) {
    logMessage(`Initialization error: ${error}`, "error");
    const message = error instanceof Error ? error.message : String(error);

    if (serverState.status === "error") {
      logMessage(
        "Backend failed to start; staying on splash screen for recovery actions",
        "warn"
      );
      return;
    }

    dialog.showErrorBox("Initialization Error", `Failed to initialize: ${message}`);
    app.quit();
  }
}

/**
 * Checks system media permissions and requests access if needed
 */
async function checkMediaPermissions(): Promise<void> {
  if (process.platform === "win32" || process.platform === "darwin") {
    try {
      logMessage("Starting microphone permission check");

      const microphoneStatus =
        systemPreferences.getMediaAccessStatus("microphone");
      logMessage(`Current microphone status: ${microphoneStatus}`);

      if (microphoneStatus !== "granted") {
        logMessage(
          `Microphone not granted, current status: ${microphoneStatus}`
        );

        if (process.platform === "darwin") {
          logMessage("Requesting microphone access on macOS");
          const granted = await systemPreferences.askForMediaAccess(
            "microphone"
          );
          logMessage(`Microphone permission request result: ${granted}`);

          if (!granted) {
            logMessage("Opening system preferences for microphone access");
            shell.openExternal(
              "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
            );
          }
        } else if (process.platform === "win32") {
          logMessage("Opening Windows privacy settings for microphone");
          shell.openExternal("ms-settings:privacy-microphone");
        }
      } else {
        logMessage("Microphone permission already granted");
      }
    } catch (error) {
      logMessage(
        `Error handling microphone permissions: ${(error as Error).message}`,
        "error"
      );
    }
  } else {
    logMessage(
      `Platform ${process.platform} does not require explicit microphone permissions`
    );
  }
}

let isInitialized = false;

app.on("ready", async () => {
  await initializeIpcHandlers();
  
  // Skip media permissions check in test mode
  if (process.env.NODE_ENV !== 'test') {
    await checkMediaPermissions();
  }

  mainWindow = createWindow();
  mainWindow.on("ready-to-show", async () => {
    mainWindow?.show();
    mainWindow?.focus();
    if (!isInitialized) {
      isInitialized = true;
      
      // Skip menu/tray creation in test mode
      if (process.env.NODE_ENV !== 'test') {
        await buildMenu();
        await createTray();
      }
      
      await initialize();
    }
  });
});

ipcMain.handle("update-installed", async () => {
  logMessage("Update installed, marking conda environment for update");

  // Show dialog informing user about restart
  dialog
    .showMessageBox({
      type: "info",
      title: "Update Installed",
      message: "The application needs to restart to apply the update.",
      buttons: ["Restart Now"],
    })
    .then(() => {
      app.relaunch();
      app.quit();
    });
});

app.on("before-quit", (event) => {
  if (!isAppQuitting) {
    isAppQuitting = true;
    stopServer();
  }
});

app.on("window-all-closed", async () => {
  logMessage("All windows closed");

  const settings = readSettings();
  const closeAction = settings.windowCloseAction;

  // If user has already made a choice, use it
  if (closeAction === "quit") {
    logMessage("User preference: quit on close");
    app.quit();
    return;
  } else if (closeAction === "background") {
    logMessage("User preference: keep running in background");
    return; // Keep running in background (tray is still active)
  }

  // Show dialog to ask user
  const result = await dialog.showMessageBox({
    type: "question",
    title: "Close NodeTool",
    message: "What would you like to do?",
    detail: "NodeTool can continue running in the background to keep services available.",
    buttons: ["Quit", "Keep Running in Background"],
    defaultId: 1,
    cancelId: 1,
    checkboxLabel: "Remember my choice",
    checkboxChecked: false,
  });

  const shouldQuit = result.response === 0;
  const rememberChoice = result.checkboxChecked;

  if (rememberChoice) {
    const choice = shouldQuit ? "quit" : "background";
    updateSetting("windowCloseAction", choice);
    logMessage(`Saved user preference for window close action: ${choice}`);
  }

  if (shouldQuit) {
    logMessage("User chose to quit");
    app.quit();
  } else {
    logMessage("User chose to keep running in background");
    // Keep running - tray icon will remain active
  }
});

app.on("activate", handleActivation);

process.on("uncaughtException", (error: Error) => {
  const message = logUnexpectedError("Uncaught Exception", error);
  showUnexpectedErrorDialog("Unexpected Error", message);

  if (shouldForceQuit(error)) {
    forceQuit(`Uncaught Exception: ${message}`);
  }
});

process.on(
  "unhandledRejection",
  (reason: unknown, promise: Promise<unknown>) => {
    const message = logUnexpectedError("Unhandled Promise Rejection", reason);
    showUnexpectedErrorDialog("Unexpected Error", message);

    if (shouldForceQuit(reason)) {
      forceQuit(`Unhandled Promise Rejection: ${message}`);
    }
  }
);

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  cleanupTrayEvents();
  closeLogStream();
});

export { mainWindow, isAppQuitting };
