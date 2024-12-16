const { app, ipcMain, dialog, shell, systemPreferences } = require("electron");
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

/** @type {boolean} */
let isAppQuitting = false;

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

// Application event handlers
app.on("ready", async () => {
  if (process.platform === "win32" || process.platform === "darwin") {
    try {
      // Request microphone access on Windows and macOS
      const microphoneStatus =
        systemPreferences.getMediaAccessStatus("microphone");
      if (microphoneStatus !== "granted") {
        await systemPreferences.askForMediaAccess("microphone");
      }
    } catch (error) {
      logMessage(
        `Error requesting microphone access: ${error.message}`,
        "error"
      );
    }
  }

  // Continue with rest of initialization
  initialize();
});

// Handle update events
ipcMain.handle("update-installed", async () => {
  logMessage("Update installed, updating Python environment");
  await checkPythonEnvironment();
});

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
