import {
  Tray,
  Menu,
  app,
  BrowserWindow,
  dialog,
  shell,
  globalShortcut,
  ipcMain,
} from "electron";
import path from "path";
import { logMessage, LOG_FILE } from "./logger";
// @ts-expect-error types not available
import WebSocket from "ws";
import { createWorkflowWindow } from "./workflow-window";
import { getMainWindow } from "./state";
import { createWindow } from "./window";
import { LAUNCHD_SERVICE_NAME } from "./config";
import {
  createLaunchAgent,
  removeLaunchAgent,
  getScheduledWorkflows,
} from "./scheduler";
import { exec, execSync } from "child_process";
import { stopServer } from "./server";
import { Workflow, WebSocketUpdate } from "./types.d";
import { readSettings, updateSetting } from "./settings";

let trayInstance: Electron.Tray | null = null;
let wsConnection: WebSocket | null = null;
let healthCheckInterval: NodeJS.Timeout | undefined;

interface ShortcutMapping {
  workflowId: string;
  shortcut: string;
}

function registerWorkflowShortcut(workflowId: string, shortcut: string): void {
  try {
    globalShortcut.unregister(shortcut);

    globalShortcut.register(shortcut, () => {
      createWorkflowWindow(workflowId);
    });

    const shortcuts = readSettings().shortcuts || {};
    shortcuts[workflowId] = shortcut;
    updateSetting("shortcuts", shortcuts);

    logMessage(
      `Registered shortcut ${shortcut} for workflow ${workflowId}`,
      "info"
    );
  } catch (error) {
    logMessage(`Failed to register shortcut: ${error}`, "error");
    dialog.showErrorBox(
      "Shortcut Error",
      "Failed to register keyboard shortcut"
    );
  }
}

async function showShortcutDialog(workflow: Workflow): Promise<void> {
  const shortcutWindow = new BrowserWindow({
    width: 400,
    height: 200,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    resizable: false,
    minimizable: false,
    maximizable: false,
    parent: getMainWindow() || undefined,
    modal: true,
  });

  // Create HTML content for the form
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Set Keyboard Shortcut</title>
        <style>
          body {
            font-family: system-ui;
            padding: 20px;
            margin: 0;
          }
          .form-group {
            margin-bottom: 15px;
          }
          .buttons {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
          }
          button {
            padding: 6px 12px;
          }
        </style>
      </head>
      <body>
        <form id="shortcutForm">
          <div class="form-group">
            <label>Workflow: ${workflow.name}</label>
          </div>
          <div class="form-group">
            <label for="shortcut">Shortcut:</label>
            <input type="text" id="shortcut" placeholder="e.g., CommandOrControl+Shift+1" style="width: 100%">
          </div>
          <div class="buttons">
            <button type="button" onclick="window.close()">Cancel</button>
            <button type="submit">Save</button>
            <button type="button" onclick="removeShortcut()">Remove Shortcut</button>
          </div>
        </form>
        <script>
          const { ipcRenderer } = require('electron');
          
          document.getElementById('shortcutForm').onsubmit = (e) => {
            e.preventDefault();
            const shortcut = document.getElementById('shortcut').value;
            ipcRenderer.send('setShortcut', shortcut);
          };
          
          function removeShortcut() {
            ipcRenderer.send('removeShortcut');
          }
        </script>
      </body>
    </html>
  `;

  // Load the HTML content
  shortcutWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`
  );

  // Handle IPC events
  ipcMain.once("setShortcut", (event, shortcut) => {
    registerWorkflowShortcut(workflow.id, shortcut);
    shortcutWindow.close();
  });

  ipcMain.once("removeShortcut", () => {
    const shortcuts = readSettings().shortcuts || {};
    const existingShortcut = shortcuts[workflow.id];
    if (existingShortcut) {
      globalShortcut.unregister(existingShortcut);
      delete shortcuts[workflow.id];
      updateSetting("shortcuts", shortcuts);
      logMessage(`Removed shortcut for workflow ${workflow.id}`, "info");
    }
    shortcutWindow.close();
  });

  shortcutWindow.on("closed", () => {
    ipcMain.removeAllListeners("setShortcut");
    ipcMain.removeAllListeners("removeShortcut");
  });
}

