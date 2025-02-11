import { Tray, Menu, app, BrowserWindow, dialog, shell } from "electron";
import path from "path";
import { logMessage, LOG_FILE } from "./logger";
import { getMainWindow } from "./state";
import { createWindow } from "./window";
import { execSync } from "child_process";
import { stopServer } from "./server";
import { initializeBackendServer } from "./server";
import {
  connectToWebSocketUpdates,
  fetchWorkflows,
  isConnected,
  runWorkflow,
} from "./api";

let trayInstance: Electron.Tray | null = null;

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

async function updateTrayMenu(): Promise<void> {
  if (!trayInstance) return;

  const statusIndicator = isConnected ? "🟢" : "🔴";
  const workflows = await fetchWorkflows();

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `${statusIndicator} NodeTool Service`,
      enabled: false,
    },
    {
      label: "Start Service",
      enabled: !isConnected,
      click: async () => {
        await initializeBackendServer();
        updateTrayMenu();
      },
    },
    {
      label: "Stop Service",
      enabled: isConnected,
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
      label: "Workflows",
      submenu:
        workflows.length > 0
          ? workflows.map((workflow) => ({
              label: workflow.name,
              click: () => runWorkflow(workflow),
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

export { createTray, updateTrayMenu, fetchWorkflows };
