const { app } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const { logMessage } = require('./logger');
const { getMainWindow } = require('./window');
const path = require('path');
const fs = require('fs').promises;
const { ipcMain } = require('electron');

let updateAvailable = false;

function setupAutoUpdater() {
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

  autoUpdater.checkForUpdates().catch(err => {
    logMessage(`Failed to check for updates: ${err.message}`, "warn");
  });

  setupAutoUpdaterEvents();
}

function setupAutoUpdaterEvents() {
  autoUpdater.on("checking-for-update", () => {
    logMessage("Checking for updates...");
  });

  autoUpdater.on("update-available", (info) => {
    try {
      logMessage(`Update available: ${info.version}`);
      updateAvailable = true;
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send("update-available", info);
      }
    } catch (err) {
      logMessage(`Error handling update-available event: ${err.message}`, "error");
    }
  });

  autoUpdater.on("update-not-available", () => {
    logMessage("No updates available");
  });

  autoUpdater.on("download-progress", (progress) => {
    try {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send("update-progress", progress);
      }
    } catch (err) {
      logMessage(`Error handling download progress: ${err.message}`, "error");
    }
  });

  autoUpdater.on("update-downloaded", async (info) => {
    try {
      logMessage(`Update downloaded: ${info.version}`);

      // Create flag file to trigger Python environment update after restart
      try {
        await fs.promises.writeFile(
          path.join(app.getPath("userData"), "update-conda-env"),
          "true"
        );
        logMessage("Python environment update flagged for next startup");
      } catch (error) {
        logMessage(`Error creating update flag: ${error.message}`, "error");
      }

      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send("update-downloaded", info);
      }
    } catch (err) {
      logMessage(`Error handling update-downloaded event: ${err.message}`, "error");
    }
  });

  autoUpdater.on("error", (err) => {
    logMessage(`Update error: ${err.message}`, "error");
    try {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send("update-error", {
          message: "Failed to check for updates. Please try again later.",
          details: err.message
        });
      }
    } catch (sendErr) {
      logMessage(`Error sending update error to window: ${sendErr.message}`, "error");
    }
  });
}

// Handle requests to install updates
ipcMain.handle("install-update", async () => {
  try {
    if (updateAvailable) {
      await autoUpdater.quitAndInstall(false, true);
    }
  } catch (err) {
    logMessage(`Failed to install update: ${err.message}`, "error");
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send("update-error", {
        message: "Failed to install update. Please try again later.",
        details: err.message
      });
    }
    throw err;
  }
});

module.exports = {
  setupAutoUpdater,
  isUpdateAvailable: () => updateAvailable
}; 