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
import {
  verifyApplicationPaths,
  isCondaEnvironmentInstalled,
  updateCondaEnvironment,
} from "./python";
import { installCondaEnvironment } from "./installer";
import { emitBootMessage } from "./events";
import { createTray } from "./tray";
import { createWorkflowWindow } from "./workflowWindow";
import { initializeIpcHandlers } from "./ipc";
import { connectToWebSocketUpdates } from "./api";
import { buildMenu } from "./menu";
import { createChatOverlayWindow } from "./chatWindow";

/**
 * Global application state flags and objects
 */
let isAppQuitting = false;
let mainWindow: BrowserWindow | null = null;

app.commandLine.appendSwitch("enable-transparent-visuals");
app.commandLine.appendSwitch("disable-gpu", "false");

/**
 * Checks and sets up the Python Conda environment
 */
async function checkPythonEnvironment(): Promise<void> {
  emitBootMessage("Checking for Python environment...");
  const hasCondaEnv = await isCondaEnvironmentInstalled();

  logMessage(`Python environment installed: ${hasCondaEnv}`);

  if (!hasCondaEnv) {
    await installCondaEnvironment();
  }
}

/**
 * Initializes the application, verifies paths, and starts required servers
 * @throws {Error} When critical permissions are missing
 */
async function initialize(): Promise<void> {
  try {
    // Verify paths and permissions
    const validationResult = await verifyApplicationPaths();
    if (validationResult.errors.length > 0) {
      const errorMessage =
        "Critical permission errors detected:\n\n" +
        validationResult.errors.join("\n") +
        "\n\nPlease ensure the application has proper permissions to these locations.";

      dialog.showErrorBox("Permission Error", errorMessage);
      app.quit();
      return;
    }

    setupAutoUpdater();

    // Check if conda environment is installed
    await checkPythonEnvironment();

    // Check if conda update is pending
    await updateCondaEnvironment();

    await initializeBackendServer();
    await setupWorkflowShortcuts();
    setTimeout(async () => {
      await connectToWebSocketUpdates();
    }, 10000);

    // Request notification permissions
    if (process.platform === "darwin") {
      app.setActivationPolicy("accessory");
    }
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
      console.log("Checking microphone permissions...");

      const microphoneStatus =
        systemPreferences.getMediaAccessStatus("microphone");
      logMessage(`Current microphone status: ${microphoneStatus}`);
      console.log(`Detailed microphone status:`, { microphoneStatus });

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
          console.log(`macOS permission request result:`, { granted });

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
      console.error("Detailed permission error:", error);
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

  await buildMenu();
  await createTray();

  // Wait for window to be ready before initializing
  // Check for --run argument or environment variable
  const runIndex = process.argv.indexOf("--run");
  if (runIndex > -1 && process.argv[runIndex + 1]) {
    const workflowId = process.argv[runIndex + 1];
    logMessage(`Running workflow from command line: ${workflowId}`);
    createWorkflowWindow(workflowId);
    return;
  }
  console.log(process.argv);
  const chatIndex = process.argv.indexOf("--chat");
  if (chatIndex > -1) {
    logMessage(`Running chat from command line`);
    createChatOverlayWindow();
    return;
  }

  mainWindow = createWindow();
  mainWindow.once("ready-to-show", async () => {
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
