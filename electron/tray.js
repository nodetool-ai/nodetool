const { Tray, Menu, app, BrowserWindow, dialog, shell } = require("electron");
const path = require("path");
const { logMessage } = require("./logger");
const WebSocket = require("ws");
const { createWorkflowWindow } = require("./workflow-window");
const { getMainWindow } = require("./state");
const { createWindow } = require("./window");
const {
  createLaunchAgent,
  removeLaunchAgent,
  getLaunchAgentLogPath,
} = require("./scheduler");
const fs = require("fs/promises");

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
 * Shows the schedule dialog for a workflow
 * @param {string} workflowId - The workflow ID to schedule
 */
async function showScheduleDialog(workflowId) {
  const intervals = [
    { label: "Every 5 minutes", value: 5 },
    { label: "Every 15 minutes", value: 15 },
    { label: "Every 30 minutes", value: 30 },
    { label: "Every hour", value: 60 },
  ];

  if (process.platform !== "darwin") {
    dialog.showMessageBox({
      type: "error",
      message: "Scheduling is not supported on this platform",
      buttons: ["OK"],
    });
    return;
  }

  const result = await dialog.showMessageBox({
    type: "question",
    title: "Schedule Workflow",
    message: "Select interval for workflow execution:",
    buttons: [...intervals.map((i) => i.label), "Cancel"],
    cancelId: intervals.length,
  });

  if (result.response < intervals.length) {
    try {
      await createLaunchAgent(workflowId, intervals[result.response].value);
      dialog.showMessageBox({
        type: "info",
        message: "Workflow scheduled successfully",
        buttons: ["OK"],
      });
    } catch (error) {
      dialog.showMessageBox({
        type: "error",
        message: "Failed to schedule workflow",
        detail: error.message,
        buttons: ["OK"],
      });
    }
  }
}

/**
 * Creates menu items for a workflow
 * @param {Object} workflow - The workflow object
 * @returns {Electron.MenuItemConstructorOptions[]}
 */
function createWorkflowMenuItems(workflow) {
  return [
    {
      label: "Open as App",
      click: () => createWorkflowWindow(workflow),
    },
    {
      label: "Set Schedule",
      click: () => showScheduleDialog(workflow.id),
    },
    {
      label: "Remove Schedule",
      click: async () => {
        try {
          await removeLaunchAgent(workflow.id);
          dialog.showMessageBox({
            type: "info",
            message: "Schedule removed successfully",
            buttons: ["OK"],
          });
        } catch (error) {
          dialog.showMessageBox({
            type: "error",
            message: "Failed to remove schedule",
            detail: error.message,
            buttons: ["OK"],
          });
        }
      },
    },
    {
      label: "View Schedule Logs",
      click: async () => {
        const logPath = getLaunchAgentLogPath(workflow.id);
        try {
          await fs.access(logPath);
          shell.showItemInFolder(logPath);
        } catch (error) {
          dialog.showMessageBox({
            type: "info",
            message: "No logs available",
            detail:
              "This workflow hasn't been scheduled yet or hasn't generated any logs.",
            buttons: ["OK"],
          });
        }
      },
    },
  ];
}

/**
 * Updates the tray menu with current workflows
 * @returns {Promise<void>}
 */
async function updateTrayMenu(workflows = null) {
  if (!trayInstance) return;

  if (workflows === null) {
    workflows = await fetchWorkflows();
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show NodeTool",
      click: () => focusNodeTool(),
    },
    { type: "separator" },
    {
      label: "Workflows",
      submenu:
        workflows.length > 0
          ? workflows.map((workflow) => ({
              label: workflow.name,
              submenu: createWorkflowMenuItems(workflow),
            }))
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
