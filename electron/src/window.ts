import { app, BrowserWindow, session, dialog, WebContents } from "electron";
import { setMainWindow, getMainWindow, serverState } from "./state";
import { IpcChannels } from "./types.d";
import path from "path";
import { logMessage } from "./logger";
import { isAppQuitting } from "./main";
import { isElectronDevMode, getWebDevServerUrl } from "./devMode";
import { hardenWebContents, isTrustedAppOrigin } from "./windowSecurity";

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
  const existingWindow = getMainWindow();
  if (existingWindow && !existingWindow.isDestroyed()) {
    existingWindow.focus();
    return existingWindow;
  }

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

  // Harmless for any frame, including third-party embeds.
  const alwaysAllowedPermissions = new Set(["fullscreen", "mediaKeySystem"]);
  // Camera/microphone, device enumeration and clipboard writes are granted
  // only to the app's own pages, never to a third-party <iframe> they embed.
  const appOnlyPermissions = new Set([
    "media",
    "enumerate-devices",
    "clipboard-sanitized-write",
  ]);

  const isPermissionAllowed = (
    permission: string,
    urlOrOrigin: string,
  ): boolean =>
    alwaysAllowedPermissions.has(permission) ||
    (appOnlyPermissions.has(permission) && isTrustedAppOrigin(urlOrOrigin));

  session.defaultSession.setPermissionRequestHandler(
    (
      _webContents: WebContents,
      permission: string,
      callback: (permissionGranted: boolean) => void,
      details: { requestingUrl: string }
    ) => {
      logMessage(
        `Permission requested: ${permission} from ${details.requestingUrl}`
      );
      const granted = isPermissionAllowed(permission, details.requestingUrl);
      logMessage(`${granted ? "Granting" : "Denying"} permission: ${permission}`);
      callback(granted);
    }
  );

  session.defaultSession.setPermissionCheckHandler(
    (
      _webContents: WebContents | null,
      permission: string,
      requestingOrigin: string
    ): boolean => isPermissionAllowed(permission, requestingOrigin)
  );

  // The app's own pages talk to local services (the backend, and in dev the
  // Vite server) across localhost/127.0.0.1 origins. Relax CORS only for
  // requests made by those pages: the requesting frame decides, not the
  // Referer header, which any page can suppress with `referrerpolicy`.
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ["http://localhost:*/*", "http://127.0.0.1:*/*"] },
    (details, callback) => {
      const frameUrl = details.frame?.url;
      if (!frameUrl || !isTrustedAppOrigin(frameUrl)) {
        callback({ responseHeaders: details.responseHeaders });
        return;
      }
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
