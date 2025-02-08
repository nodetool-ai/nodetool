import { BrowserWindow } from "electron";

export interface ServerState {
  isStarted: boolean;
  bootMsg: string;
  initialURL: string;
  logs: string[];
}

let mainWindow: BrowserWindow | null = null;

const serverState: ServerState = {
  isStarted: false,
  bootMsg: "Initializing...",
  initialURL: "http://127.0.0.1:8000",
  logs: [],
};

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function setMainWindow(window: BrowserWindow | null): void {
  mainWindow = window;
}

export { serverState };
