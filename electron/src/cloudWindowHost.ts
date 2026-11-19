/**
 * The cloud window of this launch (D27), over a real `BrowserWindow`. The
 * rules live in `cloudWindow.ts`.
 */
import type { BrowserWindow } from "electron";

import { getCloudAccount } from "./cloudAccount";
import { CloudWindow, type WindowLike } from "./cloudWindow";
import { logMessage } from "./logger";
import { IpcChannels } from "./types.d";
import { createCloudBrowserWindow, webAppUrl } from "./window";

function windowLike(window: BrowserWindow): WindowLike {
  const webContentsId = window.webContents.id;
  return {
    webContentsId,
    isDestroyed: () => window.isDestroyed(),
    isMinimized: () => window.isMinimized(),
    restore: () => window.restore(),
    show: () => window.show(),
    focus: () => window.focus(),
    close: () => window.close(),
    loadURL: (url) => {
      window.loadURL(url).catch((error: unknown) => {
        logMessage(`The cloud window could not load ${url}: ${String(error)}`, "warn");
      });
    },
    send: (document) => {
      if (!window.isDestroyed()) {
        window.webContents.send(IpcChannels.CLOUD_WINDOW_DOCUMENT, document);
      }
    },
    onClosed: (listener) => {
      window.on("closed", listener);
    },
  };
}

let shared: CloudWindow | null = null;

export function getCloudWindow(): CloudWindow {
  if (!shared) {
    const account = getCloudAccount();
    const cloudWindow = new CloudWindow({
      account,
      createWindow: () => windowLike(createCloudBrowserWindow()),
      appUrl: webAppUrl,
      log: (message, level) => logMessage(message, level),
    });
    account.onStateChange((state) => cloudWindow.stateChanged(state));
    shared = cloudWindow;
  }
  return shared;
}

export function disposeCloudWindow(): void {
  shared?.dispose();
  shared = null;
}
