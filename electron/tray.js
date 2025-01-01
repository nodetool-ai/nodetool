const { Tray, Menu } = require("electron");
const path = require("path");
const { logMessage } = require("./logger");
const { BrowserWindow } = require("electron");
const { createWindow } = require("./window");

/** @type {Electron.Tray|null} */
let trayInstance = null;

/**
 * Creates and initializes the system tray icon
 * @returns {Promise<Electron.Tray>} The tray instance
 */
async function createTray() {
  if (trayInstance) return trayInstance;

  const iconPath = path.join(__dirname, "resources", "tray-icon.png");
  trayInstance = new Tray(iconPath);

  setInterval(updateTrayMenu, 60 * 1000);
  return trayInstance;
}

/**
 * Creates a new window to run a workflow
 * @param {Workflow} workflow - The workflow to run
 * @returns {void}
 */
function createWorkflowWindow(workflow) {
  const window = new BrowserWindow({
    width: 600,
    height: 600,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload-workflow.js"),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  window.setBackgroundColor("#111111");
  window.loadFile("run-workflow.html");

  window.webContents.on("did-finish-load", () => {
    window.webContents.send("workflow", workflow);
  });
}

/**
 * @typedef {Object} Workflow
 * @property {string} id - Unique identifier of the workflow
 * @property {string} name - Display name of the workflow
 * @property {string} description - Description of the workflow
 * @property {string} created_at - Date and time the workflow was created
 * @property {string} updated_at - Date and time the workflow was last updated
 * @property {string} tags - Tags of the workflow
 * @property {string} thumbnail - thumbnail ID
 * @property {string} thumbnail_url - URL of the workflow thumbnail
 */

/**
 * Fetches workflows from the local API
 * @returns {Promise<Workflow[]>} Array of workflow objects
 * @throws {Error} When the API request fails
 */
async function fetchWorkflows() {
  try {
    const response = await fetch("http://127.0.0.1:8000/api/workflows/public", {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.workflows || [];
  } catch (error) {
    logMessage(`Failed to fetch workflows: ${error.message}`, "error");
    return [];
  }
}

/**
 * Updates the tray menu with current workflows
 * @returns {Promise<void>}
 */
async function updateTrayMenu() {
  if (!trayInstance) return;

  const workflows = await fetchWorkflows();
  const workflowMenuItems = workflows.map((workflow) => ({
    label: workflow.name,
    click: () => {
      logMessage(`Executing workflow: ${workflow.name}`);
      createWorkflowWindow(workflow);
    },
  }));

  const contextMenu = Menu.buildFromTemplate([
    ...workflowMenuItems,
    { type: "separator" },
    {
      label: "Open NodeTool",
      click: () => {
        const { getMainWindow } = require("./state");
        const mainWindow = getMainWindow();
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    { type: "separator" },
    { label: "Quit", role: "quit" },
  ]);

  trayInstance.setContextMenu(contextMenu);
  trayInstance.setToolTip("NodeTool");
}

module.exports = {
  createTray,
  updateTrayMenu,
};
