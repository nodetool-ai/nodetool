const { BrowserWindow } = require("electron");
const path = require("path");

/** @typedef {import("./tray").Workflow} Workflow */

// Map to store workflow windows
const workflowWindows = new Map();

/**
 * Creates a new frameless workflow window
 * @param {Workflow} workflow - The workflow to create a window for
 * @returns {Electron.BrowserWindow} The created window
 */
function createWorkflowWindow(workflow) {
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
  workflowWindow.loadFile(path.join(__dirname, "run-workflow.html"));

  workflowWindow.webContents.on("did-finish-load", () => {
    workflowWindow.webContents.send("workflow", workflow);
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
