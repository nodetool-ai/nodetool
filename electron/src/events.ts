import { BrowserWindow } from "electron";
import { ServerState, getMainWindow, serverState } from "./state";

/**
 * Emit a boot message to the renderer process
 * @param {string} message - The boot message to emit
 */
function emitBootMessage(message: string): void {
  serverState.bootMsg = message;
  const mainWindow: BrowserWindow | null = getMainWindow();
  if (mainWindow) {
    mainWindow.webContents.send("boot-message", message);
  }
}

/**
 * Emit server started event to the renderer process
 */
function emitServerStarted(): void {
  serverState.isStarted = true;
  const mainWindow: BrowserWindow | null = getMainWindow();
  if (mainWindow) {
    mainWindow.webContents.send("server-started");
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
    mainWindow.webContents.send("server-log", message);
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
    mainWindow.webContents.send("update-progress", {
      componentName,
      progress,
      action,
      eta,
    } as UpdateProgressPayload);
  }
}

export {
  emitBootMessage,
  emitServerStarted,
  emitServerLog,
  emitUpdateProgress,
};
