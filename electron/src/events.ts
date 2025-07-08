import { BrowserWindow } from "electron";
import { getMainWindow, serverState } from "./state";
import { IpcChannels, UpdateProgressData } from "./types.d";

/**
 * Emit a boot message to the renderer process
 * @param {string} message - The boot message to emit
 */
function emitBootMessage(message: string): void {
  serverState.bootMsg = message;
  const mainWindow: BrowserWindow | null = getMainWindow();
  if (mainWindow) {
    mainWindow.webContents.send(IpcChannels.BOOT_MESSAGE, message);
  }
}

/**
 * Emit server started event to the renderer process
 */
function emitServerStarted(): void {
  serverState.isStarted = true;
  const mainWindow: BrowserWindow | null = getMainWindow();
  if (mainWindow) {
    mainWindow.webContents.send(IpcChannels.SERVER_STARTED);
  }
}

/**
 * Emit a server log message to the renderer process
 * @param {string} message - The log message to emit
 */
function emitServerLog(message: string): void {
  serverState.logs.push(message);
  const mainWindow: BrowserWindow | null = getMainWindow();
  if (mainWindow) {
    mainWindow.webContents.send(IpcChannels.SERVER_LOG, message);
  }
}

interface UpdateProgressPayload {
  componentName: string;
  progress: number;
  action: string;
  eta?: string;
}

/**
 * Emit update progress to the renderer process
 * @param {string} componentName - Name of the component being updated
 * @param {number} progress - Progress percentage (0-100)
 * @param {string} action - Current action being performed
 * @param {string} [eta] - Estimated time remaining
 */
function emitUpdateProgress(
  componentName: string,
  progress: number,
  action: string,
  eta?: string
): void {
  const mainWindow: BrowserWindow | null = getMainWindow();
  if (mainWindow) {
    mainWindow.webContents.send(IpcChannels.UPDATE_PROGRESS, {
      componentName,
      progress,
      action,
      eta,
    } satisfies UpdateProgressData);
  }
}

/**
 * Emit show package manager event to the renderer process
 */
function emitShowPackageManager(): void {
  const mainWindow: BrowserWindow | null = getMainWindow();
  if (mainWindow) {
    mainWindow.webContents.send(IpcChannels.SHOW_PACKAGE_MANAGER);
  }
}

export {
  emitBootMessage,
  emitServerStarted,
  emitServerLog,
  emitUpdateProgress,
  emitShowPackageManager,
};
