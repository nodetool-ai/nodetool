import { BrowserWindow, session, dialog, WebContents } from "electron";
import { setMainWindow, getMainWindow, serverState } from "./state";
import path from "path";
import { logMessage } from "./logger";
import { isAppQuitting } from "./main";
/**
 * Creates the main application window
 * @returns {BrowserWindow} The created window instance
 */
function createWindow(): BrowserWindow {
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
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true,
      webSecurity: true,
    },
    // show: false,
  });

  // set window background color
  window.setBackgroundColor("#111111");

  // Load the index.html
  window.loadFile(path.join("dist-web", "index.html"));

  // DevTools
  // window.webContents.openDevTools();

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
 * Creates a window that opens the app in Package Manager mode
 * Loads: index.html?package-manager
 * @param {string} nodeSearch - Optional search query to prefill node search
 * @returns {BrowserWindow} The created window instance
 */
function createPackageManagerWindow(nodeSearch?: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true,
      webSecurity: true,
    },
  });

  window.setBackgroundColor("#111111");

  // Load the page with optional search query
  if (nodeSearch) {
    window.loadFile(path.join("dist-web", "pages", "packages.html"), {
      query: { nodeSearch }
    });
  } else {
    window.loadFile(path.join("dist-web", "pages", "packages.html"));
  }

  window.webContents.on("before-input-event", (_event, input) => {
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

  initializePermissionHandlers();

  return window;
}

/**
 * Creates a window that opens the Log Viewer
 * Loads: pages/logs.html
 * @returns {BrowserWindow} The created window instance
 */
function createLogViewerWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true,
      webSecurity: true,
    },
  });

  window.setBackgroundColor("#111111");
  window.loadFile(path.join("dist-web", "pages", "logs.html"));

  window.webContents.on("before-input-event", (_event, input) => {
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

  initializePermissionHandlers();

  return window;
}

/**
 * Set permission handlers for Electron sessions.
 */
function initializePermissionHandlers(): void {
  // Define allowed permissions at the top
  const allowedPermissions: string[] = [
    "media",
    "enumerate-devices",
    "mediaKeySystem",
  ];
  const clipboardSanitizedWritePermission = "clipboard-sanitized-write";

  const isTrustedLocalBackendUrl = (urlOrOrigin: string): boolean => {
    try {
      const url = new URL(urlOrOrigin);
      const trustedPort = String(serverState?.serverPort ?? 7777);
      const isTrustedHost =
        url.hostname === "127.0.0.1" || url.hostname === "localhost";
      return url.protocol === "http:" && isTrustedHost && url.port === trustedPort;
    } catch {
      return false;
    }
  };

  session.defaultSession.setPermissionRequestHandler(
    (
      webContents: WebContents,
      permission: string,
      callback: (permissionGranted: boolean) => void,
      details: { requestingUrl: string }
    ) => {
      logMessage(
        `Permission requested: ${permission} from ${details.requestingUrl}`
      );

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

      // Allow sanitized clipboard writes from the trusted local backend/editor origin
      if (
        permission === clipboardSanitizedWritePermission &&
        isTrustedLocalBackendUrl(details.requestingUrl)
      ) {
        logMessage(`Granting permission: ${permission}`);
        callback(true);
        return;
      }

      // Only log specific permission denials
      if (!allowedPermissions.includes(permission)) {
        logMessage(`Denying permission: ${permission}`);
      }
      callback(false);
    }
  );

  session.defaultSession.setPermissionCheckHandler(
    (
      webContents: WebContents | null,
      permission: string,
      requestingOrigin: string
    ): boolean => {
      // Always allow
      if (
        permission === allowedPermissions[0] ||
        permission === allowedPermissions[1]
      ) {
        return true;
      }

      if (
        permission === clipboardSanitizedWritePermission &&
        isTrustedLocalBackendUrl(requestingOrigin)
      ) {
        return true;
      }

      return allowedPermissions.includes(permission);
    }
  );

  // Add CORS headers for localhost API requests to allow cross-origin access
  // This handles the localhost vs 127.0.0.1 mismatch
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ["http://localhost:*/*", "http://127.0.0.1:*/*"] },
    (details, callback) => {
      const responseHeaders = { ...details.responseHeaders };
      responseHeaders["Access-Control-Allow-Origin"] = ["*"];
      responseHeaders["Access-Control-Allow-Methods"] = ["GET, POST, PUT, DELETE, OPTIONS"];
      responseHeaders["Access-Control-Allow-Headers"] = ["*"];
      callback({ responseHeaders });
    }
  );

  logMessage("Permission handlers initialized with device enumeration support");
}

/**
 * Force quit the application with error message.
 */
function forceQuit(errorMessage: string): never {
  logMessage(`Force quitting application: ${errorMessage}`, "error");
  dialog.showErrorBox("Critical Error", errorMessage);
  process.exit(1);
}

/**
 * Handles app activation events
 * @returns {void}
 */
function handleActivation(): void {
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

export {
  createWindow,
  createPackageManagerWindow,
  createLogViewerWindow,
  forceQuit,
  handleActivation,
};
