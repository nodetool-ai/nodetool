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
} from "./server";
import { logMessage } from "./logger";
import { IpcChannels, IpcEvents, IpcResponse } from "./types.d";
import { createPackageManagerWindow } from "./window";
import { IpcRequest } from "./types.d";
import { registerWorkflowShortcut, setupWorkflowShortcuts } from "./shortcuts";
import { updateTrayMenu } from "./tray";
import {
  fetchAvailablePackages,
  listInstalledPackages,
  installPackage,
  uninstallPackage,
  updatePackage,
  validateRepoId,
  searchNodes,
} from "./packageManager";

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

/**
 * Type-safe wrapper for IPC main handlers
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
  ipcMain.handle(channel, handler);
}

/**
 * Type-safe wrapper for IPC once handlers
 */
export function createIpcOnceHandler<T extends keyof IpcEvents>(
  channel: T,
  handler: IpcOnceHandler<T>
): void {
  ipcMain.once(channel as string, handler);
}

/**
 * Initialize all IPC handlers for the main process
 */
export function initializeIpcHandlers(): void {
  logMessage("Initializing IPC handlers", "info");

  createIpcMainHandler(
    IpcChannels.CLIPBOARD_WRITE_TEXT,
    async (event, text) => {
      clipboard.writeText(text);
    }
  );

  createIpcMainHandler(IpcChannels.CLIPBOARD_READ_TEXT, async () => {
    return clipboard.readText();
  });

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
    await initializeBackendServer();
    await setupWorkflowShortcuts();
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
      updateTrayMenu();
    }
  );

  createIpcMainHandler(
    IpcChannels.ON_UPDATE_WORKFLOW,
    async (event, workflow) => {
      logMessage(`Updating workflow: ${workflow.name}`);
      registerWorkflowShortcut(workflow);
      updateTrayMenu();
    }
  );

  createIpcMainHandler(
    IpcChannels.ON_DELETE_WORKFLOW,
    async (event, workflow) => {
      logMessage(`Deleting workflow: ${workflow.name}`);
      if (workflow.settings?.shortcut) {
        globalShortcut.unregister(workflow.settings.shortcut);
      }
      updateTrayMenu();
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
}
