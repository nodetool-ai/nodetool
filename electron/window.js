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

  window.webContents.on("before-input-event", (event, input) => {
    if (
      (input.control || input.meta) &&
      input.shift &&
      input.key.toLowerCase() === "i"
    ) {
      if (window.webContents.isDevToolsOpened()) {
        window.webContents.closeDevTools();
      } else {
        window.webContents.openDevTools();
      }
    }
  });

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
  // Define allowed permissions at the top
  const allowedPermissions = ["media", "enumerate-devices", "mediaKeySystem"];

  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      logMessage(
        `Permission requested: ${permission} from ${details.requestingUrl}`
      );
      console.log(`Permission details:`, { permission, details });

      // Special handling for media permissions
      if (permission === allowedPermissions[0]) {
        logMessage(`Granting media permission with all capabilities`);
        callback(true);
        return;
      }

      if (allowedPermissions.includes(permission)) {
        logMessage(`Granting permission: ${permission}`);
        callback(true);
        return;
      }

      // Only log specific permission denials
      if (!allowedPermissions.includes(permission)) {
        logMessage(`Denying permission: ${permission}`);
        console.log("Permission denied:", { permission, details });
      }
      callback(false);
    }
  );

  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin) => {
      // Always allow
      if (
        permission === allowedPermissions[0] ||
        permission === allowedPermissions[1]
      ) {
        return true;
      }

      return allowedPermissions.includes(permission);
    }
  );

  logMessage("Permission handlers initialized with device enumeration support");
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
