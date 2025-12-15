import { BrowserWindow, app, Menu, screen } from "electron";
import { getServerPort } from "./utils";
import path from "path";

// Map to store workflow windows
const workflowWindows = new Map<number, BrowserWindow>();

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
 * Checks if a window is a workflow window
 * @param window - The window to check
 * @returns True if the window is a workflow window
 */
function isWorkflowWindow(window: BrowserWindow): boolean {
  return workflowWindows.has(window.id);
}

export { createWorkflowWindow, isWorkflowWindow };
