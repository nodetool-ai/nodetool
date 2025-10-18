import { Tray, Menu, app, BrowserWindow, shell } from "electron";
import path from "path";
import { logMessage, LOG_FILE } from "./logger";
import { getMainWindow } from "./state";
import { createPackageManagerWindow, createWindow, createLogViewerWindow } from "./window";
import { execSync } from "child_process";
import { stopServer, initializeBackendServer, isServerRunning, getServerState, isOllamaRunning } from "./server";
import { fetchWorkflows } from "./api";

let trayInstance: Electron.Tray | null = null;

/**
 * Module for managing the system tray functionality of the NodeTool application.
 * Handles tray creation, menu updates, and tray-related events.
 * @module tray
 */

/**
 * Creates or recreates the system tray instance.
 * Handles platform-specific setup (Windows/macOS) and icon initialization.
 * @returns {Promise<Electron.Tray>} The created tray instance
 * @throws {Error} If tray creation fails
 */
async function createTray(): Promise<Electron.Tray> {
  logMessage("Starting tray creation...", "info");

  if (trayInstance) {
    logMessage("Destroying existing tray instance", "info");
    trayInstance.destroy();
    trayInstance = null;
  }

  const isWindows = process.platform === "win32";
  const iconPath = path.join(
    __dirname,
    "..",
    "assets",
    isWindows ? "tray-icon.ico" : "tray-icon.png"
  );

  logMessage(`Attempting to create tray with icon at: ${iconPath}`, "info");

  if (isWindows) {
    logMessage("Setting Windows-specific app ID", "info");
    app.setAppUserModelId("com.nodetool.desktop");
  }

  try {
    trayInstance = new Tray(iconPath);
    logMessage("Tray instance created successfully", "info");
  } catch (error) {
    if (error instanceof Error) {
      logMessage(`Failed to create tray: ${error.message}`, "error");
      throw new Error(`Could not create tray: ${error.message}`);
    }
  }

  if (!trayInstance) {
    logMessage("Tray instance is null after creation attempt", "error");
    throw new Error("Failed to create tray instance");
  }

  if (isWindows) {
    logMessage("Setting up Windows-specific tray events", "info");
    trayInstance.setIgnoreDoubleClickEvents(true);

    try {
      const iconPreferenceKey =
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\TrayNotify";
      logMessage("Updating Windows registry for tray icon", "info");
      execSync(
        `reg add "${iconPreferenceKey}" /v "IconStreams" /t REG_BINARY /d "" /f`
      );
      execSync(
        `reg add "${iconPreferenceKey}" /v "PastIconsStream" /t REG_BINARY /d "" /f`
      );
    } catch (error) {
      if (error instanceof Error) {
        logMessage(
          `Failed to set tray icon preference: ${error.message}`,
          "warn"
        );
      }
    }

    setupWindowsTrayEvents(trayInstance);
  } else {
    // On macOS/Linux, show the context menu on click and right-click
    trayInstance.on("click", () => {
      void updateTrayMenu();
      trayInstance?.popUpContextMenu();
    });
    trayInstance.on("right-click", () => {
      void updateTrayMenu();
      trayInstance?.popUpContextMenu();
    });
  }
  // Initialize the tray menu immediately so it responds on first click
  await updateTrayMenu();
  return trayInstance;
}

/**
 * Sets up Windows-specific tray event handlers.
 * Handles double-click, single-click, and right-click events.
 * @param {Electron.Tray} tray - The tray instance to set up events for
 */
function setupWindowsTrayEvents(tray: Electron.Tray): void {
  tray.on("double-click", () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });

  tray.on("click", () => {
    void updateTrayMenu();
    tray.popUpContextMenu();
  });

  tray.on("right-click", () => {
    void updateTrayMenu();
    tray.popUpContextMenu();
  });
}

/**
 * Focuses the NodeTool window or creates a new one if none exists.
 * Handles platform-specific window focusing behavior.
 */
function focusNodeTool(): void {
  const visibleWindows = BrowserWindow.getAllWindows().filter(
    (w) => !w.isDestroyed() && w.isVisible()
  );

  if (visibleWindows.length === 0) {
    createWindow();
  } else if (process.platform === "darwin") {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  }
}

/**
 * Updates the tray menu with current application state and available workflows.
 * Includes service status, workflow list, and application controls.
 * @returns {Promise<void>}
 */
async function updateTrayMenu(): Promise<void> {
  if (!trayInstance) return;

  const connected = await isServerRunning();
  const statusIndicator = connected ? "🟢" : "🔴";
  const ollamaRunning = isOllamaRunning();
  const state = getServerState();
  const backendLabel = connected
    ? `${statusIndicator} NodeTool: ${state.serverPort ?? "unknown"}`
    : `${statusIndicator} NodeTool: stopped`;
  const ollamaLabel = ollamaRunning
    ? `🟢 Ollama: ${state.ollamaPort ?? "unknown"}`
    : state.ollamaExternalManaged
      ? `🟢 Ollama (external): ${state.ollamaPort ?? "unknown"}`
      : "🔴 Ollama: stopped";

  const contextMenu = Menu.buildFromTemplate([
    {
      label: backendLabel,
      enabled: false,
    },
    {
      label: ollamaLabel,
      enabled: false,
    },
    {
      label: "Start Service",
      enabled: !connected,
      click: async () => {
        await initializeBackendServer();
        updateTrayMenu();
      },
    },
    {
      label: "Stop Service",
      enabled: connected,
      click: async () => {
        try {
          await stopServer();
          await updateTrayMenu();
        } catch (error) {
          if (error instanceof Error) {
            logMessage(`Failed to stop service: ${error.message}`, "error");
          }
        }
      },
    },
    { type: "separator" },
    {
      label: "Show NodeTool",
      enabled: true,
      click: async () => focusNodeTool(),
    },
    {
      label: "Package Manager",
      click: () => createPackageManagerWindow(),
    },
    { type: "separator" },
    {
      label: "Log Viewer",
      click: () => createLogViewerWindow(),
    },
    {
      label: "Open Log File",
      click: () => {
        shell.openPath(LOG_FILE);
      },
    },
    { type: "separator" },
    { label: "Quit NodeTool", role: "quit" },
  ]);

  trayInstance.setContextMenu(contextMenu);
  trayInstance.setToolTip("NodeTool Desktop");
}

export { createTray, updateTrayMenu, fetchWorkflows };
