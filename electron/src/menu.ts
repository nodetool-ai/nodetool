import { Menu, shell, dialog, app, clipboard } from "electron";
import { IpcChannels } from "./types.d";
import { getMainWindow } from "./state";
import { createPackageManagerWindow, createLogViewerWindow } from "./window";
import { getSystemInfo } from "./systemInfo";

/**
 * Builds the application menu
 */
const buildMenu = () => {
  const mainWindow = getMainWindow();
  if (!mainWindow) {
    return;
  }
  const menu = Menu.buildFromTemplate([
    {
      label: process.platform === "darwin" ? "NodeTool" : "",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        {
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "saveWorkflow",
            });
          },
        },
        { type: "separator" },
        {
          label: "New Workflow",
          accelerator: "CmdOrCtrl+T",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "newTab",
            });
          },
        },
        {
          label: "Close Tab",
          accelerator: "CmdOrCtrl+W",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "close",
            });
          },
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        {
          label: "Undo",
          accelerator: "CmdOrCtrl+Z",
          role: "undo",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "undo",
            });
          },
        },
        {
          label: "Redo",
          accelerator: "Shift+CmdOrCtrl+Z",
          role: "redo",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "redo",
            });
          },
        },
        { type: "separator" },
        {
          label: "Cut",
          accelerator: "CmdOrCtrl+X",
          click: () => {
            // Execute native cut operation first (for text fields)
            mainWindow.webContents.cut();
            // Also send IPC event for custom handling (e.g., node cutting)
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "cut",
            });
          },
        },
        {
          label: "Copy",
          accelerator: "CmdOrCtrl+C",
          click: () => {
            // Execute native copy operation first (for text fields)
            mainWindow.webContents.copy();
            // Also send IPC event for custom handling (e.g., node copying)
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "copy",
            });
          },
        },
        {
          label: "Paste",
          accelerator: "CmdOrCtrl+V",
          click: () => {
            // Execute native paste operation first (for text fields)
            mainWindow.webContents.paste();
            // Also send IPC event for custom handling (e.g., node pasting)
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "paste",
            });
          },
        },
        {
          label: "Duplicate",
          accelerator: "CmdOrCtrl+D",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "duplicate",
            });
          },
        },
        {
          label: "Duplicate Vertical",
          accelerator: "CmdOrCtrl+Shift+D",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "duplicateVertical",
            });
          },
        },
        {
          label: "Group",
          accelerator: "CmdOrCtrl+G",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "group",
            });
          },
        },
        {
          label: "Select All",
          accelerator: "CmdOrCtrl+A",
          role: "selectAll",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "selectAll",
            });
          },
        },
        { type: "separator" },
        {
          label: "Align",
          accelerator: "CmdOrCtrl+A",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "align",
            });
          },
        },
        {
          label: "Align with Spacing",
          accelerator: "Shift+CmdOrCtrl+A",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "alignWithSpacing",
            });
          },
        },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Fit View",
          accelerator: "CmdOrCtrl+0",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "fitView",
            });
          },
        },
        { type: "separator" },
        {
          label: "Reset Zoom",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "resetZoom",
            });
          },
        },
        {
          label: "Zoom In",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "zoomIn",
            });
          },
        },
        {
          label: "Zoom Out",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "zoomOut",
            });
          },
        },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Tools",
      submenu: [
        {
          label: "Package Manager",
          click: () => createPackageManagerWindow(),
        },
        {
          label: "Log Viewer",
          click: () => createLogViewerWindow(),
        },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }],
    },
    {
      role: "help",
      submenu: [
        {
          label: "Learn More",
          click: async () => {
            await shell.openExternal("https://nodetool.ai");
          },
        },
        { type: "separator" },
        {
          label: "System Information",
          click: async () => {
            await showSystemInfoDialog();
          },
        },
      ],
    },
  ]);

  Menu.setApplicationMenu(menu);
};

/**
 * Shows a native dialog with system information
 */
async function showSystemInfoDialog(): Promise<void> {
  const mainWindow = getMainWindow();
  
  try {
    const info = await getSystemInfo();
    
    const message = `NodeTool ${info.appVersion}

Application
  Electron: ${info.electronVersion}
  Chrome: ${info.chromeVersion}
  Node.js: ${info.nodeVersion}

Operating System
  OS: ${info.os}
  Version: ${info.osVersion}
  Architecture: ${info.arch}

Installation Paths
  Application: ${info.installPath}
  Conda Environment: ${info.condaEnvPath}
  Data: ${info.dataPath}
  Logs: ${info.logsPath}

Features & Versions
  Python: ${info.pythonVersion || "Not available"}
  CUDA: ${info.cudaAvailable ? (info.cudaVersion || "Available") : "Not available"}
  Ollama: ${info.ollamaInstalled ? (info.ollamaVersion || "Installed") : "Not installed"}
  Llama Server: ${info.llamaServerInstalled ? (info.llamaServerVersion || "Installed") : "Not installed"}`;

    const dialogOptions = {
      type: "info" as const,
      title: "System Information",
      message: `NodeTool ${info.appVersion}`,
      detail: message,
      buttons: ["OK", "Copy to Clipboard"],
    };

    const showDialog = mainWindow 
      ? dialog.showMessageBox(mainWindow, dialogOptions)
      : dialog.showMessageBox(dialogOptions);
    
    const result = await showDialog;
    if (result.response === 1) {
      // Copy to clipboard
      clipboard.writeText(message);
    }
  } catch (error) {
    dialog.showErrorBox("Error", `Failed to gather system information: ${error}`);
  }
}

export { buildMenu };
