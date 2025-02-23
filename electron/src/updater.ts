import { app } from "electron";
import { autoUpdater, ProgressInfo, UpdateInfo } from "electron-updater";
import log from "electron-log";
import { logMessage } from "./logger";
import { getMainWindow } from "./state";
import { IpcChannels } from "./types.d";

let updateAvailable: boolean = false;

/**
 * Auto-updater Module
 *
 * This module handles automatic updates for the Nodetool application using electron-updater.
 * It connects to GitHub releases to check for and download new versions of the application.
 *
 * Key Features:
 * - Automatically checks for updates when the app starts
 * - Downloads updates in the background
 * - Notifies the user through the main window when updates are available
 * - Provides download progress information
 * - Handles update errors gracefully
 *
 * Update Process:
 * 1. Checks GitHub releases for new versions
 * 2. If an update is found, notifies the user with the new version and release URL
 * 3. Downloads the update in the background, showing progress
 * 4. Once downloaded, notifies the user that the update is ready
 *
 * Configuration:
 * - Updates are only checked in packaged mode (not in development)
 * - Updates are fetched from the nodetool-ai/nodetool GitHub repository
 * - Update cache is stored in "nodetool-updater" directory
 */

/**
 * Sets up the auto-updater
 */
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

/**
 * Sets up the auto-updater events
 */
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
        mainWindow.webContents.send(IpcChannels.UPDATE_AVAILABLE, {
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
        mainWindow.webContents.send(IpcChannels.UPDATE_PROGRESS, progress);
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
        mainWindow.webContents.send(IpcChannels.UPDATE_AVAILABLE, info);
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
