import {
  ipcMain,
  BrowserWindow,
  clipboard,
  globalShortcut,
  shell,
} from "electron";
import {
  getServerState,
  openLogFile,
  showItemInFolder,
  runApp,
  initializeBackendServer,
  stopServer,
  restartLlamaServer,
} from "./server";
import { logMessage } from "./logger";
import { IpcChannels, IpcEvents, IpcResponse, WindowCloseAction } from "./types.d";
import { readSettings, updateSetting } from "./settings";
import { createPackageManagerWindow } from "./window";
import { IpcRequest } from "./types.d";
import { registerWorkflowShortcut, setupWorkflowShortcuts } from "./shortcuts";
import { emitWorkflowsChanged, emitServerStateChanged } from "./tray";
import {
  fetchAvailablePackages,
  listInstalledPackages,
  installPackage,
  uninstallPackage,
  updatePackage,
  validateRepoId,
  searchNodes,
  checkExpectedPackageVersions,
} from "./packageManager";
import { openModelDirectory, openPathInExplorer, openSystemDirectory } from "./fileExplorer";
import { exportDebugBundle } from "./debug";

/**
 * This module handles Inter-Process Communication (IPC) between the Electron main process
 * and renderer processes. It provides type-safe wrappers for IPC handlers and initializes
 * all IPC channels used by the application.
 *
 * Key features:
 * - Type-safe IPC handler creation using TypeScript generics
 * - Centralized initialization of all IPC channels
 * - Handlers for:
 *   - Clipboard operations (read/write)
 *   - Server state management
 *   - Application control (run, update)
 *   - Window controls (close, minimize, maximize)
 *   - File operations (save)
 *
 * The IPC system ensures secure and typed communication between the isolated renderer
 * process and the privileged main process, following Electron's security best practices.
 */

export type IpcMainHandler<T extends keyof IpcRequest & keyof IpcResponse> = (
  event: Electron.IpcMainInvokeEvent,
  data: IpcRequest[T]
) => Promise<IpcResponse[T]>;

export type IpcOnceHandler<T extends keyof IpcEvents> = (
  event: Electron.IpcMainInvokeEvent,
  data: IpcEvents[T]
) => Promise<void>;

// Channels that should have their payloads redacted for security
const SENSITIVE_CHANNELS = ['clipboard:write-text', 'clipboard:read-text'];

/**
 * Type-safe wrapper for IPC main handlers with logging
 */
export function createIpcMainHandler<T extends keyof IpcRequest>(
  channel: T,
  handler: IpcMainHandler<T>
): void {
  try {
    // Ensure idempotent registration to avoid "Attempted to register a second handler" errors
    ipcMain.removeHandler(channel as string);
  } catch (error) {
    // Best-effort cleanup; continue with handler registration
    logMessage(
      `Warning removing existing IPC handler for ${String(channel)}: ${String(
        error
      )}`,
      "warn"
    );
  }

  // Wrap the handler with logging
  const wrappedHandler: IpcMainHandler<T> = async (event, data) => {
    const startTime = Date.now();
    const channelStr = String(channel);
    const isSensitive = SENSITIVE_CHANNELS.includes(channelStr);

    // Log incoming request
    if (isSensitive) {
      logMessage(`IPC → ${channelStr} (payload redacted)`);
    } else {
      const payloadStr = data !== undefined ? JSON.stringify(data) : 'undefined';
      const truncatedPayload = payloadStr.length > 200 
        ? payloadStr.substring(0, 200) + '...' 
        : payloadStr;
      logMessage(`IPC → ${channelStr}: ${truncatedPayload}`);
    }

    try {
      const result = await handler(event, data);
      const duration = Date.now() - startTime;
      logMessage(`IPC ← ${channelStr} OK (${duration}ms)`);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logMessage(`IPC ← ${channelStr} ERROR (${duration}ms): ${String(error)}`, "error");
      throw error;
    }
  };

  ipcMain.handle(channel, wrappedHandler);
}

/**
 * Type-safe wrapper for IPC once handlers with logging
 */
export function createIpcOnceHandler<T extends keyof IpcEvents>(
  channel: T,
  handler: IpcOnceHandler<T>
): void {
  const wrappedHandler: IpcOnceHandler<T> = async (event, data) => {
    const channelStr = String(channel);
    logMessage(`IPC (once) → ${channelStr}`);
    try {
      await handler(event, data);
      logMessage(`IPC (once) ← ${channelStr} OK`);
    } catch (error) {
      logMessage(`IPC (once) ← ${channelStr} ERROR: ${String(error)}`, "error");
      throw error;
    }
  };
  ipcMain.once(channel as string, wrappedHandler);
}

