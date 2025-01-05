const { Tray, Menu, app, BrowserWindow } = require("electron");
const path = require("path");
const { logMessage } = require("./logger");
const WebSocket = require("ws");
const { createWorkflowWindow } = require("./workflow-window");
const { getMainWindow } = require("./state");

/** @type {Electron.Tray|null} */
let trayInstance = null;

/** @type {WebSocket|null} */
let wsConnection = null;

/**
 * Creates and initializes the system tray icon
 * @returns {Promise<Electron.Tray>} The tray instance
 */
async function createTray() {
  // Destroy existing tray if it exists
  if (trayInstance) {
    trayInstance.destroy();
    trayInstance = null;
  }

  const isWindows = process.platform === "win32";
  const iconPath = path.join(
    __dirname,
    "resources",
    isWindows ? "tray-icon.ico" : "tray-icon.png"
  );

  // Windows-specific: Set the app user model ID
  if (isWindows) {
    app.setAppUserModelId("com.nodetool.desktop");
  }

  trayInstance = new Tray(iconPath);

  // Windows-specific tray settings
  if (isWindows) {
    trayInstance.setIgnoreDoubleClickEvents(true);

    // Update Windows registry for tray icon visibility
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

    // Set up Windows-specific event handlers
    setupWindowsTrayEvents(trayInstance);
  }

  // Create initial menu
  const workflows = await fetchWorkflows();
  await updateTrayMenu(workflows);

  // Set up WebSocket connection after delay
  setTimeout(() => {
    connectToWebSocketUpdates();
  }, 30000);

  return trayInstance;
}

function setupWindowsTrayEvents(tray) {
  tray.on("double-click", () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });

  tray.on("click", () => {
    const { getMainWindow } = require("./state");
    const mainWindow = getMainWindow();
    if (mainWindow) {
      tray.popUpContextMenu();
    }
  });

  tray.on("right-click", () => {
    tray.popUpContextMenu();
  });
}

/**
 * Handles app activation events
 * @returns {void}
 */
function focusNodeTool() {
  // Get all visible windows (not just existing ones)
  const visibleWindows = BrowserWindow.getAllWindows().filter(
    (w) => !w.isDestroyed() && w.isVisible()
  );
  const createWindow = require("./window").createWindow;

  if (visibleWindows.length === 0) {
    createWindow();
  } else if (process.platform === "darwin") {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  }
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
async function updateTrayMenu(workflows = null) {
  if (!trayInstance) return;

  // Fetch workflows if not provided
  if (workflows === null) {
    workflows = await fetchWorkflows();
  }

  const workflowMenuItems = workflows.map((workflow) => ({
    label: workflow.name,
    click: () => {
      logMessage(`Executing workflow: ${workflow.name}`);
      const workflowWindow = createWorkflowWindow();
      workflowWindow.loadFile(path.join(__dirname, "run-workflow.html"));

      workflowWindow.webContents.on("did-finish-load", () => {
        workflowWindow.webContents.send("workflow", workflow);
      });
    },
  }));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show NodeTool",
      click: () => focusNodeTool(),
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
