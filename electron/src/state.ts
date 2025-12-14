import { BrowserWindow } from "electron";

export interface ServerState {
  isStarted: boolean;
  status: "idle" | "starting" | "started" | "error";
  bootMsg: string;
  initialURL: string;
  error?: string;
  logs: string[];
  serverPort?: number;
  ollamaPort?: number;
  ollamaExternalManaged?: boolean;
  llamaPort?: number;
  llamaExternalManaged?: boolean;
}

let mainWindow: BrowserWindow | null = null;

const serverState: ServerState = {
  isStarted: false,
  status: "idle",
  bootMsg: "Initializing...",
  initialURL: `http://127.0.0.1:${7777}`,
  error: undefined,
  logs: [],
  serverPort: 7777,
  ollamaPort: 11435,
  ollamaExternalManaged: false,
  llamaPort: 8080,
  llamaExternalManaged: false,
};

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function setMainWindow(window: BrowserWindow | null): void {
  mainWindow = window;
}

export { serverState };
