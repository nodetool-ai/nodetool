import { Tray, Menu, app, BrowserWindow, dialog, shell } from "electron";
import path from "path";
import { logMessage, LOG_FILE } from "./logger";
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

let trayInstance: Electron.Tray | null = null;
let wsConnection: WebSocket | null = null;
let healthCheckInterval: NodeJS.Timeout | undefined;

async function createTray(): Promise<Electron.Tray> {
  if (trayInstance) {
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

  if (isWindows) {
    app.setAppUserModelId("com.nodetool.desktop");
  }

  trayInstance = new Tray(iconPath);

  if (isWindows) {
    trayInstance.setIgnoreDoubleClickEvents(true);

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
      if (error instanceof Error) {
        logMessage(
          `Failed to set tray icon preference: ${error.message}`,
          "warn"
        );
      }
    }

    setupWindowsTrayEvents(trayInstance);
  }

  await updateTrayMenu();

  setTimeout(() => {
    connectToWebSocketUpdates();
  }, 30000);

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

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `${statusIndicator} NodeTool Service`,
      enabled: false,
    },
    {
      label: "Start Service",
      enabled: !isHealthy,
      click: async () => {
        try {
          exec(
            `launchctl load -w ~/Library/LaunchAgents/${LAUNCHD_SERVICE_NAME}.plist`,
            (error, stdout, stderr) => {
              if (error) {
                logMessage(
                  `Failed to start service: ${error.message}`,
                  "error"
                );
                dialog.showErrorBox(
                  "Service Error",
                  "Failed to start NodeTool service"
                );
              }
              waitUntil((response) => response.ok);
              updateTrayMenu();
            }
          );
        } catch (error) {
          if (error instanceof Error) {
            logMessage(`Failed to start service: ${error.message}`, "error");
          }
          dialog.showErrorBox(
            "Service Error",
            "Failed to start NodeTool service"
          );
        }
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
      label: "Mini Apps",
      submenu:
        workflows.length > 0
          ? workflows.map((workflow) => ({
              label: workflow.name,
              click: () => createWorkflowWindow(workflow),
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
                click: async () => {
                  try {
                    await removeLaunchAgent(workflow.id);
                    dialog.showMessageBox({
                      type: "info",
                      message: "Schedule removed successfully",
                      buttons: ["OK"],
                    });
                    updateTrayMenu();
                  } catch (error) {
                    dialog.showMessageBox({
                      type: "error",
                      message: "Failed to remove schedule",
                      detail:
                        error instanceof Error ? error.message : String(error),
                      buttons: ["OK"],
                    });
                  }
                },
              }))
          : [{ label: "No scheduled workflows", enabled: false }],
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
});

export { createTray, updateTrayMenu };
