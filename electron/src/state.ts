import { BrowserWindow } from "electron";

export interface ServerState {
  isStarted: boolean;
  bootMsg: string;
  initialURL: string;
  logs: string[];
  serverPort?: number;
  ollamaPort?: number;
  ollamaExternalManaged?: boolean;
}

let mainWindow: BrowserWindow | null = null;

const serverState: ServerState = {
  isStarted: false,
  bootMsg: "Initializing...",
  initialURL: `http://127.0.0.1:${7777}`,
  logs: [],
  serverPort: 7777,
  ollamaPort: 11435,
  ollamaExternalManaged: false,
};

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function setMainWindow(window: BrowserWindow | null): void {
  mainWindow = window;
}

export { serverState };
