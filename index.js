const { app, log, dialog } = require("electron");

app.on("ready", async () => {
  log("Electron app is ready");
  createWindow();
  try {
    emitBootMessage("Checking for updates...");
    await checkForUpdates();
    emitBootMessage("Starting Nodetool...");
    await startServer();
  } catch (error) {
    log(`Error during startup: ${error.message}`, "error");
    dialog.showErrorBox(
      "Startup Error",
      `An error occurred during startup: ${error.message}`
    );
    app.quit();
  }
});
