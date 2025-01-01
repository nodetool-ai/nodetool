const { Tray, Menu, app } = require("electron");
const path = require("path");
const { logMessage } = require("./logger");
const { BrowserWindow } = require("electron");
const { createWindow } = require("./window");
const WebSocket = require("ws");

/** @type {Electron.Tray|null} */
let trayInstance = null;

/** @type {WebSocket|null} */
let wsConnection = null;

/**
 * Creates and initializes the system tray icon
 * @returns {Promise<Electron.Tray>} The tray instance
 */
async function createTray() {
  if (trayInstance) return trayInstance;

  const isWindows = process.platform === "win32";
  const iconPath = path.join(
    __dirname,
    "resources",
    isWindows ? "tray-icon.ico" : "tray-icon.png"
  );

  // Windows-specific: Set the app user model ID to ensure proper taskbar grouping
  if (isWindows) {
    app.setAppUserModelId("com.nodetool.desktop");
  }

  trayInstance = new Tray(iconPath);

  // Windows-specific: Force the tray icon to be always visible
  if (isWindows) {
    // Set high priority for the tray icon
    trayInstance.setIgnoreDoubleClickEvents(true);

    // Update the tray icon's visibility preference in Windows registry
    const { execSync } = require("child_process");
    try {
      const iconPreferenceKey =
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\TrayNotify";
      execSync(
        `reg add "${iconPreferenceKey}" /v "IconStreams" /t REG_BINARY /d "" /f`
      );
      execSync(
        `reg add "${iconPreferenceKey}" /v "PastIconsStream" /t REG_BINARY /d "" /f`
      );
    } catch (error) {
      logMessage(
        `Failed to set tray icon preference: ${error.message}`,
        "warn"
      );
    }
  }

  await connectToWebSocketUpdates();
  await updateTrayMenu();

  // Windows-specific settings
  if (isWindows) {
    // Double click should open/focus the main window
    trayInstance.on("double-click", () => {
      const { getMainWindow } = require("./state");
      const mainWindow = getMainWindow();
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      } else {
        createWindow();
      }
    });

    // Single click should show the context menu
    trayInstance.on("click", () => {
      const { getMainWindow } = require("./state");
      const mainWindow = getMainWindow();
      if (mainWindow) {
        trayInstance.popUpContextMenu();
      }
    });

    // Right click should show the context menu
    trayInstance.on("right-click", () => {
      trayInstance.popUpContextMenu();
    });
  }

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
      contextIsolation: true,
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

  const { getMainWindow } = require("./state");
  const mainWindow = getMainWindow();

  const contextMenu = Menu.buildFromTemplate([
    {
      label:
        mainWindow && !mainWindow.isVisible()
          ? "Show NodeTool"
          : "Focus NodeTool",
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    { type: "separator" },
    {
      label: "Workflows",
      submenu:
        workflowMenuItems.length > 0
          ? workflowMenuItems
          : [{ label: "No workflows available", enabled: false }],
    },
    { type: "separator" },
    {
      label: "Open Log File",
      click: () => {
        const { shell } = require("electron");
        const { LOG_FILE } = require("./logger");
        shell.showItemInFolder(LOG_FILE);
      },
    },
    { type: "separator" },
    { label: "Quit NodeTool", role: "quit" },
  ]);

  trayInstance.setContextMenu(contextMenu);
  trayInstance.setToolTip("NodeTool Desktop");
}

/**
 * Connects to the WebSocket updates endpoint
 * @returns {Promise<void>}
 */
async function connectToWebSocketUpdates() {
  if (wsConnection) {
    wsConnection.close();
  }

  wsConnection = new WebSocket("ws://127.0.0.1:8000/updates");

  wsConnection.on("message", (data) => {
    try {
      const update = JSON.parse(data.toString());
      if (update.type === "delete_workflow") {
        logMessage(`Deleting workflow: ${update.id}`);
        updateTrayMenu();
      } else if (update.type === "update_workflow") {
        logMessage(`Updating workflow: ${update.workflow.name}`);
        updateTrayMenu();
      } else if (update.type === "create_workflow") {
        logMessage(`Creating workflow: ${update.workflow.name}`);
        updateTrayMenu();
      }
    } catch (error) {
      logMessage(`WebSocket message parse error: ${error.message}`, "error");
    }
  });

  wsConnection.on("close", () => {
    logMessage(
      "WebSocket connection closed, attempting to reconnect...",
      "warn"
    );
    setTimeout(connectToWebSocketUpdates, 5000); // Reconnect after 5 seconds
  });

  wsConnection.on("error", (error) => {
    logMessage(`WebSocket error: ${error.message}`, "error");
  });
}

module.exports = {
  createTray,
  updateTrayMenu,
};