/**
 * Initialize all IPC handlers for the main process
 */
export function initializeIpcHandlers(): void {
  logMessage("Initializing IPC handlers", "info");

  // Clipboard handlers
  createIpcMainHandler(
    IpcChannels.CLIPBOARD_WRITE_TEXT,
    async (_event, data) => {
      clipboard.writeText(data.text, data.type);
    }
  );

  createIpcMainHandler(IpcChannels.CLIPBOARD_READ_TEXT, async (_event, type) => {
    return clipboard.readText(type);
  });

  createIpcMainHandler(
    IpcChannels.CLIPBOARD_WRITE_IMAGE,
    async (_event, data) => {
      const { nativeImage } = await import("electron");
      const image = nativeImage.createFromDataURL(data.dataUrl);
      clipboard.writeImage(image, data.type);
    }
  );

  createIpcMainHandler(IpcChannels.CLIPBOARD_READ_IMAGE, async (_event, type) => {
    const image = clipboard.readImage(type);
    return image.toDataURL();
  });

  createIpcMainHandler(IpcChannels.CLIPBOARD_READ_HTML, async (_event, type) => {
    return clipboard.readHTML(type);
  });

  createIpcMainHandler(
    IpcChannels.CLIPBOARD_WRITE_HTML,
    async (_event, data) => {
      clipboard.writeHTML(data.markup, data.type);
    }
  );

  createIpcMainHandler(IpcChannels.CLIPBOARD_READ_RTF, async (_event, type) => {
    return clipboard.readRTF(type);
  });

  createIpcMainHandler(
    IpcChannels.CLIPBOARD_WRITE_RTF,
    async (_event, data) => {
      clipboard.writeRTF(data.text, data.type);
    }
  );

  createIpcMainHandler(IpcChannels.CLIPBOARD_READ_BOOKMARK, async () => {
    return clipboard.readBookmark();
  });

  createIpcMainHandler(
    IpcChannels.CLIPBOARD_WRITE_BOOKMARK,
    async (_event, data) => {
      clipboard.writeBookmark(data.title, data.url, data.type);
    }
  );

  createIpcMainHandler(IpcChannels.CLIPBOARD_READ_FIND_TEXT, async () => {
    return clipboard.readFindText();
  });

  createIpcMainHandler(
    IpcChannels.CLIPBOARD_WRITE_FIND_TEXT,
    async (_event, text) => {
      clipboard.writeFindText(text);
    }
  );

  createIpcMainHandler(IpcChannels.CLIPBOARD_CLEAR, async (_event, type) => {
    clipboard.clear(type);
  });

  createIpcMainHandler(
    IpcChannels.CLIPBOARD_AVAILABLE_FORMATS,
    async (_event, type) => {
      return clipboard.availableFormats(type);
    }
  );

  // Server state handlers
  createIpcMainHandler(IpcChannels.GET_SERVER_STATE, async () => {
    return getServerState();
  });

  createIpcMainHandler(IpcChannels.OPEN_LOG_FILE, async () => {
    openLogFile();
  });

  createIpcMainHandler(
    IpcChannels.SHOW_ITEM_IN_FOLDER,
    async (_event, fullPath) => {
      showItemInFolder(fullPath);
    }
  );

  createIpcMainHandler(
    IpcChannels.FILE_EXPLORER_OPEN_PATH,
    async (_event, request) => {
      return openPathInExplorer(request.path);
    }
  );

  createIpcMainHandler(
    IpcChannels.FILE_EXPLORER_OPEN_DIRECTORY,
    async (_event, target) => {
      return openModelDirectory(target);
    }
  );

  createIpcMainHandler(
    IpcChannels.FILE_EXPLORER_OPEN_SYSTEM_DIRECTORY,
    async (_event, target) => {
      return openSystemDirectory(target);
    }
  );

  // Continue to app handler
  createIpcMainHandler(IpcChannels.START_SERVER, async () => {
    logMessage("User continued to app from package manager");
    await initializeBackendServer();
    logMessage("Setting up workflow shortcuts after server start...");
    await setupWorkflowShortcuts();
  });

  // Restart server handler
  createIpcMainHandler(IpcChannels.RESTART_SERVER, async () => {
    logMessage("Restarting backend server by user request");
    try {
      await stopServer();
    } catch (e) {
      logMessage(`Error while stopping server for restart: ${e}`, "warn");
    }
    // Small delay to ensure ports and resources are released before restart
    await new Promise((resolve) => setTimeout(resolve, 300));
    await initializeBackendServer();
    await setupWorkflowShortcuts();
  });

  // Restart llama-server handler (used after downloading new models)
  createIpcMainHandler(IpcChannels.RESTART_LLAMA_SERVER, async () => {
    logMessage("Restarting llama-server to pick up new models");
    await restartLlamaServer();
  });

  // App control handlers
  createIpcMainHandler(IpcChannels.RUN_APP, async (_event, workflowId) => {
    logMessage(`Running app with workflow ID: ${workflowId}`);
    await runApp(workflowId);
  });

  // Show Package Manager window
  createIpcMainHandler(
    IpcChannels.SHOW_PACKAGE_MANAGER,
    async (_event, nodeSearch) => {
      logMessage(
        `Opening Package Manager window${
          nodeSearch ? ` with search: ${nodeSearch}` : ""
        }`
      );
      createPackageManagerWindow(nodeSearch);
    }
  );

  //   createIpcMainHandler(IpcChannels.INSTALL_UPDATE, async () => {
  //     await installUpdate();
  //   });

  // Window control handlers
  ipcMain.on(IpcChannels.WINDOW_CLOSE, (event) => {
    try {
      const window = BrowserWindow.getFocusedWindow();
      if (window) {
        window.close();
      }
    } catch (error) {
      logMessage(`Error in window close: ${error}`, "error");
    }
  });

  ipcMain.on(IpcChannels.WINDOW_MINIMIZE, (event) => {
    try {
      const window = BrowserWindow.getFocusedWindow();
      if (window) {
        window.minimize();
      }
    } catch (error) {
      logMessage(`Error in window minimize: ${error}`, "error");
    }
  });

  ipcMain.on(IpcChannels.WINDOW_MAXIMIZE, (event) => {
    try {
      const window = BrowserWindow.getFocusedWindow();
      if (window) {
        if (window.isMaximized()) {
          window.unmaximize();
        } else {
          window.maximize();
        }
      }
    } catch (error) {
      logMessage(`Error in window maximize: ${error}`, "error");
    }
  });

  createIpcMainHandler(
    IpcChannels.ON_CREATE_WORKFLOW,
    async (event, workflow) => {
      logMessage(`Creating workflow: ${workflow.name}`);
      registerWorkflowShortcut(workflow);
      emitWorkflowsChanged();
    }
  );

  createIpcMainHandler(
    IpcChannels.ON_UPDATE_WORKFLOW,
    async (event, workflow) => {
      logMessage(`Updating workflow: ${workflow.name}`);
      registerWorkflowShortcut(workflow);
      emitWorkflowsChanged();
    }
  );

  createIpcMainHandler(
    IpcChannels.ON_DELETE_WORKFLOW,
    async (event, workflow) => {
      logMessage(`Deleting workflow: ${workflow.name}`);
      if (workflow.settings?.shortcut) {
        globalShortcut.unregister(workflow.settings.shortcut);
      }
      emitWorkflowsChanged();
    }
  );

  // Package manager handlers
  createIpcMainHandler(IpcChannels.PACKAGE_LIST_AVAILABLE, async () => {
    logMessage("Fetching available packages");
    return await fetchAvailablePackages();
  });

  createIpcMainHandler(IpcChannels.PACKAGE_LIST_INSTALLED, async () => {
    logMessage("Listing installed packages");
    return await listInstalledPackages();
  });

  createIpcMainHandler(IpcChannels.PACKAGE_INSTALL, async (_event, request) => {
    logMessage(`Installing package: ${request.repo_id}`);
    const validation = validateRepoId(request.repo_id);
    if (!validation.valid) {
      return {
        success: false,
        message: validation.error || "Invalid repository ID",
      };
    }
    return await installPackage(request.repo_id);
  });

  createIpcMainHandler(
    IpcChannels.PACKAGE_UNINSTALL,
    async (_event, request) => {
      logMessage(`Uninstalling package: ${request.repo_id}`);
      const validation = validateRepoId(request.repo_id);
      if (!validation.valid) {
        return {
          success: false,
          message: validation.error || "Invalid repository ID",
        };
      }
      return await uninstallPackage(request.repo_id);
    }
  );

  createIpcMainHandler(IpcChannels.PACKAGE_UPDATE, async (_event, repoId) => {
    logMessage(`Updating package: ${repoId}`);
    const validation = validateRepoId(repoId);
    if (!validation.valid) {
      return {
        success: false,
        message: validation.error || "Invalid repository ID",
      };
    }
    return await updatePackage(repoId);
  });

  createIpcMainHandler(
    IpcChannels.PACKAGE_SEARCH_NODES,
    async (_event, query) => {
      try {
        const results = await searchNodes(query || "");
        return results;
      } catch (e) {
        logMessage(`Error in PACKAGE_SEARCH_NODES: ${String(e)}`, "warn");
        return [];
      }
    }
  );

  createIpcMainHandler(
    IpcChannels.PACKAGE_OPEN_EXTERNAL,
    async (_event, url) => {
      logMessage(`Opening external URL: ${url}`);
      shell.openExternal(url);
    }
  );

  // Package version check handler
  createIpcMainHandler(IpcChannels.PACKAGE_VERSION_CHECK, async () => {
    logMessage("Checking expected package versions");
    return await checkExpectedPackageVersions();
  });

  // Log viewer handlers
  createIpcMainHandler(IpcChannels.GET_LOGS, async () => {
    logMessage("Getting server logs");
    return getServerState().logs;
  });

  createIpcMainHandler(IpcChannels.CLEAR_LOGS, async () => {
    logMessage("Clearing server logs");
    getServerState().logs = [];
  });

  createIpcMainHandler(IpcChannels.CHECK_OLLAMA_INSTALLED, async () => {
    // Lazy import to avoid circular deps if any
    const { isOllamaInstalled } = await import("./python");
    return await isOllamaInstalled();
  });

  // Shell module handlers
  createIpcMainHandler(
    IpcChannels.SHELL_SHOW_ITEM_IN_FOLDER,
    async (_event, fullPath) => {
      logMessage(`Showing item in folder: ${fullPath}`);
      shell.showItemInFolder(fullPath);
    }
  );

  createIpcMainHandler(IpcChannels.SHELL_OPEN_PATH, async (_event, path) => {
    logMessage(`Opening path: ${path}`);
    const errorMessage = await shell.openPath(path);
    return errorMessage;
  });

  createIpcMainHandler(
    IpcChannels.SHELL_OPEN_EXTERNAL,
    async (_event, request) => {
      logMessage(`Opening external URL: ${request.url}`);
      await shell.openExternal(request.url, request.options);
    }
  );

  createIpcMainHandler(IpcChannels.SHELL_TRASH_ITEM, async (_event, path) => {
    logMessage(`Moving to trash: ${path}`);
    await shell.trashItem(path);
  });

  createIpcMainHandler(IpcChannels.SHELL_BEEP, async () => {
    shell.beep();
  });

  createIpcMainHandler(
    IpcChannels.SHELL_WRITE_SHORTCUT_LINK,
    async (_event, request) => {
      if (process.platform !== "win32") {
        logMessage("Shortcut links are only supported on Windows", "warn");
        return false;
      }
      logMessage(`Writing shortcut: ${request.shortcutPath}`);
      return shell.writeShortcutLink(
        request.shortcutPath,
        request.operation || "create",
        request.options || { target: "" }
      );
    }
  );

  createIpcMainHandler(
    IpcChannels.SHELL_READ_SHORTCUT_LINK,
    async (_event, shortcutPath) => {
      if (process.platform !== "win32") {
        logMessage("Shortcut links are only supported on Windows", "warn");
        throw new Error("Shortcut links are only supported on Windows");
      }
      logMessage(`Reading shortcut: ${shortcutPath}`);
      return shell.readShortcutLink(shortcutPath);
    }
  );

  // Settings handlers
  createIpcMainHandler(
    IpcChannels.SETTINGS_GET_CLOSE_BEHAVIOR,
    async () => {
      const settings = readSettings();
      const action = settings.windowCloseAction as WindowCloseAction | undefined;
      return action || "ask";
    }
  );

  createIpcMainHandler(
    IpcChannels.SETTINGS_SET_CLOSE_BEHAVIOR,
    async (_event, action) => {
      logMessage(`Setting window close behavior to: ${action}`);
      updateSetting("windowCloseAction", action);
      emitServerStateChanged();
    }
  );

  createIpcMainHandler(IpcChannels.GET_SYSTEM_INFO, async () => {
    const { getSystemInfo } = await import("./systemInfo");
    return await getSystemInfo();
  });

  createIpcMainHandler(
    IpcChannels.DEBUG_EXPORT_BUNDLE,
    async (_event, request) => {
      logMessage("Exporting debug bundle");
      return await exportDebugBundle(request);
    }
  );
}
