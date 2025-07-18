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
import { logMessage } from "./logger";
import { initializeBackendServer, stopServer, serverState } from "./server";
import { verifyApplicationPaths, isCondaEnvironmentInstalled } from "./python";
import { installCondaEnvironment } from "./installer";
import { emitBootMessage, emitShowPackageManager } from "./events";
import { createTray } from "./tray";
import { createWorkflowWindow } from "./workflowWindow";
import { initializeIpcHandlers } from "./ipc";
import { buildMenu } from "./menu";
import { createChatOverlayWindow } from "./chatWindow";

/**
 * Global application state flags and objects
 */
let isAppQuitting = false;
let mainWindow: BrowserWindow | null = null;

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
    logMessage(`Error in checkPythonEnvironment: ${error}`, "error");
    throw error;
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
    logMessage(`Python environment check complete, hasEnvironment: ${hasEnvironment}`);
    
    if (hasEnvironment) {
      // Environment exists, show package manager during startup
      // Do NOT start the server automatically - wait for user to continue
      logMessage("Environment exists, showing package manager");
      emitShowPackageManager();
      logMessage("emitShowPackageManager() called");
      logMessage("Skipping workflow shortcuts setup - server not started yet");
    } else {
      // Environment was just installed, proceed normally
      logMessage("Environment was just installed, initializing backend server");
      await initializeBackendServer();
      logMessage("initializeBackendServer() completed");
      
      logMessage("Setting up workflow shortcuts...");
      await setupWorkflowShortcuts();
    }

    // Request notification permissions
    if (process.platform === "darwin") {
      logMessage("Setting activation policy for macOS");
      app.setActivationPolicy("accessory");
    }
    
    logMessage("=== Application Initialization Complete ===");
  } catch (error) {
    logMessage(`Initialization error: ${error}`, "error");
    dialog.showErrorBox(
      "Initialization Error",
      `Failed to initialize: ${error}`
    );
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

app.on("ready", async () => {
  await initializeIpcHandlers();
  await checkMediaPermissions();

  // Check for --run argument or environment variable
  const runIndex = process.argv.indexOf("--run");
  if (runIndex > -1 && process.argv[runIndex + 1]) {
    const workflowId = process.argv[runIndex + 1];
    logMessage(`Running workflow from command line: ${workflowId}`);
    createWorkflowWindow(workflowId);
    return;
  }
  const chatIndex = process.argv.indexOf("--chat");
  if (chatIndex > -1) {
    logMessage(`Running chat from command line`);
    createChatOverlayWindow();
    return;
  }

  mainWindow = createWindow();
  mainWindow.on("ready-to-show", async () => {
    mainWindow?.show();
    mainWindow?.focus();
    // Build menu after the main window is created
    await buildMenu();
    await createTray();
    await initialize();
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

app.on("window-all-closed", () => {
  logMessage("All windows closed");
});

app.on("activate", handleActivation);

process.on("uncaughtException", (error: Error) => {
  logMessage(`Uncaught Exception: ${error.message}`, "error");
  logMessage(`Stack Trace: ${error.stack}`, "error");
  forceQuit(`Uncaught Exception: ${error.message}`);
});

process.on(
  "unhandledRejection",
  (reason: unknown, promise: Promise<unknown>) => {
    const errorMessage =
      reason instanceof Error ? reason.message : String(reason);
    logMessage(`Unhandled Promise Rejection: ${errorMessage}`, "error");
    if (reason instanceof Error) {
      logMessage(`Stack Trace: ${reason.stack}`, "error");
    }
    forceQuit(`Unhandled Promise Rejection: ${errorMessage}`);
  }
);

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

export { mainWindow, isAppQuitting };
