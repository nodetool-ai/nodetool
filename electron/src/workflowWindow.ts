import { BrowserWindow, app, Menu, screen } from "electron";
import { getServerPort } from "./utils";
import path from "path";

// Map to store workflow windows
const workflowWindows = new Map<number, BrowserWindow>();

// Track the chat window separately
let chatWindow: BrowserWindow | null = null;

export const appPort = app.isPackaged ? getServerPort() : 5173;
export const baseUrl = `http://127.0.0.1:${appPort}${app.isPackaged ? "/apps" : ""}/index.html`;

/**
 * Creates a new frameless workflow window
 * @param workflowId - The workflow ID to create a window for
 * @returns The created window
 */
function createWorkflowWindow(workflowId: string): BrowserWindow {
  // Remove application menu
  Menu.setApplicationMenu(null);

  const workflowWindow = new BrowserWindow({
    frame: false,
    titleBarStyle: "hidden",
    transparent: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload-workflow.js"),
    },
  });

  workflowWindow.setBackgroundColor("#111111");

  const windowId = workflowWindow.id;
  workflowWindows.set(windowId, workflowWindow);

  workflowWindow.on("closed", () => {
    workflowWindows.delete(windowId);
  });

  workflowWindow.loadURL(`${baseUrl}?workflow_id=${workflowId}`);

  return workflowWindow;
}

/**
 * Creates a dedicated window for a mini app workflow
 * @param workflowId - The workflow ID to create a mini app window for
 * @param workflowName - The workflow name for the window title
 * @returns The created window
 */
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
    },
  });

  const windowId = miniAppWindow.id;
  workflowWindows.set(windowId, miniAppWindow);

  miniAppWindow.on("closed", () => {
    workflowWindows.delete(windowId);
  });

  // Load the mini app route
  const port = app.isPackaged ? getServerPort() : 3000;
  const baseUrl = `http://127.0.0.1:${port}`;
  
  miniAppWindow.loadURL(`${baseUrl}/miniapp/${workflowId}`);

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
    },
  });

  chatWindow.on("closed", () => {
    chatWindow = null;
  });

  // Load the standalone chat route
  const port = app.isPackaged ? getServerPort() : 3000;
  const baseUrl = `http://127.0.0.1:${port}`;
  
  chatWindow.loadURL(`${baseUrl}/standalone-chat`);

  return chatWindow;
}

/**
 * Checks if a window is a workflow window
 * @param window - The window to check
 * @returns True if the window is a workflow window
 */
function isWorkflowWindow(window: BrowserWindow): boolean {
  return workflowWindows.has(window.id);
}

export { createWorkflowWindow, createMiniAppWindow, createChatWindow, isWorkflowWindow };
