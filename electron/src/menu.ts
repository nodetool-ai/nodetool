import { Menu, shell } from "electron";
import { IpcChannels } from "./types.d";
import { getMainWindow } from "./state";

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
          role: "cut",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "cut",
            });
          },
        },
        {
          label: "Copy",
          accelerator: "CmdOrCtrl+C",
          role: "copy",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "copy",
            });
          },
        },
        {
          label: "Paste",
          accelerator: "CmdOrCtrl+V",
          role: "paste",
          click: () => {
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
      ],
    },
  ]);

  Menu.setApplicationMenu(menu);
};

export { buildMenu };
