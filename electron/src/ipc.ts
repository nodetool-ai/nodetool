import { ipcMain, BrowserWindow, clipboard, globalShortcut } from "electron";
import { getServerState, openLogFile, runApp } from "./server";
import { logMessage } from "./logger";
import { IpcChannels, IpcEvents, IpcResponse } from "./types.d";
import { IpcRequest } from "./types.d";
import { registerWorkflowShortcut } from "./shortcuts";
import { updateTrayMenu } from "./tray";

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

export type IpcMainHandler<T extends keyof IpcRequest> = (
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

  // App control handlers
  createIpcMainHandler(IpcChannels.RUN_APP, async (_event, workflowId) => {
    logMessage(`Running app with workflow ID: ${workflowId}`);
    await runApp(workflowId);
  });

  //   createIpcMainHandler(IpcChannels.INSTALL_UPDATE, async () => {
  //     await installUpdate();
  //   });

  // Window control handlers
  createIpcMainHandler(IpcChannels.WINDOW_CLOSE, async () => {
    BrowserWindow.getFocusedWindow()?.close();
  });

  createIpcMainHandler(IpcChannels.WINDOW_MINIMIZE, async () => {
    BrowserWindow.getFocusedWindow()?.minimize();
  });

  createIpcMainHandler(IpcChannels.WINDOW_MAXIMIZE, async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
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
}
