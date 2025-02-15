import { ipcMain, BrowserWindow, clipboard } from "electron";
import { getServerState, openLogFile, runApp } from "./server";
import { dialog } from "electron";
import { logMessage } from "./logger";
import fs from "fs";
import { IpcChannels, IpcEvents, IpcResponse } from "./types.d";
import { IpcRequest } from "./types.d";

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
    return await getServerState();
  });

  createIpcMainHandler(IpcChannels.OPEN_LOG_FILE, async () => {
    await openLogFile();
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

  // Add save file handler
  createIpcMainHandler(
    IpcChannels.SAVE_FILE,
    async (_event, { buffer, defaultPath, filters }) => {
      try {
        const { filePath, canceled } = await dialog.showSaveDialog({
          defaultPath,
          filters: filters || [{ name: "All Files", extensions: ["*"] }],
        });

        if (!canceled && filePath) {
          await fs.promises.writeFile(filePath, Buffer.from(buffer));
          return { success: true, filePath };
        }
        return { success: false, canceled: true };
      } catch (error) {
        logMessage(`Save file error: ${(error as Error).message}`, "error");
        return { success: false, error: (error as Error).message };
      }
    }
  );
}
