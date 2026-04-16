import { BrowserWindow } from "electron";
import { serverState } from "./state";
import { IpcChannels, UpdateProgressData } from "./types.d";
import { logMessage } from "./logger";

/** Send a message to all non-destroyed renderer windows */
function broadcastToWindows(channel: string, ...args: unknown[]): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) {
      w.webContents.send(channel, ...args);
    }
  }
}

function emitBootMessage(message: string): void {
  serverState.bootMsg = message;
  broadcastToWindows(IpcChannels.BOOT_MESSAGE, message);
}

function emitServerStarted(): void {
  serverState.isStarted = true;
  serverState.status = "started";
  serverState.error = undefined;
  broadcastToWindows(IpcChannels.SERVER_STARTED);
}

const MAX_LOGS = 5000;

function emitServerLog(message: string): void {
  serverState.logs.push(message);
  if (serverState.logs.length > MAX_LOGS) {
    serverState.logs = serverState.logs.slice(-MAX_LOGS);
  }
  logMessage(message);
  broadcastToWindows(IpcChannels.SERVER_LOG, message);
}

function emitServerError(message: string): void {
  serverState.status = "error";
  serverState.isStarted = false;
  serverState.error = message;
  serverState.bootMsg = message;
  broadcastToWindows(IpcChannels.SERVER_ERROR, { message });
}

function emitUpdateProgress(
  componentName: string,
  progress: number,
  action: string,
  eta?: string
): void {
  broadcastToWindows(IpcChannels.UPDATE_PROGRESS, {
    componentName,
    progress,
    action,
    eta,
  } satisfies UpdateProgressData);
}

function emitShowPackageManager(): void {
  logMessage("Sending SHOW_PACKAGE_MANAGER to renderer");
  broadcastToWindows(IpcChannels.SHOW_PACKAGE_MANAGER);
}

export {
  emitBootMessage,
  emitServerStarted,
  emitServerLog,
  emitServerError,
  emitUpdateProgress,
  emitShowPackageManager,
};
