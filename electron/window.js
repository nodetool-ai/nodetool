const { BrowserWindow, session, dialog } = require("electron");
const path = require("path");
const { logMessage } = require("./logger");
const { setMainWindow } = require("./state");
const { app } = require("electron");

/**
 * Create the main application window.
 * @returns {BrowserWindow} The main window instance
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
      backgroundThrottling: false,
      devTools: true,
      webSecurity: true,
    },
  });

  window.setBackgroundColor("#111111");
  window.loadFile("index.html");
  logMessage("index.html loaded into main window");

  window.webContents.openDevTools();

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
    (webContents, permission, callback, details) => {
      console.log(`Permission requested: ${permission}`);
      if (permission === "media") {
        console.log("Granting media permission");
        callback(true);
        return;
      }

      // For other permissions, maintain existing behavior
      console.log("Denying permission");
      callback(false);
    }
  );

  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin) => {
      if (permission === "media") {
        return true;
      }
      return false;
    }
  );

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
