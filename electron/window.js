const { BrowserWindow, session, dialog } = require("electron");
const path = require("path");
const { logMessage } = require("./logger");
const { setMainWindow } = require("./state");
const { app } = require("electron");

/**
 * Create the main application window.
 */
function createWindow() {
  logMessage("Creating main window");
  const window = new BrowserWindow({
    width: 1500,
    height: 1000,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: true,
    },
  });

  window.setBackgroundColor("#111111");
  window.loadFile("index.html");
  logMessage("index.html loaded into main window");

  window.on("closed", function () {
    logMessage("Main window closed");
    setMainWindow(null);
  });

  initializePermissionHandlers();
  setMainWindow(window);

  return window;
}

/**
 * Set permission handlers for Electron sessions.
 */
function initializePermissionHandlers() {
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      callback(true); // Grant all permissions
    }
  );
  session.defaultSession.setPermissionCheckHandler(() => true);
  logMessage("Permission handlers initialized");
}

/**
 * Force quit the application with error message.
 */
function forceQuit(errorMessage) {
  logMessage(`Force quitting application: ${errorMessage}`, "error");
  dialog.showErrorBox("Critical Error", errorMessage);
  process.exit(1);
}

module.exports = {
  createWindow,
  forceQuit,
};
