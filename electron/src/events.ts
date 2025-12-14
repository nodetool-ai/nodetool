import { BrowserWindow } from "electron";
import { getMainWindow, serverState } from "./state";
import { IpcChannels, UpdateProgressData } from "./types.d";
import { logMessage } from "./logger";

/**
 * Emit a boot message to the renderer process
 * @param {string} message - The boot message to emit
 */
function emitBootMessage(message: string): void {
  serverState.bootMsg = message;
  const mainWindow: BrowserWindow | null = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IpcChannels.BOOT_MESSAGE, message);
  } else {
    logMessage("No main window available to send boot message");
  }
}

/**
 * Emit server started event to the renderer process
 */
function emitServerStarted(): void {
  serverState.isStarted = true;
  serverState.status = "started";
  serverState.error = undefined;
  const mainWindow: BrowserWindow | null = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IpcChannels.SERVER_STARTED);
  }
}

/**
 * Emit a server log message to the renderer process and write to log file
 * @param {string} message - The log message to emit
 */
function emitServerLog(message: string): void {
  serverState.logs.push(message);
  // Note: Writing to log file is handled by the Watchdog onOutput callback
  // We don't call logMessage here to avoid circular dependency
  const mainWindow: BrowserWindow | null = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IpcChannels.SERVER_LOG, message);
  }
}

function emitServerError(message: string): void {
  serverState.status = "error";
  serverState.isStarted = false;
  serverState.error = message;
  serverState.bootMsg = message;
  const mainWindow: BrowserWindow | null = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IpcChannels.SERVER_ERROR, { message });
  } else {
    logMessage("No main window available to send server error");
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
  if (mainWindow && !mainWindow.isDestroyed()) {
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
  if (mainWindow && !mainWindow.isDestroyed()) {
    logMessage("Sending SHOW_PACKAGE_MANAGER to renderer");
    mainWindow.webContents.send(IpcChannels.SHOW_PACKAGE_MANAGER);
  } else {
    logMessage("No main window available to send SHOW_PACKAGE_MANAGER");
  }
}

export {
  emitBootMessage,
  emitServerStarted,
  emitServerLog,
  emitServerError,
  emitUpdateProgress,
  emitShowPackageManager,
};
