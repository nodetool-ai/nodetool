import { app } from "electron";
import { autoUpdater, ProgressInfo, UpdateInfo } from "electron-updater";
import log from "electron-log";
import { logMessage } from "./logger";
import { getMainWindow } from "./state";

let updateAvailable: boolean = false;

function setupAutoUpdater(): void {
  if (!app.isPackaged) {
    logMessage("Skipping auto-updater in development mode");
    return;
  }

  autoUpdater.setFeedURL({
    provider: "github",
    owner: "nodetool-ai",
    repo: "nodetool",
    updaterCacheDirName: "nodetool-updater",
  });

  autoUpdater.logger = log;

  autoUpdater.checkForUpdates().catch((err: Error) => {
    logMessage(`Failed to check for updates: ${err.message}`, "warn");
  });

  setupAutoUpdaterEvents();
}

function setupAutoUpdaterEvents(): void {
  autoUpdater.on("checking-for-update", () => {
    logMessage("Checking for updates...");
  });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    try {
      logMessage(`Update available: ${info.version}`);
      updateAvailable = true;
      const mainWindow = getMainWindow();
      if (mainWindow) {
        const releaseUrl = `https://github.com/nodetool-ai/nodetool/releases/tag/v${info.version}`;
        mainWindow.webContents.send("update-available", {
          version: info.version,
          releaseUrl,
        });
      }
    } catch (err) {
      logMessage(
        `Error handling update-available event: ${(err as Error).message}`,
        "error"
      );
    }
  });

  autoUpdater.on("update-not-available", () => {
    logMessage("No updates available");
  });

  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    try {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send("update-progress", progress);
      }
    } catch (err) {
      logMessage(
        `Error handling download progress: ${(err as Error).message}`,
        "error"
      );
    }
  });

  autoUpdater.on("update-downloaded", async (info: UpdateInfo) => {
    try {
      logMessage(`Update downloaded: ${info.version}`);

      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send("update-downloaded", info);
      }
    } catch (err) {
      logMessage(
        `Error handling update-downloaded event: ${(err as Error).message}`,
        "error"
      );
    }
  });

  autoUpdater.on("error", (err: Error) => {
    logMessage(`Update error: ${err.message}`, "error");
    try {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send("update-error", {
          message: "Failed to check for updates. Please try again later.",
          details: err.message,
        });
      }
    } catch (sendErr) {
      logMessage(
        `Error sending update error to window: ${(sendErr as Error).message}`,
        "error"
      );
    }
  });
}

const isUpdateAvailable = () => updateAvailable;

export { setupAutoUpdater, isUpdateAvailable };
