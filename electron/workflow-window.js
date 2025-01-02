const { BrowserWindow } = require("electron");
const path = require("path");

// Map to store workflow windows
const workflowWindows = new Map();

/**
 * Creates a new frameless workflow window
 * @returns {Electron.BrowserWindow} The created window
 */
function createWorkflowWindow() {
  const workflowWindow = new BrowserWindow({
    frame: false,
    titleBarStyle: "hidden",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload-workflow.js"),
    },
  });

  const windowId = workflowWindow.id;
  workflowWindows.set(windowId, workflowWindow);

  workflowWindow.on("closed", () => {
    workflowWindows.delete(windowId);
  });

  return workflowWindow;
}

/**
 * Checks if a window is a workflow window
 * @param {Electron.BrowserWindow} window - The window to check
 * @returns {boolean} True if the window is a workflow window
 */
function isWorkflowWindow(window) {
  return workflowWindows.has(window.id);
}

module.exports = {
  createWorkflowWindow,
  isWorkflowWindow,
};
