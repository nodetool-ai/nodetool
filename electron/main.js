const { app, ipcMain, dialog } = require("electron");
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
const { shell } = require("electron");
const { emitBootMessage } = require("./events");

let isAppQuitting = false;

async function checkPythonEnvironment(shouldUpdate = false) {
  emitBootMessage("Checking for Python environment...");
  const hasCondaEnv = await isCondaEnvironmentInstalled();

  if (!hasCondaEnv) {
    await installCondaEnvironment();
  } else if (shouldUpdate) {
    await updateCondaEnvironment();
  }
}

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
  await checkPythonEnvironment(false);

  emitBootMessage("Starting NodeTool server...");
  await initializeBackendServer();
}

// Application event handlers
app.on("ready", initialize);

// Handle update events
ipcMain.handle("update-installed", async () => {
  logMessage("Update installed, checking and updating Python environment");
  await checkPythonEnvironment(true);
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
  if (mainWindow === null) {
    logMessage("Creating new window on activate");
    createWindow();
  }
});

// IPC handlers
ipcMain.handle("get-server-state", () => serverState);
ipcMain.handle("get-log-file-path", () => LOG_FILE);
ipcMain.handle("open-log-file", () => {
  shell.showItemInFolder(LOG_FILE);
});

// Global error handlers
process.on("uncaughtException", (error) => {
  logMessage(`Uncaught Exception: ${error.message}`, "error");
  logMessage(`Stack Trace: ${error.stack}`, "error");
  forceQuit(`Uncaught Exception: ${error.message}`);
});

process.on("unhandledRejection", (reason, promise) => {
  const errorMessage =
    reason instanceof Error ? reason.message : String(reason);
  logMessage(`Unhandled Promise Rejection: ${errorMessage}`, "error");
  logMessage(
    `Stack Trace: ${reason.stack || "No stack trace available"}`,
    "error"
  );
  forceQuit(`Unhandled Promise Rejection: ${errorMessage}`);
});
