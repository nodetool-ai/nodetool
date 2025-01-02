const {
  app,
  ipcMain,
  dialog,
  shell,
  systemPreferences,
  Tray,
  Menu,
  BrowserWindow,
} = require("electron");
const { createWindow, forceQuit } = require("./window");
const { setupAutoUpdater } = require("./updater");
const { logMessage } = require("./logger");
const {
  initializeBackendServer,
  gracefulShutdown,
  serverState,
} = require("./server");
const {
  verifyApplicationPaths,
  isCondaEnvironmentInstalled,
  installCondaEnvironment,
  updateCondaEnvironment,
} = require("./python");
const { LOG_FILE } = require("./logger");
const { emitBootMessage } = require("./events");
const { getMainWindow } = require("./state");
const fs = require("fs");
const path = require("path");
const { createTray } = require("./tray");
const { createWorkflowWindow, isWorkflowWindow } = require("./workflow-window");

/**
 * Global application state flags and objects
 * @type {boolean}
 */
let isAppQuitting = false;
/** @type {import('electron').Tray|null} */
let tray = null;
/** @type {import('electron').Menu} */
let contextMenu = null;

/**
 * Checks and sets up the Python Conda environment
 * @returns {Promise<void>}
 */
async function checkPythonEnvironment() {
  emitBootMessage("Checking for Python environment...");
  const hasCondaEnv = await isCondaEnvironmentInstalled();

  if (!hasCondaEnv) {
    await installCondaEnvironment();
  } else {
    await updateCondaEnvironment();
  }
}

/**
 * Initializes the application, verifies paths, and starts required servers
 * @returns {Promise<void>}
 * @throws {Error} When critical permissions are missing
 */
async function initialize() {
  logMessage("Electron app is ready");
  emitBootMessage("Starting NodeTool Desktop...");

  const { valid, errors } = await verifyApplicationPaths();
  if (!valid) {
    const errorMessage =
      "Critical permission errors detected:\n\n" +
      errors.join("\n") +
      "\n\nPlease ensure the application has proper permissions to these locations.";

    dialog.showErrorBox("Permission Error", errorMessage);
    app.quit();
    return;
  }

  createWindow();
  setupAutoUpdater();

  // Check if Conda environment exists, but don't update packages
  await checkPythonEnvironment();

  emitBootMessage("Starting NodeTool server...");
  await initializeBackendServer();
}

/**
 * Checks system media permissions and requests access if needed
 * @returns {Promise<void>}
 */
async function checkMediaPermissions() {
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
        `Error handling microphone permissions: ${error.message}`,
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

/**
 * Event handler for app ready state
 * @returns {Promise<void>}
 */
app.on("ready", async () => {
  await checkMediaPermissions();
  await initialize();
  await createTray();
});

/**
 * Event handler for update installation
 * @returns {Promise<void>}
 */
ipcMain.handle("update-installed", async () => {
  logMessage("Update installed, updating Python environment");
  await checkPythonEnvironment();
});

/**
 * IPC handler for save file dialog
 * @param {Electron.IpcMainInvokeEvent} _event - The IPC event
 * @param {{buffer: Buffer, defaultPath: string, filters?: Array<{name: string, extensions: string[]}>}} options - Save options
 * @returns {Promise<{success: boolean, filePath?: string, canceled?: boolean, error?: string}>}
 */
ipcMain.handle(
  "save-file",
  async (_event, { buffer, defaultPath, filters }) => {
    try {
      const { filePath, canceled } = await dialog.showSaveDialog({
        defaultPath,
        filters: filters || [{ name: "All Files", extensions: ["*"] }],
      });

      if (!canceled && filePath) {
        await fs.promises.writeFile(filePath, Buffer.from(buffer));
        return { success: true, filePath };
      }
      return { success: false, canceled: true };
    } catch (error) {
      logMessage(`Save file error: ${error.message}`, "error");
      return { success: false, error: error.message };
    }
  }
);

/**
 * Event handler for app quit
 * @param {Electron.Event} event - The quit event
 * @returns {void}
 */
app.on("before-quit", (event) => {
  if (!isAppQuitting) {
    isAppQuitting = true;
    gracefulShutdown();
  }
});

app.on("window-all-closed", function () {
  logMessage("All windows closed");
  if (process.platform !== "darwin") {
    logMessage("Quitting app (not on macOS)");
    app.quit();
  }
});

app.on("activate", function () {
  logMessage("App activated");
  const mainWindow = getMainWindow();
  if (mainWindow === null) {
    logMessage("Creating new window on activate");
    createWindow();
  }
});

// IPC handlers
/**
 * IPC handler to get the current server state
 * @returns {Object} The current server state
 */
ipcMain.handle("get-server-state", () => {
  console.log("Getting server state: " + JSON.stringify(serverState));
  return serverState;
});
/**
 * IPC handler to get the log file path
 * @returns {string} The path to the log file
 */
ipcMain.handle("get-log-file-path", () => LOG_FILE);
/**
 * IPC handler to open the log file in the system's file explorer
 * @returns {void}
 */
ipcMain.handle("open-log-file", () => {
  shell.showItemInFolder(LOG_FILE);
});

/**
 * Global error handler for uncaught exceptions
 * @param {Error} error - The uncaught exception
 * @returns {void}
 */
process.on("uncaughtException", (error) => {
  logMessage(`Uncaught Exception: ${error.message}`, "error");
  logMessage(`Stack Trace: ${error.stack}`, "error");
  forceQuit(`Uncaught Exception: ${error.message}`);
});

/**
 * Global error handler for unhandled promise rejections
 * @param {unknown} reason - The reason for the rejection
 * @param {unknown} promise - The promise that was rejected
 * @returns {void}
 */
process.on("unhandledRejection", (reason, promise) => {
  const errorMessage =
    reason instanceof Error ? reason.message : String(reason);
  logMessage(`Unhandled Promise Rejection: ${errorMessage}`, "error");
  if (reason instanceof Error) {
    logMessage(`Stack Trace: ${reason.stack}`, "error");
  }
  forceQuit(`Unhandled Promise Rejection: ${errorMessage}`);
});

// Update the IPC handlers to use the new isWorkflowWindow function
ipcMain.on("CLOSE-APP", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window && isWorkflowWindow(window)) {
    window.close();
  }
});

ipcMain.on("MINIMIZE-APP", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window && isWorkflowWindow(window)) {
    window.minimize();
  }
});

ipcMain.on("MAXIMIZE-APP", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window && isWorkflowWindow(window)) {
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  }
});
