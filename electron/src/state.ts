import { BrowserWindow } from "electron";

export interface ServerState {
  isStarted: boolean;
  bootMsg: string;
  initialURL: string;
  logs: string[];
  serverPort?: number;
  ollamaPort?: number;
}

let mainWindow: BrowserWindow | null = null;

const serverState: ServerState = {
  isStarted: false,
  bootMsg: "Initializing...",
  initialURL: `http://127.0.0.1:${8000}`,
  logs: [],
  serverPort: 8000,
  ollamaPort: 11435,
};

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function setMainWindow(window: BrowserWindow | null): void {
  mainWindow = window;
}

export { serverState };
