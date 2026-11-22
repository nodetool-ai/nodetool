/**
 * The cloud window of this launch (D27), over a real `BrowserWindow`. The
 * rules live in `cloudWindow.ts`.
 */
import { net, type BrowserWindow } from "electron";

import { getCloudAccount } from "./cloudAccount";
import { callCloudLocal, type CloudLocalResult } from "./cloudLocal";
import { CloudWindow, type WindowLike } from "./cloudWindow";
import { getLocalClientToken } from "./localClientToken";
import { logMessage } from "./logger";
import { serverState } from "./state";
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
    sendClosing: () => {
      if (!window.isDestroyed()) {
        window.webContents.send(IpcChannels.CLOUD_WINDOW_CLOSING);
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
      after: (ms, run) => {
        const timer = setTimeout(run, ms);
        return () => clearTimeout(timer);
      },
    });
    account.onStateChange((state) => cloudWindow.stateChanged(state));
    shared = cloudWindow;
  }
  return shared;
}

/** A `cloudLocal.*` call of the window `webContentsId`, on this app's own server. */
export function cloudWindowLocalCall(
  webContentsId: number,
  procedure: string,
  input: Record<string, unknown>
): Promise<CloudLocalResult> {
  return callCloudLocal(
    {
      originFor: (id) => getCloudWindow().originFor(id),
      localOrigin: () => (serverState.isStarted && serverState.serverPort ? `http://127.0.0.1:${serverState.serverPort}` : null),
      localClientToken: getLocalClientToken,
      fetch: (url, init) => net.fetch(url, init),
    },
    webContentsId,
    procedure,
    input
  );
}

export function disposeCloudWindow(): void {
  shared?.dispose();
  shared = null;
}
