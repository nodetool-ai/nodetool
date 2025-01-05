const { BrowserWindow, app, session, dialog } = require("electron");
const { setMainWindow, getMainWindow } = require("./state");
const path = require("path");
const { logMessage } = require("./logger");

let isAppQuitting = false;

/**
 * Creates the main application window
 * @returns {BrowserWindow} The created window instance
 */
function createWindow() {
  // Check if window already exists and is not destroyed
  const existingWindow = getMainWindow();
  if (existingWindow && !existingWindow.isDestroyed()) {
    existingWindow.focus();
    return existingWindow;
  }

  // Create new window
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
    show: false,
  });

  // Load the index.html
  window.loadFile(path.join(__dirname, "index.html"));

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
  // Show window when ready
  window.once("ready-to-show", () => {
    window.show();
  });

  // Handle window close
  window.on("close", (event) => {
    if (!isAppQuitting) {
      event.preventDefault();
      window.destroy();
      setMainWindow(null);
    }
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

/**
 * Handles app activation events
 * @returns {void}
 */
function handleActivation() {
  // Get all visible windows (not just existing ones)
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

module.exports = {
  createWindow,
  forceQuit,
  handleActivation,
};
