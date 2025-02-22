import { BrowserWindow, screen } from "electron";
import path from "path";
import { baseUrl } from "./workflowWindow";

export function createChatOverlayWindow(): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } =
    primaryDisplay.workAreaSize;

  const windowWidth = 600;
  const windowHeight = 400;

  const chatOverlayWindow = new BrowserWindow({
    frame: false,
    titleBarStyle: "hidden",
    transparent: true,
    width: windowWidth,
    height: windowHeight,
    x: (screenWidth - windowWidth) / 2,
    y: screenHeight - windowHeight,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload-workflow.js"),
    },
  });
  // chatOverlayWindow.webContents.openDevTools();
  chatOverlayWindow.loadURL(`${baseUrl}?chat=true`);

  return chatOverlayWindow;
}