async function createTray(): Promise<Electron.Tray> {
  logMessage("Starting tray creation...", "info");

  if (trayInstance) {
    logMessage("Destroying existing tray instance", "info");
    trayInstance.destroy();
    trayInstance = null;
  }

  const isWindows = process.platform === "win32";
  const iconPath = path.join(
    __dirname,
    "..",
    "assets",
    isWindows ? "tray-icon.ico" : "tray-icon.png"
  );

  logMessage(`Attempting to create tray with icon at: ${iconPath}`, "info");

  if (isWindows) {
    logMessage("Setting Windows-specific app ID", "info");
    app.setAppUserModelId("com.nodetool.desktop");
  }

  try {
    trayInstance = new Tray(iconPath);
    logMessage("Tray instance created successfully", "info");
  } catch (error) {
    if (error instanceof Error) {
      logMessage(`Failed to create tray: ${error.message}`, "error");
      throw new Error(`Could not create tray: ${error.message}`);
    }
  }

  if (!trayInstance) {
    logMessage("Tray instance is null after creation attempt", "error");
    throw new Error("Failed to create tray instance");
  }

  if (isWindows) {
    logMessage("Setting up Windows-specific tray events", "info");
    trayInstance.setIgnoreDoubleClickEvents(true);

    try {
      const iconPreferenceKey =
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\TrayNotify";
      logMessage("Updating Windows registry for tray icon", "info");
      execSync(
        `reg add "${iconPreferenceKey}" /v "IconStreams" /t REG_BINARY /d "" /f`
      );
      execSync(
        `reg add "${iconPreferenceKey}" /v "PastIconsStream" /t REG_BINARY /d "" /f`
      );
    } catch (error) {
      if (error instanceof Error) {
        logMessage(
          `Failed to set tray icon preference: ${error.message}`,
          "warn"
        );
      }
    }

    setupWindowsTrayEvents(trayInstance);
  }

  registerExistingShortcuts();
  await connectToWebSocketUpdates();
  startHealthCheck();

  return trayInstance;
}

function setupWindowsTrayEvents(tray: Electron.Tray): void {
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
    const mainWindow = getMainWindow();
    if (mainWindow) {
      tray.popUpContextMenu();
    }
  });

  tray.on("right-click", () => {
    tray.popUpContextMenu();
  });
}

function focusNodeTool(): void {
  const visibleWindows = BrowserWindow.getAllWindows().filter(
    (w) => !w.isDestroyed() && w.isVisible()
  );

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

async function fetchWorkflows(): Promise<Workflow[]> {
  try {
    const response = await fetch("http://127.0.0.1:8000/api/workflows/", {
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
    if (error instanceof Error) {
      logMessage(`Failed to fetch workflows: ${error.message}`, "error");
    }
    return [];
  }
}

async function showScheduleDialog(workflowId: string): Promise<void> {
  const intervals = [
    { label: "Every 5 minutes", value: 5 },
    { label: "Every 15 minutes", value: 15 },
    { label: "Every 30 minutes", value: 30 },
    { label: "Every hour", value: 60 },
    { label: "Every 24 hours", value: 1440 },
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
        detail: error instanceof Error ? error.message : String(error),
        buttons: ["OK"],
      });
    }
  }
}

