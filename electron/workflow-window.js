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

  workflowWindow.setBackgroundColor("#111111");

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

/**
 * Fetches a workflow from the local API
 * @param {string} workflowId - The workflow ID to fetch
 * @returns {Promise<Workflow>} The fetched workflow
 * @throws {Error} When the API request fails
 */
async function fetchWorkflow(workflowId) {
  try {
    const response = await fetch(
      `http://127.0.0.1:8000/api/workflows/${workflowId}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      }
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    throw new Error(`Failed to fetch workflows: ${error.message}`);
  }
}

/**
 * Runs a workflow by fetching it and creating a new window for it
 * @param {string} workflowId - The workflow ID to run
 */
async function runWorkflow(workflowId) {
  const workflow = await fetchWorkflow(workflowId);
  createWorkflowWindow(workflow);
}

module.exports = {
  createWorkflowWindow,
  isWorkflowWindow,
  runWorkflow,
};
