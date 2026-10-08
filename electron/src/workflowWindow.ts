import { BrowserWindow, app, screen } from "electron";
import { getServerPort } from "./utils";
import path from "path";
import { getWebDevServerUrl } from "./devMode";
import { hardenWebContents } from "./windowSecurity";

// Map to store workflow windows
const workflowWindows = new Map<number, BrowserWindow>();

// Track the chat window separately
let chatWindow: BrowserWindow | null = null;

const webDevBaseUrl = getWebDevServerUrl();

/**
 * Resolved per call: the backend picks its port at startup (7777 may be
 * taken) and again after a vault switch restarts it.
 */
function workflowAppUrl(workflowId: string): string {
  const base = app.isPackaged
    ? `http://127.0.0.1:${getServerPort()}/apps/index.html`
    : `${webDevBaseUrl}/index.html`;
  return `${base}?workflow_id=${encodeURIComponent(workflowId)}`;
}

/** Creates a new frameless workflow window */
function createWorkflowWindow(workflowId: string): BrowserWindow {
  const workflowWindow = new BrowserWindow({
    frame: false,
    titleBarStyle: "hidden",
    transparent: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: !app.isPackaged,
      webSecurity: true,
      preload: path.join(__dirname, "preload-workflow.js"),
    },
  });

  workflowWindow.setBackgroundColor("#111111");
  hardenWebContents(workflowWindow.webContents);

  const windowId = workflowWindow.id;
  workflowWindows.set(windowId, workflowWindow);

  workflowWindow.on("closed", () => {
    workflowWindows.delete(windowId);
  });

  workflowWindow.loadURL(workflowAppUrl(workflowId));

  return workflowWindow;
}

/** Creates a dedicated window for a mini app workflow */
function createMiniAppWindow(workflowId: string, workflowName?: string): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const windowWidth = Math.min(1200, Math.floor(width * 0.8));
  const windowHeight = Math.min(900, Math.floor(height * 0.8));

  const miniAppWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: 800,
    minHeight: 600,
    title: workflowName ? `${workflowName} - NodeTool` : "Mini App - NodeTool",
    backgroundColor: "#181a1b",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: !app.isPackaged,
      webSecurity: true,
      preload: path.join(__dirname, "preload-workflow.js"),
    },
  });

  hardenWebContents(miniAppWindow.webContents);

  const windowId = miniAppWindow.id;
  workflowWindows.set(windowId, miniAppWindow);

  miniAppWindow.on("closed", () => {
    workflowWindows.delete(windowId);
  });

  // Load the mini app route
  // For packaged apps, load the main HTML with a hash route
  // For development, use direct SPA route
  if (app.isPackaged) {
    const port = getServerPort();
    miniAppWindow.loadURL(
      `http://127.0.0.1:${port}/#/miniapp/${encodeURIComponent(workflowId)}`,
    );
  } else {
    miniAppWindow.loadURL(
      `${webDevBaseUrl}/miniapp/${encodeURIComponent(workflowId)}`,
    );
  }

  return miniAppWindow;
}

/**
 * Creates a dedicated window for the standalone chat
 * @returns The created window
 */
function createChatWindow(): BrowserWindow {
  // If chat window already exists and is not destroyed, focus it
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.focus();
    return chatWindow;
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const windowWidth = Math.min(1200, Math.floor(width * 0.8));
  const windowHeight = Math.min(900, Math.floor(height * 0.8));

  chatWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: 800,
    minHeight: 600,
    title: "Chat - NodeTool",
    backgroundColor: "#181a1b",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: !app.isPackaged,
      webSecurity: true,
      preload: path.join(__dirname, "preload-workflow.js"),
    },
  });

  hardenWebContents(chatWindow.webContents);

  chatWindow.on("closed", () => {
    chatWindow = null;
  });

  // Load the standalone chat route
  // For packaged apps, load the main HTML with a hash route
  // For development, use direct SPA route
  if (app.isPackaged) {
    const port = getServerPort();
    chatWindow.loadURL(`http://127.0.0.1:${port}/#/standalone-chat`);
  } else {
    chatWindow.loadURL(`${webDevBaseUrl}/standalone-chat`);
  }

  return chatWindow;
}

export { createWorkflowWindow, createMiniAppWindow, createChatWindow };