async function checkServiceHealth(): Promise<boolean> {
  try {
    const response = await fetch("http://127.0.0.1:8000/health");
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function startNodeToolService(): Promise<void> {
  try {
    exec(
      `launchctl load -w ~/Library/LaunchAgents/${LAUNCHD_SERVICE_NAME}.plist`,
      (error, stdout, stderr) => {
        if (error) {
          logMessage(`Failed to start service: ${error.message}`, "error");
          dialog.showErrorBox(
            "Service Error",
            "Failed to start NodeTool service"
          );
        }
      }
    );
  } catch (error) {
    if (error instanceof Error) {
      logMessage(`Failed to start service: ${error.message}`, "error");
    }
    dialog.showErrorBox("Service Error", "Failed to start NodeTool service");
  }
}

async function updateTrayMenu(): Promise<void> {
  if (!trayInstance) return;

  const isHealthy = await checkServiceHealth();
  const scheduledWorkflows = await getScheduledWorkflows();
  const statusIndicator = isHealthy ? "🟢" : "🔴";
  const workflows = isHealthy ? await fetchWorkflows() : [];

  const waitUntil = async (
    waitCondition: (response: Response) => boolean
  ): Promise<void> => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch("http://127.0.0.1:8000/health");
        if (waitCondition(response)) {
          clearInterval(pollInterval);
          updateTrayMenu();
        }
      } catch (error) {
        clearInterval(pollInterval);
        updateTrayMenu();
      }
    }, 100);
  };

  async function unscheduleWorkflow(workflow: Workflow): Promise<void> {
    try {
      await removeLaunchAgent(workflow.id);
      await dialog.showMessageBox({
        type: "info",
        message: "Schedule removed successfully",
        buttons: ["OK"],
      });
      await updateTrayMenu();
    } catch (error) {
      dialog.showMessageBox({
        type: "error",
        message: "Failed to remove schedule",
        detail: error instanceof Error ? error.message : String(error),
        buttons: ["OK"],
      });
    }
  }

  const shortcuts = readSettings().shortcuts || {};

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `${statusIndicator} NodeTool Service`,
      enabled: false,
    },
    {
      label: "Start Service",
      enabled: !isHealthy,
      click: async () => {
        await startNodeToolService();
        waitUntil((response) => response.ok);
        updateTrayMenu();
      },
    },
    {
      label: "Stop Service",
      enabled: isHealthy,
      click: async () => {
        try {
          await stopServer();
        } catch (error) {
          if (error instanceof Error) {
            logMessage(`Failed to stop service: ${error.message}`, "error");
          }
        }
      },
    },
    { type: "separator" },
    {
      label: "Show NodeTool",
      enabled: true,
      click: async () => focusNodeTool(),
    },
    { type: "separator" },
    {
      label: "Apps",
      submenu:
        workflows.length > 0
          ? workflows.map((workflow) => ({
              label: workflow.name,
              click: () => createWorkflowWindow(workflow.id),
            }))
          : [{ label: "No workflows available", enabled: false }],
    },
    {
      label: "Schedule",
      submenu:
        workflows.length > 0
          ? workflows.map((workflow) => ({
              label: workflow.name,
              click: () => showScheduleDialog(workflow.id),
            }))
          : [{ label: "No workflows available", enabled: false }],
    },
    {
      label: "Unschedule",
      submenu:
        scheduledWorkflows.length > 0
          ? workflows
              .filter((w) => scheduledWorkflows.includes(w.id))
              .map((workflow) => ({
                label: workflow.name,
                click: () => unscheduleWorkflow(workflow),
              }))
          : [{ label: "No scheduled workflows", enabled: false }],
    },
    {
      label: "Shortcuts",
      submenu:
        workflows.length > 0
          ? workflows.map((workflow) => ({
              label: `${workflow.name}${
                shortcuts[workflow.id] ? ` (${shortcuts[workflow.id]})` : ""
              }`,
              click: () => showShortcutDialog(workflow),
            }))
          : [{ label: "No workflows available", enabled: false }],
    },
    { type: "separator" },
    {
      label: "Open Log File",
      click: () => {
        shell.openPath(LOG_FILE);
      },
    },
    { type: "separator" },
    { label: "Quit NodeTool", role: "quit" },
  ]);

  trayInstance.setContextMenu(contextMenu);
  trayInstance.setToolTip("NodeTool Desktop");
}

async function connectToWebSocketUpdates(): Promise<void> {
  if (wsConnection) {
    wsConnection.close();
  }

  wsConnection = new WebSocket("ws://127.0.0.1:8000/updates");

  wsConnection.on("message", (data: WebSocket.Data) => {
    try {
      const update = JSON.parse(data.toString()) as WebSocketUpdate;
      if (update.type === "delete_workflow") {
        logMessage(`Deleting workflow: ${update.id}`);
        updateTrayMenu();
      } else if (update.type === "update_workflow") {
        logMessage(`Updating workflow: ${update.workflow?.name}`);
        updateTrayMenu();
      } else if (update.type === "create_workflow") {
        logMessage(`Creating workflow: ${update.workflow?.name}`);
        updateTrayMenu();
      }
    } catch (error) {
      if (error instanceof Error) {
        logMessage(`WebSocket message parse error: ${error.message}`, "error");
      }
    }
  });

  wsConnection.on("close", () => {
    logMessage(
      "WebSocket connection closed, attempting to reconnect...",
      "warn"
    );
    setTimeout(connectToWebSocketUpdates, 5000);
  });

  wsConnection.on("error", (error: WebSocket.ErrorEvent) => {
    logMessage(`WebSocket error: ${error.message}`, "error");
  });
}

function startHealthCheck(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }

  healthCheckInterval = setInterval(async () => {
    if (trayInstance) {
      await updateTrayMenu();
    }
  }, 30000);
}

app.on("before-quit", () => {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }
  globalShortcut.unregisterAll();
});

function registerExistingShortcuts(): void {
  const shortcuts = readSettings().shortcuts || {};
  Object.entries(shortcuts).forEach(([workflowId, shortcut]) => {
    registerWorkflowShortcut(workflowId, shortcut as string);
  });
}

export { createTray, updateTrayMenu, startNodeToolService, fetchWorkflows };
