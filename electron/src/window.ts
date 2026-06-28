import { app, BrowserWindow, session, dialog, WebContents } from "electron";
import { setMainWindow, getMainWindow, serverState } from "./state";
import { IpcChannels } from "./types.d";
import path from "path";
import { logMessage } from "./logger";
import { isAppQuitting } from "./main";
import { isElectronDevMode, getWebDevServerUrl } from "./devMode";
import { hardenWebContents } from "./windowSecurity";

/**
 * Shared secure webPreferences for all windows.
 *
 * `sandbox: true` runs the renderer in an OS-level sandbox. The preload
 * script must only use `contextBridge` and `ipcRenderer` APIs (no Node built-ins),
 * which is already the case for our preloads.
 *
 * `devTools` is only enabled for unpackaged (dev) builds — production builds
 * must not expose a console that can introspect `window.api` internals.
 */
const secureWebPreferences: Electron.WebPreferences = {
  preload: path.join(__dirname, "preload.js"),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  devTools: !app.isPackaged,
  webSecurity: true,
};

/** Registers the Ctrl/Cmd+Shift+I DevTools toggle on a window */
function registerDevToolsShortcut(window: BrowserWindow): void {
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
}

let permissionHandlersInitialized = false;

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
    webPreferences: { ...secureWebPreferences },
  });

  window.setBackgroundColor("#111111");

  if (isElectronDevMode()) {
    window.loadURL(
      "data:text/html,<html><body style='margin:0;background:#111;color:#ddd;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;'>Starting NodeTool...</body></html>",
    );
  } else {
    window.loadFile(path.join("dist-web", "index.html"));
  }

  registerDevToolsShortcut(window);
  hardenWebContents(window.webContents);

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
 * Creates a window that opens the Log Viewer
 * @returns {BrowserWindow} The created window instance
 */
function createLogViewerWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: { ...secureWebPreferences },
  });

  window.setBackgroundColor("#111111");
  window.loadFile(path.join("dist-web", "pages", "logs.html"));

  registerDevToolsShortcut(window);
  hardenWebContents(window.webContents);
  initializePermissionHandlers();

  return window;
}

/**
 * Opens the Settings page inside the main application window.
 *
 * Settings now live in the main app (the web UI's `/settings` route) rather
 * than a separate window. This shows/focuses the main window and asks the
 * renderer to navigate there via an `openSettings` menu event. If the main
 * window was closed (e.g. "keep running in background"), it is recreated and
 * the event is sent once its contents finish loading.
 */
function openSettingsInMainWindow(): void {
  const existing = getMainWindow();
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) {
      existing.restore();
    }
    existing.show();
    existing.focus();
    existing.webContents.send(IpcChannels.MENU_EVENT, { type: "openSettings" });
    return;
  }

  const window = createWindow();
  window.webContents.once("did-finish-load", () => {
    window.webContents.send(IpcChannels.MENU_EVENT, { type: "openSettings" });
  });
}

/**
 * Set permission handlers for Electron sessions.
 */
function initializePermissionHandlers(): void {
  if (permissionHandlersInitialized) return;
  permissionHandlersInitialized = true;

  // Define allowed permissions at the top
  const allowedPermissions: string[] = [
    "media",
    "enumerate-devices",
    "mediaKeySystem",
    "fullscreen",
  ];
  const clipboardSanitizedWritePermission = "clipboard-sanitized-write";

  const isTrustedLocalBackendUrl = (urlOrOrigin: string): boolean => {
    try {
      const url = new URL(urlOrOrigin);
      const isTrustedHost =
        url.hostname === "127.0.0.1" || url.hostname === "localhost";
      if (url.protocol !== "http:" || !isTrustedHost) {
        return false;
      }

      const trustedPort = String(serverState?.serverPort ?? 7777);
      if (url.port === trustedPort) {
        return true;
      }

      if (!isElectronDevMode()) {
        return false;
      }

      const devUrl = new URL(getWebDevServerUrl());
      return (
        (devUrl.hostname === "127.0.0.1" || devUrl.hostname === "localhost") &&
        url.port === devUrl.port
      );
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

  // Add CORS headers for localhost API requests to allow cross-origin access.
  // This handles the localhost vs 127.0.0.1 mismatch. Restrict to trusted localhost
  // origins only for security - do not use wildcard.
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ["http://localhost:*/*", "http://127.0.0.1:*/*"] },
    (details, callback) => {
      // Only set CORS headers for requests from trusted localhost origins
      const requestingOrigin = details.referrer || "";
      const isTrustedOrigin =
        requestingOrigin.startsWith("http://localhost:") ||
        requestingOrigin.startsWith("http://127.0.0.1:") ||
        requestingOrigin === "" || // Allow requests with no referrer (e.g., same-origin)
        requestingOrigin.startsWith("file://"); // Allow local file requests

      if (isTrustedOrigin) {
        const responseHeaders = { ...details.responseHeaders };
        // For localhost, we can use a wildcard since it's a trusted local environment
        // This handles the localhost vs 127.0.0.1 mismatch correctly
        responseHeaders["Access-Control-Allow-Origin"] = ["*"];
        responseHeaders["Access-Control-Allow-Methods"] = ["GET, POST, PUT, DELETE, OPTIONS"];
        responseHeaders["Access-Control-Allow-Headers"] = ["*"];
        callback({ responseHeaders });
      } else {
        // Don't modify headers for untrusted origins
        callback({ responseHeaders: details.responseHeaders });
      }
    }
  );

  logMessage("Permission handlers initialized with device enumeration support");
}

/**
 * Reload the main window so the web UI reconnects to the (possibly restarted)
 * backend. Used after switching vaults, when the backend has been restarted
 * against a different database and may be on a new port. In dev mode the UI is
 * served by the Vite dev server; in production it loads directly from the
 * backend's URL.
 */
function reloadMainWindow(): void {
  const window = getMainWindow();
  if (!window || window.isDestroyed()) {
    return;
  }
  const timestamp = Date.now();
  const target = isElectronDevMode()
    ? `${getWebDevServerUrl()}/?nocache=${timestamp}`
    : `${serverState.initialURL}/?nocache=${timestamp}`;
  logMessage(`Reloading main window at ${target}`);
  window.loadURL(target);
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

/** @internal Reset the permission-handlers-initialized flag (for tests only). */
function _resetPermissionHandlersForTesting(): void {
  permissionHandlersInitialized = false;
}

export {
  createWindow,
  createLogViewerWindow,
  openSettingsInMainWindow,
  reloadMainWindow,
  forceQuit,
  handleActivation,
  _resetPermissionHandlersForTesting,
};
